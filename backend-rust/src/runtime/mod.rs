//! Remote core: metadata selection and decisions only, never business handlers.
mod json;
mod selection;
mod store;
mod validation;
use axum::{
    Json, Router,
    body::to_bytes,
    extract::{Request, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{any, get},
};
use chrono::{DateTime, SecondsFormat, Utc};
use json::digest;
pub use json::{canonical, strict_json};
pub use selection::choice;
use selection::{Selector, retrieve};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use store::{Binding, Store, finish, load, persist, scope};
use tokio::sync::Semaphore;
use uuid::Uuid;

#[derive(Debug)]
pub struct Failure {
    status: u16,
    code: &'static str,
}
impl std::fmt::Display for Failure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.code)
    }
}
impl std::error::Error for Failure {}
fn bad(status: u16, code: &'static str) -> Failure {
    Failure { status, code }
}
fn internal<T>(_: T) -> Failure {
    bad(500, "INTERNAL_ERROR")
}
fn text<'a>(v: &'a Value, key: &str) -> Result<&'a str, Failure> {
    v[key].as_str().ok_or(bad(400, "INVALID_REQUEST"))
}
fn stamp(now: DateTime<Utc>) -> String {
    now.to_rfc3339_opts(SecondsFormat::AutoSi, true)
}
fn timestamp(v: &Value, key: &str) -> Result<DateTime<Utc>, Failure> {
    DateTime::parse_from_rfc3339(text(v, key)?)
        .map(|v| v.with_timezone(&Utc))
        .map_err(internal)
}
fn identifier(v: &str) -> bool {
    !v.is_empty()
        && v.len() <= 128
        && v.as_bytes()[0].is_ascii_alphanumeric()
        && v.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._:-".contains(&b))
}
fn version(v: &str) -> bool {
    v.len() == 64
        && v.bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn idem(v: &str) -> bool {
    v.len() >= 16
        && v.len() <= 128
        && v.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._:-".contains(&b))
}
fn header<'a>(h: &'a HeaderMap, key: &str) -> &'a str {
    h.get(key).and_then(|v| v.to_str().ok()).unwrap_or("")
}

pub struct Core {
    store: Store,
    selector: Selector,
    wire: HashMap<String, jsonschema::Validator>,
    api: Value,
    cache: Mutex<HashMap<String, Arc<jsonschema::Validator>>>,
    global: Semaphore,
    scopes: Mutex<HashMap<String, Arc<Semaphore>>>,
}
impl Core {
    pub async fn new(
        database: &str,
        pepper: &str,
        jev_url: String,
        jev_key: String,
        model: String,
        connect_ms: u64,
        selector_mode: String,
    ) -> Result<Arc<Self>, Failure> {
        let store = Store::new(database, pepper).await?;
        let selector = Selector::new(jev_url, jev_key, model, connect_ms, selector_mode)?;
        let api: Value =
            serde_json::from_str(include_str!("../../../shared/schemas/api.schema.json"))
                .map_err(internal)?;
        let mut wire = HashMap::new();
        let defs = api["$defs"].as_object().ok_or(internal("schema"))?;
        for name in defs.keys() {
            let mut schema = api.clone();
            schema["$ref"] = json!(format!("#/$defs/{name}"));
            wire.insert(
                name.clone(),
                jsonschema::options()
                    .with_draft(jsonschema::Draft::Draft202012)
                    .should_validate_formats(true)
                    .build(&schema)
                    .map_err(internal)?,
            );
        }
        Ok(Arc::new(Self {
            store,
            selector,
            wire,
            api,
            cache: Mutex::new(HashMap::new()),
            global: Semaphore::new(128),
            scopes: Mutex::new(HashMap::new()),
        }))
    }
    pub fn router(self: Arc<Self>) -> Router {
        Router::new()
            .route(
                "/health/live",
                get(|| async { Json(json!({"status":"ok"})) }),
            )
            .route("/health/ready", get(ready))
            .route("/v1/{*path}", any(handle))
            .with_state(self)
    }
    fn schema(&self, b: &Binding, input: &Value) -> Result<Arc<jsonschema::Validator>, Failure> {
        let key = format!("{}:{}", b.scope, digest(input).map_err(internal)?);
        if let Some(compiled) = self.cache.lock().map_err(internal)?.get(&key) {
            return Ok(compiled.clone());
        };
        let compiled =
            Arc::new(validation::compile(input).map_err(|_| bad(422, "SCHEMA_UNSUPPORTED"))?);
        let mut cache = self.cache.lock().map_err(internal)?;
        if cache.len() >= 256 {
            cache.clear()
        };
        cache.insert(key, compiled.clone());
        Ok(compiled)
    }
    fn check(&self, name: &str, value: &Value) -> Result<(), Failure> {
        if self.wire.get(name).is_none_or(|v| !v.is_valid(value)) {
            return Err(bad(400, "INVALID_REQUEST"));
        };
        Ok(())
    }
    fn selected(&self, tool: &Value) -> Result<Value, Failure> {
        let mut result = json!({});
        for key in [
            "tool_id",
            "name",
            "title",
            "description",
            "effect",
            "open_world",
            "input_schema",
        ] {
            result[key] = tool[key].clone()
        }
        result["schema_digest"] = json!(digest(&tool["input_schema"]).map_err(internal)?);
        Ok(result)
    }
    fn ready(
        &self,
        b: &Binding,
        mut view: Value,
        tool: &Value,
        args: &Value,
    ) -> Result<Value, Failure> {
        let compiled = self.schema(b, &tool["input_schema"])?;
        let (issues, missing) = validation::validate(&compiled, args);
        let map = view.as_object_mut().ok_or(internal("view"))?;
        for field in [
            "candidates",
            "reason",
            "message_key",
            "issues",
            "missing_paths",
            "arguments_digest",
        ] {
            map.remove(field);
        }
        view["selected_tool"] = self.selected(tool)?;
        view["next_tool"] = json!(if tool["effect"] == "read" {
            "execute_read_action"
        } else {
            "execute_write_action"
        });
        if issues.is_empty() {
            view["status"] = json!("ready");
            view["arguments_digest"] = json!(digest(args).map_err(internal)?)
        } else {
            view["status"] = json!("needs_arguments");
            view["issues"] = json!(issues);
            view["missing_paths"] = json!(missing)
        };
        Ok(view)
    }
    async fn prepare(
        &self,
        b: &Binding,
        r: &Value,
        metrics: &mut selection::SelectionMetrics,
    ) -> Result<Value, Failure> {
        let cat = self
            .store
            .catalog(b, text(r, "catalog_id")?, text(r, "catalog_version")?)
            .await?;
        let tools = cat["tools"].as_array().ok_or(internal("catalog"))?;
        let allowed = r["actor"]["allowed_tool_ids"]
            .as_array()
            .ok_or(bad(400, "INVALID_REQUEST"))?;
        for id in allowed {
            if !tools.iter().any(|t| &t["tool_id"] == id) {
                return Err(bad(400, "INVALID_REQUEST"));
            }
        }
        let mut view = json!({"operation_id":Uuid::new_v4().to_string(),"revision":1,"catalog_id":r["catalog_id"],"catalog_version":r["catalog_version"],"expires_at":stamp(Utc::now()+chrono::Duration::minutes(15)),"status":"no_match","reason":"no_authorized_tools","message_key":"toolgate.no_match.refine_intent"});
        if allowed.is_empty() {
            return Ok(view);
        };
        if !b.external {
            return Err(bad(503, "DATA_PROCESSING_NOT_CONFIGURED"));
        };
        let intent = text(r, "intent")?;
        let context = r["context_summary"].as_str().unwrap_or("");
        let candidates = retrieve(tools, &r["actor"], intent, context)?;
        let (tool, choices, reason) = self
            .selector
            .select(&candidates, intent, context, metrics)
            .await?;
        if let Some(tool) = tool {
            return self.ready(b, view, &tool, &r["known_arguments"]);
        };
        view["reason"] = json!(reason);
        if !choices.is_empty() {
            view["status"] = json!("needs_choice");
            view["candidates"] = json!(choices);
            view["next_tool"] = json!("prepare_action");
            view.as_object_mut()
                .ok_or(internal("view"))?
                .remove("message_key");
        };
        Ok(view)
    }
    async fn process(
        &self,
        request: Request,
        metrics: &mut selection::SelectionMetrics,
    ) -> Result<(u16, Value), Failure> {
        let _global = self
            .global
            .try_acquire()
            .map_err(|_| bad(503, "SERVICE_UNAVAILABLE"))?;
        let (parts, body) = request.into_parts();
        let method = parts.method.as_str();
        let path = parts.uri.path();
        let headers = &parts.headers;
        let binding = self.store.auth(header(headers, "authorization")).await?;
        if header(headers, "x-toolgate-contract") != "0.1" {
            return Err(bad(409, "CONTRACT_VERSION_UNSUPPORTED"));
        }
        let limiter = {
            let mut scopes = self.scopes.lock().map_err(internal)?;
            scopes
                .entry(binding.scope.clone())
                .or_insert_with(|| Arc::new(Semaphore::new(16)))
                .clone()
        };
        let _permit = limiter
            .try_acquire()
            .map_err(|_| bad(429, "RATE_LIMITED"))?;
        {
            let mut c = self.store.connection().await?;
            let tx = c.transaction().await.map_err(internal)?;
            scope(&tx, &binding).await?;
            let row=tx.query_one("INSERT INTO tg.quota_windows(scope_id,window_start,used) VALUES($1,date_trunc('minute',clock_timestamp()),1) ON CONFLICT(scope_id,window_start) DO UPDATE SET used=tg.quota_windows.used+1 RETURNING used",&[&binding.scope]).await.map_err(internal)?;
            let used: i32 = row.try_get(0).map_err(internal)?;
            tx.commit().await.map_err(internal)?;
            if used > 600 {
                return Err(bad(429, "QUOTA_EXCEEDED"));
            }
        }
        let segments = path.trim_matches('/').split('/').collect::<Vec<_>>();
        let catalog = segments.len() == 5 && segments[1] == "catalogs" && segments[3] == "versions";
        let required = if catalog {
            if method == "PUT" {
                "catalog:write"
            } else {
                "catalog:read"
            }
        } else {
            "runtime"
        };
        if !binding.scopes.iter().any(|s| s == required) {
            return Err(bad(403, "INSUFFICIENT_SCOPE"));
        }
        if path == "/v1/capabilities" && method == "GET" {
            let mut result = json!({});
            for (key, spec) in self.api["$defs"]["Capabilities"]["properties"]
                .as_object()
                .ok_or(internal("schema"))?
            {
                result[key] = if let Some(value) = spec.get("const") {
                    value.clone()
                } else {
                    json!(["tg-jsonschema-1"])
                };
            }
            return Ok((200, result));
        }
        if catalog && method == "GET" {
            if !identifier(segments[2]) || !version(segments[4]) {
                return Err(bad(400, "INVALID_REQUEST"));
            };
            return Ok((
                200,
                self.store
                    .catalog(&binding, segments[2], segments[4])
                    .await?,
            ));
        }
        if header(headers, "content-type").split(';').next() != Some("application/json")
            || !header(headers, "content-encoding").is_empty()
        {
            return Err(bad(400, "INVALID_REQUEST"));
        };
        let limit = if catalog && method == "PUT" {
            16777216
        } else {
            262144
        };
        let bytes = to_bytes(body, limit)
            .await
            .map_err(|_| bad(413, "PAYLOAD_TOO_LARGE"))?;
        let value = strict_json(&bytes).map_err(|_| bad(400, "INVALID_JSON"))?;
        if catalog && method == "PUT" {
            if !identifier(segments[2]) || !version(segments[4]) {
                return Err(bad(400, "INVALID_REQUEST"));
            };
            self.check("CatalogUpload", &value)
                .map_err(|_| bad(422, "CATALOG_INVALID"))?;
            let hash = digest(&value).map_err(internal)?;
            if hash != segments[4] {
                return Err(bad(422, "HASH_MISMATCH"));
            };
            let tools = value["tools"]
                .as_array()
                .ok_or(bad(422, "CATALOG_INVALID"))?;
            let mut previous = "";
            for tool in tools {
                let id = text(tool, "tool_id")?;
                if id <= previous {
                    return Err(bad(422, "CATALOG_INVALID"));
                };
                previous = id;
                self.schema(&binding, &tool["input_schema"])?;
                if let Some(output) = tool.get("output_schema") {
                    validation::compile(output).map_err(|_| bad(422, "SCHEMA_UNSUPPORTED"))?;
                }
            }
            let info = json!({"catalog_id":segments[2],"catalog_version":hash,"tool_count":tools.len(),"schema_profile":"tg-jsonschema-1","created_at":stamp(Utc::now())});
            let canonical = canonical(&value).map_err(internal)?;
            let mut c = self.store.connection().await?;
            let tx = c.transaction().await.map_err(internal)?;
            scope(&tx, &binding).await?;
            tx.execute("INSERT INTO tg.catalogs(scope_id,catalog_id,version,body,canonical_body,info) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",&[&binding.scope,&segments[2],&hash,&value,&canonical,&info]).await.map_err(internal)?;
            let row=tx.query_one("SELECT canonical_body,info FROM tg.catalogs WHERE scope_id=$1 AND catalog_id=$2 AND version=$3",&[&binding.scope,&segments[2],&hash]).await.map_err(internal)?;
            let old: String = row.try_get(0).map_err(internal)?;
            if old != canonical {
                return Err(bad(409, "CATALOG_IMMUTABLE"));
            };
            let result = row.try_get(1).map_err(internal)?;
            tx.commit().await.map_err(internal)?;
            return Ok((200, result));
        }
        if method != "POST"
            || segments.len() < 2
            || (segments[1] != "operations" && path != "/v1/workflows")
        {
            return Err(bad(400, "INVALID_REQUEST"));
        }
        let (action, id, schema) = if path == "/v1/workflows" {
            ("workflow", "", "WorkflowRequest")
        } else if segments.len() == 2 {
            ("prepare", "", "PrepareRequest")
        } else if segments.len() == 4 && Uuid::parse_str(segments[2]).is_ok() {
            let schema = match segments[3] {
                "resolve" => "ResolveRequest",
                "execution-decisions" => "DecisionRequest",
                "inspect" => "InspectRequest",
                "cancel" => "CancelRequest",
                "receipts" => "ReceiptRequest",
                _ => return Err(bad(400, "INVALID_REQUEST")),
            };
            (segments[3], segments[2], schema)
        } else {
            return Err(bad(400, "INVALID_REQUEST"));
        };
        self.check(schema, &value)?;
        let actor = &value["actor"];
        if action != "prepare" && action != "workflow" {
            let mut c = self.store.connection().await?;
            let tx = c.transaction().await.map_err(internal)?;
            scope(&tx, &binding).await?;
            let (view, _, expires) = load(&tx, &binding, actor, id, false).await?;
            if action != "receipts" && expires <= Utc::now() {
                return Err(bad(410, "OPERATION_EXPIRED"));
            };
            if action == "inspect" {
                if view["status"] == "needs_choice" {
                    let candidates = view["candidates"].as_array().ok_or(internal("view"))?;
                    if candidates.iter().any(|c| {
                        !actor["allowed_tool_ids"]
                            .as_array()
                            .is_some_and(|a| a.contains(&c["tool_id"]))
                    }) {
                        return Err(bad(403, "TOOL_NOT_ALLOWED"));
                    }
                };
                tx.commit().await.map_err(internal)?;
                return Ok((200, view));
            };
            tx.commit().await.map_err(internal)?;
        }
        let key = header(headers, "idempotency-key");
        if !idem(key) {
            return Err(bad(400, "INVALID_REQUEST"));
        };
        let hash = self.store.hash(&format!("{method} {path}"), &value)?;
        let claim = self
            .store
            .reserve(&binding, actor, path, key, &hash)
            .await?;
        match text(&claim, "state")? {
            "conflict" => return Err(bad(409, "IDEMPOTENCY_CONFLICT")),
            "processing" => return Err(bad(409, "REQUEST_IN_PROGRESS")),
            "replay" => {
                return Ok((
                    claim["status"].as_u64().ok_or(internal("claim"))? as u16,
                    claim["response"].clone(),
                ));
            }
            "owned" => {}
            _ => return Err(internal("claim")),
        };
        let fence = text(&claim, "fence")?;
        let result = if action == "workflow" {
            self.finish_workflow(
                &binding,
                &value,
                store::Reservation { path, key, fence },
                metrics,
            )
            .await
        } else if action == "prepare" {
            self.finish_prepare(&binding, &value, path, key, fence, metrics)
                .await
        } else {
            self.mutate(
                &binding,
                &value,
                id,
                action,
                store::Reservation { path, key, fence },
            )
            .await
        };
        // A dropped request leaves only an expiring fenced reservation, never a handler.
        if result.is_err() {
            let _cleanup = self.store.release(&binding, actor, path, key, fence).await;
        }
        result
    }
    async fn finish_workflow(
        &self,
        b: &Binding,
        r: &Value,
        reservation: store::Reservation<'_>,
        metrics: &selection::SelectionMetrics,
    ) -> Result<(u16, Value), Failure> {
        let cat = self
            .store
            .catalog(b, text(r, "catalog_id")?, text(r, "catalog_version")?)
            .await?;
        let tools = cat["tools"].as_array().ok_or(internal("catalog"))?;
        let allowed = r["actor"]["allowed_tool_ids"]
            .as_array()
            .ok_or(bad(400, "INVALID_REQUEST"))?;
        if allowed
            .iter()
            .any(|id| !tools.iter().any(|t| &t["tool_id"] == id))
        {
            return Err(bad(400, "INVALID_REQUEST"));
        }
        if !allowed.is_empty() && !b.external {
            return Err(bad(503, "DATA_PROCESSING_NOT_CONFIGURED"));
        }
        let candidates = retrieve(tools, &r["actor"], text(r, "intent")?, "")?;
        let limit = r["exposure_limit"].as_u64().map(|n| n as usize);
        let indices = |subset: &[Value]| {
            subset
                .iter()
                .filter_map(|t| tools.iter().position(|c| c["tool_id"] == t["tool_id"]))
                .collect::<Vec<_>>()
        };
        if limit.is_some() {
            metrics.set_workflow_trace(json!({"catalog_version":r["catalog_version"],"retrieved":indices(&candidates),"included":null,"exposed":null}));
        }
        let mut selected = self
            .selector
            .workflow(&candidates, text(r, "intent")?, metrics)
            .await?;
        selected.sort_by(|a, b| a["tool_id"].as_str().cmp(&b["tool_id"].as_str()));
        if let Some(limit) = limit {
            let included = indices(&selected);
            selected.truncate(limit);
            metrics.set_workflow_trace(json!({"catalog_version":r["catalog_version"],"retrieved":indices(&candidates),"included":included,"exposed":indices(&selected)}));
        }
        let status = if selected.is_empty() {
            "no_match"
        } else if selected.len() > 8 {
            "needs_refinement"
        } else {
            "prepared"
        };
        let mut operations = Vec::new();
        if status == "prepared" {
            for tool in selected {
                let view = json!({"operation_id":Uuid::new_v4().to_string(),"revision":1,"catalog_id":r["catalog_id"],"catalog_version":r["catalog_version"],"expires_at":stamp(Utc::now()+chrono::Duration::minutes(15))});
                operations.push(self.ready(b, view, &tool, &json!({}))?);
            }
        }
        let result =
            json!({"status":status,"candidate_count":candidates.len(),"operations":operations});
        if serde_json::to_vec(&result).map_err(internal)?.len() > 262144 {
            return Err(bad(413, "PAYLOAD_TOO_LARGE"));
        }
        let mut c = self.store.connection().await?;
        let tx = c.transaction().await.map_err(internal)?;
        scope(&tx, b).await?;
        for op in &operations {
            persist(&tx, b, &r["actor"], op, true).await?;
        }
        finish(&tx, b, &r["actor"], reservation, 201, &result).await?;
        tx.commit().await.map_err(internal)?;
        Ok((201, result))
    }
    async fn finish_prepare(
        &self,
        b: &Binding,
        r: &Value,
        path: &str,
        key: &str,
        fence: &str,
        metrics: &mut selection::SelectionMetrics,
    ) -> Result<(u16, Value), Failure> {
        let view = self.prepare(b, r, metrics).await?;
        let mut c = self.store.connection().await?;
        let tx = c.transaction().await.map_err(internal)?;
        scope(&tx, b).await?;
        persist(&tx, b, &r["actor"], &view, true).await?;
        finish(
            &tx,
            b,
            &r["actor"],
            store::Reservation { path, key, fence },
            201,
            &view,
        )
        .await?;
        tx.commit().await.map_err(internal)?;
        Ok((201, view))
    }
    async fn mutate(
        &self,
        b: &Binding,
        r: &Value,
        id: &str,
        action: &str,
        reservation: store::Reservation<'_>,
    ) -> Result<(u16, Value), Failure> {
        let mut c = self.store.connection().await?;
        let tx = c.transaction().await.map_err(internal)?;
        scope(&tx, b).await?;
        let actor = &r["actor"];
        let (mut view, allowed, expires) = load(&tx, b, actor, id, true).await?;
        let now = Utc::now();
        if action != "receipts" && expires <= now {
            return Err(bad(410, "OPERATION_EXPIRED"));
        }
        let response = match action {
            "cancel" => {
                if view["status"] == "decision_issued" {
                    return Err(bad(409, "CANNOT_CANCEL_ISSUED"));
                };
                if !matches!(
                    text(&view, "status")?,
                    "ready" | "needs_arguments" | "needs_choice"
                ) {
                    return Err(bad(409, "OPERATION_STATE_INVALID"));
                };
                if view["revision"] != r["expected_revision"] {
                    return Err(bad(409, "REVISION_CONFLICT"));
                };
                view = store::cancelled(&view);
                view.clone()
            }
            "resolve" => {
                if view["status"] != "needs_choice" {
                    return Err(bad(409, "OPERATION_STATE_INVALID"));
                };
                if view["revision"] != r["expected_revision"] {
                    return Err(bad(409, "REVISION_CONFLICT"));
                };
                let selected = &r["tool_choice"];
                if !view["candidates"]
                    .as_array()
                    .is_some_and(|cs| cs.iter().any(|c| &c["tool_id"] == selected))
                {
                    return Err(bad(400, "INVALID_REQUEST"));
                };
                if !actor["allowed_tool_ids"]
                    .as_array()
                    .is_some_and(|a| a.contains(selected))
                    || !allowed.as_array().is_some_and(|a| a.contains(selected))
                {
                    return Err(bad(403, "TOOL_NOT_ALLOWED"));
                };
                let row=tx.query_one("SELECT body FROM tg.catalogs WHERE scope_id=$1 AND catalog_id=$2 AND version=$3",&[&b.scope,&text(&view,"catalog_id")?,&text(&view,"catalog_version")?]).await.map_err(internal)?;
                let catalog: Value = row.try_get(0).map_err(internal)?;
                let tool = catalog["tools"]
                    .as_array()
                    .and_then(|a| a.iter().find(|t| &t["tool_id"] == selected))
                    .ok_or(internal("catalog"))?;
                view["revision"] =
                    json!(view["revision"].as_i64().ok_or(internal("revision"))? + 1);
                view = self.ready(b, view, tool, &r["arguments"])?;
                view.clone()
            }
            "execution-decisions" => {
                let hash = digest(&r["arguments"]).map_err(internal)?;
                if view["status"] == "decision_issued" {
                    if view["decision"]["arguments_digest"] != hash {
                        return Err(bad(409, "OPERATION_ALREADY_ISSUED"));
                    };
                    if timestamp(&view["decision"], "not_after")? <= now {
                        return Err(bad(410, "DECISION_EXPIRED"));
                    };
                    json!({"status":"decision_issued","decision":view["decision"]})
                } else {
                    if !matches!(text(&view, "status")?, "ready" | "needs_arguments") {
                        return Err(bad(409, "OPERATION_STATE_INVALID"));
                    };
                    if view["revision"] != r["expected_revision"] {
                        return Err(bad(409, "REVISION_CONFLICT"));
                    };
                    let selected = view["selected_tool"].clone();
                    let compiled = self.schema(b, &selected["input_schema"])?;
                    let (issues, missing) = validation::validate(&compiled, &r["arguments"]);
                    view["revision"] =
                        json!(view["revision"].as_i64().ok_or(internal("revision"))? + 1);
                    if !issues.is_empty() {
                        view["status"] = json!("needs_arguments");
                        view["issues"] = json!(issues);
                        view["missing_paths"] = json!(missing);
                        view.as_object_mut()
                            .ok_or(internal("view"))?
                            .remove("arguments_digest");
                        view.clone()
                    } else {
                        let expiry = (now + chrono::Duration::seconds(60)).min(expires);
                        if (expiry - now).num_milliseconds() < 1000 {
                            return Err(bad(410, "DECISION_EXPIRED"));
                        };
                        let decision = json!({"decision_id":Uuid::new_v4().to_string(),"operation_id":view["operation_id"],"operation_revision":view["revision"],"catalog_id":view["catalog_id"],"catalog_version":view["catalog_version"],"tool_id":selected["tool_id"],"schema_digest":selected["schema_digest"],"arguments_digest":hash,"effect":selected["effect"],"execution_key":Uuid::new_v4().to_string(),"issued_at":stamp(now),"not_after":stamp(expiry)});
                        view["status"] = json!("decision_issued");
                        view["decision"] = decision.clone();
                        let fields = view.as_object_mut().ok_or(internal("view"))?;
                        for f in ["arguments_digest", "issues", "missing_paths", "next_tool"] {
                            fields.remove(f);
                        }
                        json!({"status":"decision_issued","decision":decision})
                    }
                }
            }
            "receipts" => {
                if view["decision"].is_null() || view["decision"]["decision_id"] != r["decision_id"]
                {
                    return Err(bad(400, "INVALID_REQUEST"));
                };
                if now > timestamp(&view["decision"], "issued_at")? + chrono::Duration::hours(24) {
                    return Err(bad(410, "DECISION_EXPIRED"));
                };
                let mut receipt = json!({"outcome":r["outcome"],"duration_ms":r["duration_ms"]});
                if let Some(code) = r.get("error_code") {
                    receipt["error_code"] = code.clone()
                };
                tx.execute("INSERT INTO tg.receipts(scope_id,decision_id,body) VALUES($1,$2::text::uuid,$3) ON CONFLICT DO NOTHING",&[&b.scope,&text(r,"decision_id")?,&receipt]).await.map_err(internal)?;
                let row=tx.query_one("SELECT body FROM tg.receipts WHERE scope_id=$1 AND decision_id=$2::text::uuid",&[&b.scope,&text(r,"decision_id")?]).await.map_err(internal)?;
                let old: Value = row.try_get(0).map_err(internal)?;
                if old["outcome"] != r["outcome"] {
                    return Err(bad(409, "RECEIPT_CONFLICT"));
                };
                json!({"recorded":true})
            }
            _ => return Err(bad(400, "INVALID_REQUEST")),
        };
        if action != "receipts" {
            persist(&tx, b, actor, &view, false).await?
        };
        finish(&tx, b, actor, reservation, 200, &response).await?;
        tx.commit().await.map_err(internal)?;
        Ok((200, response))
    }
}
async fn ready(State(core): State<Arc<Core>>) -> Response {
    let result = core.store.connection().await;
    let (status, state) = if result.is_ok() {
        (StatusCode::OK, "ok")
    } else {
        (StatusCode::SERVICE_UNAVAILABLE, "not_ready")
    };
    (status, Json(json!({"status":state}))).into_response()
}
async fn handle(State(core): State<Arc<Core>>, request: Request) -> Response {
    let start = Instant::now();
    let request_id = Uuid::new_v4().to_string();
    let mut metrics = selection::SelectionMetrics::default();
    let result = tokio::time::timeout(Duration::from_secs(3), core.process(request, &mut metrics))
        .await
        .unwrap_or_else(|_| Err(bad(504, "DEADLINE_EXCEEDED")));
    let (status, value) = match result {
        Ok(v) => v,
        Err(error) => (
            error.status,
            json!({"error":{"code":error.code,"message_key":format!("toolgate.error.{}",error.code.to_ascii_lowercase()),"retryable":matches!(error.code,"SELECTOR_UNAVAILABLE"|"DEADLINE_EXCEEDED"),"request_id":request_id}}),
        ),
    };
    let mut response = (
        StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
        Json(value),
    )
        .into_response();
    let metrics = metrics.snapshot();
    let headers = response.headers_mut();
    if let Some(trace) = metrics.workflow_trace.as_ref()
        && let Ok(value) = trace.to_string().parse()
    {
        headers.insert("x-toolgate-workflow-trace", value);
    }
    headers.insert(
        "x-toolgate-selector-profile",
        axum::http::HeaderValue::from_static(core.selector.profile()),
    );
    if let Ok(v) = metrics.calls.to_string().parse() {
        headers.insert("x-toolgate-jev-calls", v);
    }
    if let Ok(v) = format!("{:.3}", metrics.millis).parse() {
        headers.insert("x-toolgate-jev-ms", v);
    }
    if let Ok(v) = format!("{:.3}", metrics.selector_millis).parse() {
        headers.insert("x-toolgate-selector-ms", v);
    }
    for (name, value) in [
        ("x-toolgate-jev-max-concurrent", metrics.max_concurrent),
        ("x-toolgate-jev-usage-calls", metrics.usage_calls),
        ("x-toolgate-jev-input-tokens", metrics.input_tokens),
        ("x-toolgate-jev-output-tokens", metrics.output_tokens),
    ] {
        if let Ok(v) = value.to_string().parse() {
            headers.insert(name, v);
        }
    }
    headers.insert(
        "cache-control",
        axum::http::HeaderValue::from_static("no-store"),
    );
    if let Ok(v) = request_id.parse() {
        headers.insert("x-request-id", v);
    };
    if let Ok(v) = format!("core;dur={:.3}", start.elapsed().as_secs_f64() * 1000.0).parse() {
        headers.insert("server-timing", v);
    };
    if status == 429 || status == 409 {
        headers.insert("retry-after", axum::http::HeaderValue::from_static("1"));
    };
    response
}

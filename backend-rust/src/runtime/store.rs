use super::json::canonical;
use super::{Failure, bad, internal, text};
use chrono::{DateTime, Utc};
use deadpool_postgres::{
    GenericClient, Manager, ManagerConfig, Object, Pool, RecyclingMethod, Transaction,
};
use hmac::{Hmac, KeyInit, Mac};
use serde_json::{Value, json};
use sha2::Sha256;
use std::time::Duration;
use tokio_postgres::NoTls;
use uuid::Uuid;

#[derive(Clone)]
pub(super) struct Binding {
    pub scope: String,
    pub scopes: Vec<String>,
    pub external: bool,
}
pub(super) struct Store {
    pub pool: Pool,
    pepper: Vec<u8>,
}
impl Store {
    pub async fn new(url: &str, pepper: &str) -> Result<Self, Failure> {
        if pepper.len() < 32 {
            return Err(internal("pepper"));
        };
        let config = url.parse::<tokio_postgres::Config>().map_err(internal)?;
        let manager = Manager::from_config(
            config,
            NoTls,
            ManagerConfig {
                recycling_method: RecyclingMethod::Fast,
            },
        );
        let pool = Pool::builder(manager)
            .max_size(16)
            .build()
            .map_err(internal)?;
        let result = Self {
            pool,
            pepper: pepper.as_bytes().into(),
        };
        let connection = result.connection().await?;
        let version: i32 = connection
            .query_one("SELECT version FROM tg.schema_version", &[])
            .await
            .map_err(internal)?
            .try_get(0)
            .map_err(internal)?;
        if version != 1 {
            return Err(internal("database version"));
        };
        drop(connection);
        let mut warm = Vec::new();
        for _ in 0..4 {
            warm.push(result.connection().await?);
        }
        drop(warm);
        Ok(result)
    }
    pub async fn connection(&self) -> Result<Object, Failure> {
        tokio::time::timeout(Duration::from_millis(250), self.pool.get())
            .await
            .map_err(|_| bad(503, "SERVICE_UNAVAILABLE"))?
            .map_err(internal)
    }
    pub async fn auth(&self, header: &str) -> Result<Binding, Failure> {
        let parts = header
            .strip_prefix("Bearer ")
            .ok_or(bad(401, "INVALID_SERVICE_KEY"))?
            .split('.')
            .collect::<Vec<_>>();
        if parts.len() != 2 || parts[0].len() > 128 || parts[1].len() > 256 {
            return Err(bad(401, "INVALID_SERVICE_KEY"));
        };
        let connection = self.connection().await?;
        let row = connection
            .query_opt(
                "SELECT verifier,scope_id,scopes,external_enabled FROM tg.lookup_key($1)",
                &[&parts[0]],
            )
            .await
            .map_err(internal)?
            .ok_or(bad(401, "INVALID_SERVICE_KEY"))?;
        let verifier: String = row.try_get(0).map_err(internal)?;
        let expected = hex::decode(verifier).map_err(|_| bad(401, "INVALID_SERVICE_KEY"))?;
        let mut mac = Hmac::<Sha256>::new_from_slice(&self.pepper).map_err(internal)?;
        mac.update(parts[1].as_bytes());
        mac.verify_slice(&expected)
            .map_err(|_| bad(401, "INVALID_SERVICE_KEY"))?;
        Ok(Binding {
            scope: row.try_get(1).map_err(internal)?,
            scopes: row.try_get(2).map_err(internal)?,
            external: row.try_get(3).map_err(internal)?,
        })
    }
    pub fn hash(&self, path: &str, body: &Value) -> Result<String, Failure> {
        let mut mac = Hmac::<Sha256>::new_from_slice(&self.pepper).map_err(internal)?;
        mac.update(path.as_bytes());
        mac.update(b"\n");
        mac.update(canonical(body).map_err(internal)?.as_bytes());
        Ok(hex::encode(mac.finalize().into_bytes()))
    }
    pub async fn catalog(&self, b: &Binding, id: &str, version: &str) -> Result<Value, Failure> {
        let mut c = self.connection().await?;
        let tx = c.transaction().await.map_err(internal)?;
        scope(&tx, b).await?;
        let row=tx.query_opt("SELECT body,info FROM tg.catalogs WHERE scope_id=$1 AND catalog_id=$2 AND version=$3",&[&b.scope,&id,&version]).await.map_err(internal)?.ok_or(bad(404,"CATALOG_NOT_FOUND"))?;
        let body: Value = row.try_get(0).map_err(internal)?;
        let mut info: Value = row.try_get(1).map_err(internal)?;
        info["tools"] = body["tools"].clone();
        tx.commit().await.map_err(internal)?;
        Ok(info)
    }
    pub async fn reserve(
        &self,
        b: &Binding,
        actor: &Value,
        path: &str,
        key: &str,
        hash: &str,
    ) -> Result<Value, Failure> {
        let mut c = self.connection().await?;
        let tx = c.transaction().await.map_err(internal)?;
        scope(&tx, b).await?;
        let fence = Uuid::new_v4().to_string();
        let row = tx
            .query_one(
                "SELECT tg.reserve($1,$2,$3,$4,$5,$6,$7::text::uuid)",
                &[
                    &b.scope,
                    &text(actor, "principal_ref")?,
                    &text(actor, "workspace_ref")?,
                    &path,
                    &key,
                    &hash,
                    &fence,
                ],
            )
            .await
            .map_err(internal)?;
        let result = row.try_get(0).map_err(internal)?;
        tx.commit().await.map_err(internal)?;
        Ok(result)
    }
    pub async fn release(
        &self,
        b: &Binding,
        actor: &Value,
        path: &str,
        key: &str,
        fence: &str,
    ) -> Result<(), Failure> {
        let mut c = self.connection().await?;
        let tx = c.transaction().await.map_err(internal)?;
        scope(&tx, b).await?;
        tx.execute("DELETE FROM tg.idempotency WHERE scope_id=$1 AND principal=$2 AND workspace=$3 AND path=$4 AND key=$5 AND fence=$6::text::uuid AND response IS NULL",&[&b.scope,&text(actor,"principal_ref")?,&text(actor,"workspace_ref")?,&path,&key,&fence]).await.map_err(internal)?;
        tx.commit().await.map_err(internal)
    }
}
pub(super) async fn scope(tx: &Transaction<'_>, b: &Binding) -> Result<(), Failure> {
    tx.execute("SELECT set_config('toolgate.scope',$1,true)", &[&b.scope])
        .await
        .map_err(internal)?;
    Ok(())
}
pub(super) async fn load<C: GenericClient + Sync>(
    tx: &C,
    b: &Binding,
    actor: &Value,
    id: &str,
    lock: bool,
) -> Result<(Value, Value, DateTime<Utc>), Failure> {
    let query = format!(
        "SELECT principal,workspace,authorization_revision,allowed,view,expires_at FROM tg.operations WHERE scope_id=$1 AND id=$2::text::uuid{}",
        if lock { " FOR UPDATE" } else { "" }
    );
    let row = tx
        .query_opt(&query, &[&b.scope, &id])
        .await
        .map_err(internal)?
        .ok_or(bad(404, "OPERATION_NOT_FOUND"))?;
    let principal: String = row.try_get(0).map_err(internal)?;
    let workspace: String = row.try_get(1).map_err(internal)?;
    let rev: String = row.try_get(2).map_err(internal)?;
    if actor["principal_ref"] != principal || actor["workspace_ref"] != workspace {
        return Err(bad(404, "OPERATION_NOT_FOUND"));
    };
    if actor["authorization_revision"] != rev {
        return Err(bad(409, "AUTHORIZATION_CONTEXT_CHANGED"));
    };
    let view: Value = row.try_get(4).map_err(internal)?;
    if !view["selected_tool"].is_null()
        && !actor["allowed_tool_ids"]
            .as_array()
            .is_some_and(|a| a.contains(&view["selected_tool"]["tool_id"]))
    {
        return Err(bad(403, "TOOL_NOT_ALLOWED"));
    };
    Ok((
        view,
        row.try_get(3).map_err(internal)?,
        row.try_get(5).map_err(internal)?,
    ))
}
pub(super) async fn persist(
    tx: &Transaction<'_>,
    b: &Binding,
    actor: &Value,
    view: &Value,
    create: bool,
) -> Result<(), Failure> {
    if create {
        tx.execute("INSERT INTO tg.operations(scope_id,id,principal,workspace,authorization_revision,allowed,view,expires_at) VALUES($1,$2::text::uuid,$3,$4,$5,$6,$7,$8::text::timestamptz)",&[&b.scope,&text(view,"operation_id")?,&text(actor,"principal_ref")?,&text(actor,"workspace_ref")?,&text(actor,"authorization_revision")?,&actor["allowed_tool_ids"],&view,&text(view,"expires_at")?]).await.map_err(internal)?;
    } else {
        tx.execute(
            "UPDATE tg.operations SET view=$1 WHERE scope_id=$2 AND id=$3::text::uuid",
            &[&view, &b.scope, &text(view, "operation_id")?],
        )
        .await
        .map_err(internal)?;
    }
    Ok(())
}
#[derive(Clone, Copy)]
pub(super) struct Reservation<'a> {
    pub path: &'a str,
    pub key: &'a str,
    pub fence: &'a str,
}
pub(super) async fn finish(
    tx: &Transaction<'_>,
    b: &Binding,
    actor: &Value,
    reservation: Reservation<'_>,
    status: i32,
    result: &Value,
) -> Result<(), Failure> {
    let changed=tx.execute("UPDATE tg.idempotency SET response=$1,status=$2 WHERE scope_id=$3 AND principal=$4 AND workspace=$5 AND path=$6 AND key=$7 AND fence=$8::text::uuid AND response IS NULL",&[&result,&status,&b.scope,&text(actor,"principal_ref")?,&text(actor,"workspace_ref")?,&reservation.path,&reservation.key,&reservation.fence]).await.map_err(internal)?;
    if changed != 1 {
        return Err(bad(409, "REQUEST_IN_PROGRESS"));
    };
    Ok(())
}
pub(super) fn cancelled(view: &Value) -> Value {
    json!({"operation_id":view["operation_id"],"revision":view["revision"].as_i64().unwrap_or(0)+1,"catalog_id":view["catalog_id"],"catalog_version":view["catalog_version"],"expires_at":view["expires_at"],"status":"cancelled"})
}

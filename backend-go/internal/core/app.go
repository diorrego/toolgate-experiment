package core

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	js "github.com/santhosh-tekuri/jsonschema/v6"
)

// App owns database/HTTP pools; handlers of the business provider never enter it.
type App struct {
	store    *Store
	selector *Selector
	wire     map[string]*js.Schema
	mu       sync.Mutex
	schemas  map[string]*js.Schema
	global   chan struct{}
	inflight map[string]int
	Now      func() time.Time
}

func New(ctx context.Context, database, pepper, jevURL, jevKey, model string, connectBudget time.Duration, selectorMode string) (*App, error) {
	store, e := openStore(ctx, database, pepper)
	if e != nil {
		return nil, e
	}
	sel, e := newSelector(jevURL, jevKey, model, connectBudget, selectorMode)
	if e != nil {
		store.pool.Close()
		return nil, e
	}
	wire, e := wireSchemas()
	if e != nil {
		store.pool.Close()
		return nil, e
	}
	return &App{store: store, selector: sel, wire: wire, schemas: map[string]*js.Schema{}, global: make(chan struct{}, 128), inflight: map[string]int{}, Now: time.Now}, nil
}
func (a *App) Close() { a.selector.client.CloseIdleConnections(); a.store.pool.Close() }
func (a *App) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health/live", func(w http.ResponseWriter, r *http.Request) { a.respond(w, 200, map[string]string{"status": "ok"}) })
	mux.HandleFunc("GET /health/ready", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 250*time.Millisecond)
		defer cancel()
		if a.store.pool.Ping(ctx) != nil {
			a.respond(w, 503, map[string]string{"status": "not_ready"})
			return
		}
		a.respond(w, 200, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("/v1/", a.serve)
	return mux
}
func (a *App) respond(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
func (a *App) serve(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	requestID, e := uuid()
	if e != nil {
		a.respond(w, 500, map[string]string{"error": "internal"})
		return
	}
	w.Header().Set("X-Request-Id", requestID)
	metrics := &selectionMetrics{}
	r = r.WithContext(context.WithValue(r.Context(), metricsContextKey{}, metrics))
	status, body, err := a.process(w, r)
	if metrics.WorkflowTrace != nil {
		if encoded, e := json.Marshal(metrics.WorkflowTrace); e == nil {
			w.Header().Set("X-Toolgate-Workflow-Trace", string(encoded))
		}
	}
	w.Header().Set("X-Toolgate-Jev-Calls", strconv.Itoa(metrics.Calls))
	w.Header().Set("X-Toolgate-Jev-Ms", formatMS(metrics.Duration))
	w.Header().Set("X-Toolgate-Selector-Ms", formatMS(metrics.SelectorDuration))
	w.Header().Set("X-Toolgate-Jev-Max-Concurrent", strconv.Itoa(metrics.MaxConcurrent))
	w.Header().Set("X-Toolgate-Selector-Profile", a.selector.mode)
	w.Header().Set("X-Toolgate-Jev-Usage-Calls", strconv.Itoa(metrics.UsageCalls))
	w.Header().Set("X-Toolgate-Jev-Input-Tokens", strconv.FormatInt(metrics.InputTokens, 10))
	w.Header().Set("X-Toolgate-Jev-Output-Tokens", strconv.FormatInt(metrics.OutputTokens, 10))
	w.Header().Set("Server-Timing", "core;dur="+formatMS(time.Since(start)))
	if err != nil {
		f := fail(500, "INTERNAL_ERROR")
		var typed *Failure
		if errors.As(err, &typed) {
			f = typed
		}
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
			f = &Failure{504, "DEADLINE_EXCEEDED", true}
		}
		if f.Code == "REQUEST_IN_PROGRESS" || f.Status == 429 {
			w.Header().Set("Retry-After", "1")
		}
		a.respond(w, f.Status, map[string]any{"error": map[string]any{"code": f.Code, "message_key": "toolgate.error." + strings.ToLower(f.Code), "retryable": f.Retry, "request_id": requestID}})
		return
	}
	a.respond(w, status, body)
}
func formatMS(duration time.Duration) string {
	return strconv.FormatFloat(float64(duration)/float64(time.Millisecond), 'f', 3, 64)
}

var idPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)
var hashPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)
var uuidPattern = regexp.MustCompile(`^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$`)
var keyPattern = regexp.MustCompile(`^[A-Za-z0-9._:-]{16,128}$`)

func (a *App) process(w http.ResponseWriter, r *http.Request) (int, any, error) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	select {
	case a.global <- struct{}{}:
		defer func() { <-a.global }()
	default:
		return 0, nil, fail(503, "SERVICE_UNAVAILABLE")
	}
	binding, e := a.store.authenticate(ctx, r.Header.Get("Authorization"))
	if e != nil {
		return 0, nil, e
	}
	if r.Header.Get("X-Toolgate-Contract") != "0.1" {
		return 0, nil, fail(409, "CONTRACT_VERSION_UNSUPPORTED")
	}
	a.mu.Lock()
	if a.inflight[binding.Scope] >= 16 {
		a.mu.Unlock()
		return 0, nil, fail(429, "RATE_LIMITED")
	}
	a.inflight[binding.Scope]++
	a.mu.Unlock()
	defer func() { a.mu.Lock(); a.inflight[binding.Scope]--; a.mu.Unlock() }()
	tx, e := a.store.begin(ctx, binding)
	if e != nil {
		return 0, nil, e
	}
	var used int
	e = tx.QueryRow(ctx, "INSERT INTO tg.quota_windows(scope_id,window_start,used) VALUES($1,date_trunc('minute',clock_timestamp()),1) ON CONFLICT(scope_id,window_start) DO UPDATE SET used=tg.quota_windows.used+1 RETURNING used", binding.Scope).Scan(&used)
	if e == nil {
		e = tx.Commit(ctx)
	}
	rollback(tx)
	if e != nil {
		return 0, nil, e
	}
	if used > 600 {
		return 0, nil, fail(429, "QUOTA_EXCEEDED")
	}
	path := r.URL.Path
	parts := strings.Split(strings.Trim(path, "/"), "/")
	requiredScope := "runtime"
	isCatalog := len(parts) == 5 && parts[1] == "catalogs" && parts[3] == "versions"
	if isCatalog {
		requiredScope = "catalog:read"
		if r.Method == "PUT" {
			requiredScope = "catalog:write"
		}
	}
	if !contains(binding.Scopes, requiredScope) {
		return 0, nil, fail(403, "INSUFFICIENT_SCOPE")
	}
	if path == "/v1/capabilities" && r.Method == "GET" {
		raw, _ := ParseJSON(apiBytes)
		doc, ok := raw.(map[string]any)
		if !ok {
			return 0, nil, errJSON
		}
		defs, ok := doc["$defs"].(map[string]any)
		if !ok {
			return 0, nil, errJSON
		}
		capSchema, ok := defs["Capabilities"].(map[string]any)
		if !ok {
			return 0, nil, errJSON
		}
		props, ok := capSchema["properties"].(map[string]any)
		if !ok {
			return 0, nil, errJSON
		}
		response := map[string]any{}
		for key, v := range props {
			spec, ok := v.(map[string]any)
			if !ok {
				return 0, nil, errJSON
			}
			if constant, exists := spec["const"]; exists {
				response[key] = constant
			} else {
				response[key] = []string{"tg-jsonschema-1"}
			}
		}
		return 200, response, nil
	}
	if isCatalog {
		if !idPattern.MatchString(parts[2]) || !hashPattern.MatchString(parts[4]) {
			return 0, nil, fail(400, "INVALID_REQUEST")
		}
		if r.Method == "GET" {
			cat, e := a.store.catalog(ctx, binding, parts[2], parts[4])
			return 200, cat, e
		}
		if r.Method == "PUT" {
			value, e := readBody(w, r, 16777216)
			if e != nil {
				return 0, nil, e
			}
			if a.wire["CatalogUpload"].Validate(value) != nil {
				return 0, nil, fail(422, "CATALOG_INVALID")
			}
			raw, e := Canonical(value)
			if e != nil {
				return 0, nil, e
			}
			version, e := digest(value)
			if e != nil {
				return 0, nil, e
			}
			if version != parts[4] {
				return 0, nil, fail(422, "HASH_MISMATCH")
			}
			var upload Upload
			if e = json.Unmarshal(raw, &upload); e != nil {
				return 0, nil, e
			}
			previous := ""
			for _, tool := range upload.Tools {
				if tool.ID <= previous {
					return 0, nil, fail(422, "CATALOG_INVALID")
				}
				previous = tool.ID
				if _, e = a.schema(binding.Scope, tool.Input); e != nil {
					return 0, nil, fail(422, "SCHEMA_UNSUPPORTED")
				}
				if tool.Output != nil {
					if _, e = compileTool(tool.Output); e != nil {
						return 0, nil, fail(422, "SCHEMA_UNSUPPORTED")
					}
				}
			}
			info := Catalog{ID: parts[2], Version: version, Count: len(upload.Tools), Profile: upload.Profile, Created: a.Now().UTC().Format(time.RFC3339Nano)}
			encoded, e := json.Marshal(info)
			if e != nil {
				return 0, nil, e
			}
			tx, e := a.store.begin(ctx, binding)
			if e != nil {
				return 0, nil, e
			}
			defer rollback(tx)
			if _, e = tx.Exec(ctx, "INSERT INTO tg.catalogs(scope_id,catalog_id,version,body,canonical_body,info) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING", binding.Scope, info.ID, version, raw, string(raw), encoded); e != nil {
				return 0, nil, e
			}
			var stored string
			var original []byte
			if e = tx.QueryRow(ctx, "SELECT canonical_body,info FROM tg.catalogs WHERE scope_id=$1 AND catalog_id=$2 AND version=$3", binding.Scope, info.ID, version).Scan(&stored, &original); e != nil {
				return 0, nil, e
			}
			if stored != string(raw) {
				return 0, nil, fail(409, "CATALOG_IMMUTABLE")
			}
			return 200, json.RawMessage(original), tx.Commit(ctx)
		}
	}
	if r.Method != "POST" || len(parts) < 2 || (parts[1] != "operations" && path != "/v1/workflows") {
		return 0, nil, fail(400, "INVALID_REQUEST")
	}
	action := "prepare"
	opID := ""
	schemaName := "PrepareRequest"
	if path == "/v1/workflows" {
		action = "workflow"
		schemaName = "WorkflowRequest"
	}
	if len(parts) == 4 {
		opID = parts[2]
		action = parts[3]
		if !uuidPattern.MatchString(opID) {
			return 0, nil, fail(400, "INVALID_REQUEST")
		}
		names := map[string]string{"resolve": "ResolveRequest", "execution-decisions": "DecisionRequest", "inspect": "InspectRequest", "cancel": "CancelRequest", "receipts": "ReceiptRequest"}
		schemaName = names[action]
		if schemaName == "" {
			return 0, nil, fail(400, "INVALID_REQUEST")
		}
	} else if len(parts) != 2 {
		return 0, nil, fail(400, "INVALID_REQUEST")
	}
	value, e := readBody(w, r, 262144)
	if e != nil {
		return 0, nil, e
	}
	if a.wire[schemaName].Validate(value) != nil {
		return 0, nil, fail(400, "INVALID_REQUEST")
	}
	raw, e := json.Marshal(value)
	if e != nil {
		return 0, nil, e
	}
	var request Request
	if e = json.Unmarshal(raw, &request); e != nil {
		return 0, nil, e
	}
	if action == "inspect" {
		tx, e := a.store.begin(ctx, binding)
		if e != nil {
			return 0, nil, e
		}
		defer rollback(tx)
		op, e := loadOperation(ctx, tx, binding, request.Actor, opID, false)
		if e != nil {
			return 0, nil, e
		}
		if !op.Expires.After(a.Now()) {
			return 0, nil, fail(410, "OPERATION_EXPIRED")
		}
		if op.View.Status == "needs_choice" {
			visible := []Candidate{}
			for _, c := range op.View.Candidates {
				if contains(request.Actor.Allowed, c.ID) {
					visible = append(visible, c)
				}
			}
			if len(visible) != len(op.View.Candidates) {
				return 0, nil, fail(403, "TOOL_NOT_ALLOWED")
			}
		}
		return 200, op.View, tx.Commit(ctx)
	}
	key := r.Header.Get("Idempotency-Key")
	if !keyPattern.MatchString(key) {
		return 0, nil, fail(400, "INVALID_REQUEST")
	}
	hash, e := a.store.requestHash(r.Method+" "+path, value)
	if e != nil {
		return 0, nil, e
	}
	// Guard ownership and policy even when a cached idempotent response exists.
	if action != "prepare" && action != "workflow" {
		tx, e := a.store.begin(ctx, binding)
		if e != nil {
			return 0, nil, e
		}
		op, e := loadOperation(ctx, tx, binding, request.Actor, opID, false)
		rollback(tx)
		if e != nil {
			return 0, nil, e
		}
		if action != "receipts" && !op.Expires.After(a.Now()) {
			return 0, nil, fail(410, "OPERATION_EXPIRED")
		}
	}
	claim, e := a.store.reserve(ctx, binding, request.Actor, path, key, hash)
	if e != nil {
		return 0, nil, e
	}
	switch claim.State {
	case "conflict":
		return 0, nil, fail(409, "IDEMPOTENCY_CONFLICT")
	case "processing":
		return 0, nil, fail(409, "REQUEST_IN_PROGRESS")
	case "replay":
		return claim.Status, claim.Response, nil
	case "owned":
	default:
		return 0, nil, fail(500, "INTERNAL_ERROR")
	}
	completed := false
	defer func() {
		if !completed {
			a.store.release(binding, request.Actor, path, key, claim.Fence)
		}
	}()
	if action == "workflow" {
		view, e := a.prepareWorkflow(ctx, binding, request)
		if e != nil {
			return 0, nil, e
		}
		tx, e := a.store.begin(ctx, binding)
		if e != nil {
			return 0, nil, e
		}
		defer rollback(tx)
		for _, child := range view.Operations {
			if e = persistView(ctx, tx, binding, request.Actor, child, true); e != nil {
				return 0, nil, e
			}
		}
		if e = finish(ctx, tx, binding, request.Actor, path, key, claim.Fence, 201, view); e != nil {
			return 0, nil, e
		}
		commitErr := tx.Commit(ctx)
		completed = commitErr == nil
		return 201, view, commitErr
	}
	if action == "prepare" {
		view, e := a.prepare(ctx, binding, request)
		if e != nil {
			return 0, nil, e
		}
		tx, e := a.store.begin(ctx, binding)
		if e != nil {
			return 0, nil, e
		}
		defer rollback(tx)
		if e = persistView(ctx, tx, binding, request.Actor, view, true); e != nil {
			return 0, nil, e
		}
		if e = finish(ctx, tx, binding, request.Actor, path, key, claim.Fence, 201, view); e != nil {
			return 0, nil, e
		}
		commitErr := tx.Commit(ctx)
		completed = commitErr == nil
		return 201, view, commitErr
	}
	status, response, mutationErr := a.mutate(ctx, binding, request, opID, action, path, key, claim.Fence)
	completed = mutationErr == nil
	return status, response, mutationErr
}
func readBody(w http.ResponseWriter, r *http.Request, limit int64) (any, error) {
	if strings.Split(r.Header.Get("Content-Type"), ";")[0] != "application/json" || r.Header.Get("Content-Encoding") != "" {
		return nil, fail(400, "INVALID_REQUEST")
	}
	raw, e := io.ReadAll(http.MaxBytesReader(w, r.Body, limit))
	if e != nil {
		return nil, fail(413, "PAYLOAD_TOO_LARGE")
	}
	value, e := ParseJSON(raw)
	if e != nil {
		return nil, fail(400, "INVALID_JSON")
	}
	return value, nil
}
func (a *App) schema(scope string, input map[string]any) (*js.Schema, error) {
	hash, e := digest(input)
	if e != nil {
		return nil, e
	}
	key := scope + ":" + hash
	a.mu.Lock()
	compiled := a.schemas[key]
	a.mu.Unlock()
	if compiled != nil {
		return compiled, nil
	}
	compiled, e = compileTool(input)
	if e != nil {
		return nil, e
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if len(a.schemas) >= 256 {
		clear(a.schemas)
	}
	a.schemas[key] = compiled
	return compiled, nil
}
func (a *App) ready(b Binding, view View, tool Tool, args map[string]any) (View, error) {
	s, e := selected(tool)
	if e != nil {
		return view, e
	}
	compiled, e := a.schema(b.Scope, tool.Input)
	if e != nil {
		return view, e
	}
	view.Selected = s
	view.Next = "execute_read_action"
	if tool.Effect != "read" {
		view.Next = "execute_write_action"
	}
	issues, missing := validateCompiled(compiled, args)
	view.Candidates = nil
	view.Reason = ""
	view.Message = ""
	view.Issues = nil
	view.Missing = nil
	view.Digest = ""
	if len(issues) > 0 {
		view.Status = "needs_arguments"
		view.Issues = &issues
		view.Missing = &missing
	} else {
		view.Status = "ready"
		view.Digest, e = digest(args)
	}
	return view, e
}
func (a *App) prepare(ctx context.Context, b Binding, request Request) (View, error) {
	cat, e := a.store.catalog(ctx, b, request.CatalogID, request.Version)
	if e != nil {
		return View{}, e
	}
	for _, id := range request.Actor.Allowed {
		found := false
		for _, tool := range cat.Tools {
			if tool.ID == id {
				found = true
				break
			}
		}
		if !found {
			return View{}, fail(400, "INVALID_REQUEST")
		}
	}
	id, e := uuid()
	if e != nil {
		return View{}, e
	}
	view := View{ID: id, Revision: 1, CatalogID: cat.ID, Version: cat.Version, Expires: a.Now().Add(15 * time.Minute).UTC().Format(time.RFC3339Nano), Status: "no_match", Reason: "no_authorized_tools", Message: "toolgate.no_match.refine_intent"}
	if len(request.Actor.Allowed) == 0 {
		return view, nil
	}
	if !b.External {
		return View{}, fail(503, "DATA_PROCESSING_NOT_CONFIGURED")
	}
	candidates, e := retrieve(cat.Tools, request.Actor, request.Intent, request.Context)
	if e != nil {
		return View{}, e
	}
	tool, choices, reason, e := a.selector.selectTools(ctx, candidates, request)
	if e != nil {
		return View{}, e
	}
	if tool != nil {
		return a.ready(b, view, *tool, request.Known)
	}
	if len(choices) > 0 {
		view.Status = "needs_choice"
		view.Candidates = choices
		view.Reason = reason
		view.Next = "prepare_action"
		view.Message = ""
	} else {
		view.Reason = reason
	}
	return view, nil
}
func (a *App) mutate(ctx context.Context, b Binding, r Request, id, action, path, key, fence string) (int, any, error) {
	tx, e := a.store.begin(ctx, b)
	if e != nil {
		return 0, nil, e
	}
	defer rollback(tx)
	stored, e := loadOperation(ctx, tx, b, r.Actor, id, true)
	if e != nil {
		return 0, nil, e
	}
	view := stored.View
	now := a.Now().UTC()
	if action != "receipts" && !stored.Expires.After(now) {
		return 0, nil, fail(410, "OPERATION_EXPIRED")
	}
	var response any
	switch action {
	case "receipts":
		if view.Decision == nil || view.Decision.ID != r.DecisionID {
			return 0, nil, fail(400, "INVALID_REQUEST")
		}
		issued, e := time.Parse(time.RFC3339Nano, view.Decision.Issued)
		if e != nil {
			return 0, nil, e
		}
		if now.After(issued.Add(24 * time.Hour)) {
			return 0, nil, fail(410, "DECISION_EXPIRED")
		}
		body := map[string]any{"outcome": r.Outcome, "duration_ms": r.Duration}
		if r.ErrorCode != "" {
			body["error_code"] = r.ErrorCode
		}
		raw, e := json.Marshal(body)
		if e != nil {
			return 0, nil, e
		}
		_, e = tx.Exec(ctx, "INSERT INTO tg.receipts(scope_id,decision_id,body) VALUES($1,$2::uuid,$3) ON CONFLICT DO NOTHING", b.Scope, r.DecisionID, raw)
		if e != nil {
			return 0, nil, e
		}
		var previous []byte
		e = tx.QueryRow(ctx, "SELECT body FROM tg.receipts WHERE scope_id=$1 AND decision_id=$2::uuid", b.Scope, r.DecisionID).Scan(&previous)
		if e != nil {
			return 0, nil, e
		}
		var old map[string]any
		if e = json.Unmarshal(previous, &old); e != nil {
			return 0, nil, e
		}
		if old["outcome"] != r.Outcome {
			return 0, nil, fail(409, "RECEIPT_CONFLICT")
		}
		response = map[string]bool{"recorded": true}
	case "cancel":
		if view.Status == "decision_issued" {
			return 0, nil, fail(409, "CANNOT_CANCEL_ISSUED")
		}
		if !contains([]string{"ready", "needs_arguments", "needs_choice"}, view.Status) {
			return 0, nil, fail(409, "OPERATION_STATE_INVALID")
		}
		if r.Expected != view.Revision {
			return 0, nil, fail(409, "REVISION_CONFLICT")
		}
		view = View{ID: view.ID, Revision: view.Revision + 1, CatalogID: view.CatalogID, Version: view.Version, Expires: view.Expires, Status: "cancelled"}
		response = view
	case "resolve":
		if view.Status != "needs_choice" {
			return 0, nil, fail(409, "OPERATION_STATE_INVALID")
		}
		if r.Expected != view.Revision {
			return 0, nil, fail(409, "REVISION_CONFLICT")
		}
		found := false
		for _, candidate := range view.Candidates {
			if candidate.ID == r.Choice {
				found = true
			}
		}
		if !found {
			return 0, nil, fail(400, "INVALID_REQUEST")
		}
		if !contains(r.Actor.Allowed, r.Choice) || !contains(stored.Actor.Allowed, r.Choice) {
			return 0, nil, fail(403, "TOOL_NOT_ALLOWED")
		}
		// Catalog lookup stays in this local transaction; it never waits on inference.
		var raw []byte
		if e = tx.QueryRow(ctx, "SELECT body FROM tg.catalogs WHERE scope_id=$1 AND catalog_id=$2 AND version=$3", b.Scope, view.CatalogID, view.Version).Scan(&raw); e != nil {
			return 0, nil, e
		}
		var catalog Upload
		if e = json.Unmarshal(raw, &catalog); e != nil {
			return 0, nil, e
		}
		for _, tool := range catalog.Tools {
			if tool.ID == r.Choice {
				view.Revision++
				view, e = a.ready(b, view, tool, r.Arguments)
				if e != nil {
					return 0, nil, e
				}
				break
			}
		}
		response = view
	case "execution-decisions":
		hash, e := digest(r.Arguments)
		if e != nil {
			return 0, nil, e
		}
		if view.Status == "decision_issued" {
			if view.Decision == nil || view.Decision.ArgumentsDigest != hash {
				return 0, nil, fail(409, "OPERATION_ALREADY_ISSUED")
			}
			expiry, e := time.Parse(time.RFC3339Nano, view.Decision.NotAfter)
			if e != nil {
				return 0, nil, e
			}
			if !expiry.After(now) {
				return 0, nil, fail(410, "DECISION_EXPIRED")
			}
			response = map[string]any{"status": "decision_issued", "decision": view.Decision}
			break
		}
		if view.Status != "ready" && view.Status != "needs_arguments" {
			return 0, nil, fail(409, "OPERATION_STATE_INVALID")
		}
		if r.Expected != view.Revision {
			return 0, nil, fail(409, "REVISION_CONFLICT")
		}
		if view.Selected == nil {
			return 0, nil, fail(500, "INTERNAL_ERROR")
		}
		compiled, e := a.schema(b.Scope, view.Selected.Input)
		if e != nil {
			return 0, nil, e
		}
		issues, missing := validateCompiled(compiled, r.Arguments)
		view.Revision++
		if len(issues) > 0 {
			view.Status = "needs_arguments"
			view.Digest = ""
			view.Issues = &issues
			view.Missing = &missing
			response = view
			break
		}
		expiry := now.Add(time.Minute)
		if stored.Expires.Before(expiry) {
			expiry = stored.Expires
		}
		if expiry.Sub(now) < time.Second {
			return 0, nil, fail(410, "DECISION_EXPIRED")
		}
		decisionID, e := uuid()
		if e != nil {
			return 0, nil, e
		}
		executionKey, e := uuid()
		if e != nil {
			return 0, nil, e
		}
		decision := &Decision{decisionID, view.ID, view.Revision, view.CatalogID, view.Version, view.Selected.ID, view.Selected.Digest, hash, view.Selected.Effect, executionKey, now.Format(time.RFC3339Nano), expiry.Format(time.RFC3339Nano)}
		view.Status = "decision_issued"
		view.Decision = decision
		view.Digest = ""
		view.Issues = nil
		view.Missing = nil
		view.Next = ""
		response = map[string]any{"status": "decision_issued", "decision": decision}
	default:
		return 0, nil, fail(400, "INVALID_REQUEST")
	}
	if action != "receipts" {
		if e = persistView(ctx, tx, b, r.Actor, view, false); e != nil {
			return 0, nil, e
		}
	}
	if e = finish(ctx, tx, b, r.Actor, path, key, fence, 200, response); e != nil {
		return 0, nil, e
	}
	return 200, response, tx.Commit(ctx)
}

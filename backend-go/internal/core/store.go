package core

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	pool   *pgxpool.Pool
	pepper []byte
}

func openStore(ctx context.Context, url, pepper string) (*Store, error) {
	if len(pepper) < 32 {
		return nil, errors.New("missing pepper")
	}
	cfg, e := pgxpool.ParseConfig(url)
	if e != nil {
		return nil, e
	}
	cfg.MaxConns = 16
	cfg.MinIdleConns = 4
	cfg.ConnConfig.ConnectTimeout = time.Second
	p, e := pgxpool.NewWithConfig(ctx, cfg)
	if e != nil {
		return nil, e
	}
	var version int
	if e = p.QueryRow(ctx, "SELECT version FROM tg.schema_version").Scan(&version); e != nil || version != 1 {
		p.Close()
		return nil, errors.New("incompatible database")
	}
	return &Store{p, []byte(pepper)}, nil
}
func (s *Store) authenticate(ctx context.Context, authorization string) (Binding, error) {
	var b Binding
	if !strings.HasPrefix(authorization, "Bearer ") {
		return b, fail(401, "INVALID_SERVICE_KEY")
	}
	parts := strings.Split(strings.TrimPrefix(authorization, "Bearer "), ".")
	if len(parts) != 2 || len(parts[0]) > 128 || len(parts[1]) > 256 {
		return b, fail(401, "INVALID_SERVICE_KEY")
	}
	var keyID, verifier string
	err := s.pool.QueryRow(ctx, "SELECT key_id,verifier,scope_id,scopes,external_enabled FROM tg.lookup_key($1)", parts[0]).Scan(&keyID, &verifier, &b.Scope, &b.Scopes, &b.External)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return b, fail(401, "INVALID_SERVICE_KEY")
		}
		return b, fail(503, "SERVICE_UNAVAILABLE")
	}
	expected, e := hex.DecodeString(verifier)
	mac := hmac.New(sha256.New, s.pepper)
	_, _ = mac.Write([]byte(parts[1]))
	if e != nil || subtle.ConstantTimeCompare(expected, mac.Sum(nil)) != 1 {
		return Binding{}, fail(401, "INVALID_SERVICE_KEY")
	}
	return b, nil
}
func (s *Store) begin(ctx context.Context, b Binding) (pgx.Tx, error) {
	acquire, cancel := context.WithTimeout(ctx, 250*time.Millisecond)
	tx, e := s.pool.Begin(acquire)
	cancel()
	if e != nil {
		return nil, e
	}
	if _, e = tx.Exec(ctx, "SELECT set_config('toolgate.scope',$1,true)", b.Scope); e != nil {
		rollback(tx)
		return nil, e
	}
	return tx, nil
}
func rollback(tx pgx.Tx) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_ = tx.Rollback(ctx)
}
func uuid() (string, error) {
	raw := make([]byte, 16)
	if _, e := rand.Read(raw); e != nil {
		return "", e
	}
	raw[6] = (raw[6] & 0x0f) | 0x40
	raw[8] = (raw[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", raw[:4], raw[4:6], raw[6:8], raw[8:10], raw[10:]), nil
}
func (s *Store) requestHash(path string, body any) (string, error) {
	raw, e := Canonical(body)
	if e != nil {
		return "", e
	}
	mac := hmac.New(sha256.New, s.pepper)
	_, _ = mac.Write([]byte(path + "\n"))
	_, _ = mac.Write(raw)
	return hex.EncodeToString(mac.Sum(nil)), nil
}

type Claim struct {
	State    string          `json:"state"`
	Fence    string          `json:"fence"`
	Response json.RawMessage `json:"response"`
	Status   int             `json:"status"`
}

func (s *Store) reserve(ctx context.Context, b Binding, a Actor, path, key, hash string) (Claim, error) {
	var claim Claim
	f, e := uuid()
	if e != nil {
		return claim, e
	}
	tx, e := s.begin(ctx, b)
	if e != nil {
		return claim, e
	}
	defer rollback(tx)
	var raw []byte
	e = tx.QueryRow(ctx, "SELECT tg.reserve($1,$2,$3,$4,$5,$6,$7::uuid)", b.Scope, a.Principal, a.Workspace, path, key, hash, f).Scan(&raw)
	if e != nil {
		return claim, e
	}
	if e = json.Unmarshal(raw, &claim); e != nil {
		return claim, e
	}
	return claim, tx.Commit(ctx)
}
func finish(ctx context.Context, tx pgx.Tx, b Binding, a Actor, path, key, fence string, status int, response any) error {
	raw, e := json.Marshal(response)
	if e != nil {
		return e
	}
	tag, e := tx.Exec(ctx, "UPDATE tg.idempotency SET response=$1,status=$2 WHERE scope_id=$3 AND principal=$4 AND workspace=$5 AND path=$6 AND key=$7 AND fence=$8::uuid AND response IS NULL", raw, status, b.Scope, a.Principal, a.Workspace, path, key, fence)
	if e != nil {
		return e
	}
	if tag.RowsAffected() != 1 {
		return fail(409, "REQUEST_IN_PROGRESS")
	}
	return nil
}
func (s *Store) release(b Binding, a Actor, path, key, fence string) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	tx, e := s.begin(ctx, b)
	if e != nil {
		return
	}
	defer rollback(tx)
	if _, e = tx.Exec(ctx, "DELETE FROM tg.idempotency WHERE scope_id=$1 AND principal=$2 AND workspace=$3 AND path=$4 AND key=$5 AND fence=$6::uuid AND response IS NULL", b.Scope, a.Principal, a.Workspace, path, key, fence); e == nil {
		_ = tx.Commit(ctx)
	}
}
func (s *Store) catalog(ctx context.Context, b Binding, id, version string) (Catalog, error) {
	var result Catalog
	tx, e := s.begin(ctx, b)
	if e != nil {
		return result, e
	}
	defer rollback(tx)
	var raw, info []byte
	e = tx.QueryRow(ctx, "SELECT body,info FROM tg.catalogs WHERE scope_id=$1 AND catalog_id=$2 AND version=$3", b.Scope, id, version).Scan(&raw, &info)
	if errors.Is(e, pgx.ErrNoRows) {
		return result, fail(404, "CATALOG_NOT_FOUND")
	}
	if e != nil {
		return result, e
	}
	var upload Upload
	if e = json.Unmarshal(raw, &upload); e != nil {
		return result, e
	}
	if e = json.Unmarshal(info, &result); e != nil {
		return result, e
	}
	result.Tools = upload.Tools
	return result, tx.Commit(ctx)
}
func loadOperation(ctx context.Context, tx pgx.Tx, b Binding, actor Actor, id string, lock bool) (Stored, error) {
	var result Stored
	var raw, allowed []byte
	query := "SELECT principal,workspace,authorization_revision,allowed,view,expires_at FROM tg.operations WHERE scope_id=$1 AND id=$2::uuid"
	if lock {
		query += " FOR UPDATE"
	}
	e := tx.QueryRow(ctx, query, b.Scope, id).Scan(&result.Actor.Principal, &result.Actor.Workspace, &result.Actor.Revision, &allowed, &raw, &result.Expires)
	if errors.Is(e, pgx.ErrNoRows) {
		return result, fail(404, "OPERATION_NOT_FOUND")
	}
	if e != nil {
		return result, e
	}
	if result.Actor.Principal != actor.Principal || result.Actor.Workspace != actor.Workspace {
		return result, fail(404, "OPERATION_NOT_FOUND")
	}
	if result.Actor.Revision != actor.Revision {
		return result, fail(409, "AUTHORIZATION_CONTEXT_CHANGED")
	}
	if e = json.Unmarshal(raw, &result.View); e != nil {
		return result, e
	}
	if e = json.Unmarshal(allowed, &result.Actor.Allowed); e != nil {
		return result, e
	}
	if result.View.Selected != nil && !contains(actor.Allowed, result.View.Selected.ID) {
		return result, fail(403, "TOOL_NOT_ALLOWED")
	}
	return result, nil
}
func persistView(ctx context.Context, tx pgx.Tx, b Binding, actor Actor, view View, create bool) error {
	raw, e := json.Marshal(view)
	if e != nil {
		return e
	}
	if create {
		allowed, e := json.Marshal(actor.Allowed)
		if e != nil {
			return e
		}
		_, e = tx.Exec(ctx, "INSERT INTO tg.operations(scope_id,id,principal,workspace,authorization_revision,allowed,view,expires_at) VALUES($1,$2::uuid,$3,$4,$5,$6,$7,$8::timestamptz)", b.Scope, view.ID, actor.Principal, actor.Workspace, actor.Revision, allowed, raw, view.Expires)
		return e
	}
	_, e = tx.Exec(ctx, "UPDATE tg.operations SET view=$1 WHERE scope_id=$2 AND id=$3::uuid", raw, b.Scope, view.ID)
	return e
}

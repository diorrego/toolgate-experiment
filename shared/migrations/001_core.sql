-- Common persistence layout. Apply explicitly with the migration role.
CREATE SCHEMA tg;
CREATE TABLE tg.schema_version(version integer PRIMARY KEY);
INSERT INTO tg.schema_version VALUES (1);
CREATE TABLE tg.tenants(tenant_id text PRIMARY KEY, active boolean NOT NULL DEFAULT true);
CREATE TABLE tg.projects(tenant_id text NOT NULL REFERENCES tg.tenants, project_id text NOT NULL, PRIMARY KEY(tenant_id,project_id));
CREATE TABLE tg.integrations(
 scope_id text PRIMARY KEY, tenant_id text NOT NULL, project_id text NOT NULL,
 integration_id text NOT NULL, active boolean NOT NULL DEFAULT true,
 external_enabled boolean NOT NULL DEFAULT false,
 FOREIGN KEY(tenant_id,project_id) REFERENCES tg.projects,
 UNIQUE(tenant_id,project_id,integration_id));
CREATE TABLE tg.service_keys(key_id text PRIMARY KEY, verifier text NOT NULL,
 scope_id text NOT NULL REFERENCES tg.integrations, scopes text[] NOT NULL,
 revoked boolean NOT NULL DEFAULT false);
CREATE TABLE tg.catalogs(scope_id text NOT NULL REFERENCES tg.integrations,
 catalog_id text NOT NULL, version text NOT NULL, body jsonb NOT NULL,
 canonical_body text NOT NULL, info jsonb NOT NULL,
 PRIMARY KEY(scope_id,catalog_id,version));
CREATE TABLE tg.operations(scope_id text NOT NULL REFERENCES tg.integrations,
 id uuid NOT NULL, principal text NOT NULL, workspace text NOT NULL,
 authorization_revision text NOT NULL, allowed jsonb NOT NULL,
 view jsonb NOT NULL, expires_at timestamptz NOT NULL,
 PRIMARY KEY(scope_id,id));
CREATE INDEX ON tg.operations(expires_at);
CREATE TABLE tg.idempotency(scope_id text NOT NULL REFERENCES tg.integrations,
 principal text NOT NULL, workspace text NOT NULL, path text NOT NULL,
 key text NOT NULL, request_hash text NOT NULL, fence uuid NOT NULL,
 lease_until timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 response jsonb, status integer,
 PRIMARY KEY(scope_id,principal,workspace,path,key));
CREATE INDEX ON tg.idempotency(expires_at);
CREATE TABLE tg.receipts(scope_id text NOT NULL REFERENCES tg.integrations,
 decision_id uuid NOT NULL, body jsonb NOT NULL,
 PRIMARY KEY(scope_id,decision_id));
CREATE TABLE tg.quota_windows(scope_id text NOT NULL REFERENCES tg.integrations,
 window_start timestamptz NOT NULL, used integer NOT NULL,
 PRIMARY KEY(scope_id,window_start));
CREATE FUNCTION tg.lookup_key(requested text)
RETURNS TABLE(key_id text,verifier text,scope_id text,scopes text[],external_enabled boolean)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,tg AS $$
 SELECT k.key_id,k.verifier,k.scope_id,k.scopes,i.external_enabled
 FROM tg.service_keys k JOIN tg.integrations i USING(scope_id)
 JOIN tg.tenants t USING(tenant_id)
 WHERE k.key_id=requested AND NOT k.revoked AND i.active AND t.active
$$;
REVOKE ALL ON FUNCTION tg.lookup_key(text) FROM PUBLIC;
GRANT USAGE ON SCHEMA tg TO tg_runtime;
GRANT SELECT ON tg.schema_version TO tg_runtime;
GRANT EXECUTE ON FUNCTION tg.lookup_key(text) TO tg_runtime;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['catalogs','operations','idempotency','receipts','quota_windows'] LOOP
  EXECUTE format('ALTER TABLE tg.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE tg.%I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY scope_isolation ON tg.%I USING (scope_id=current_setting(''toolgate.scope'',true)) WITH CHECK (scope_id=current_setting(''toolgate.scope'',true))',tab);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON tg.%I TO tg_runtime',tab);
 END LOOP;
END $$;

-- Short transaction only. No network, inference, or handlers under this lock.
CREATE FUNCTION tg.reserve(s text,p text,w text,route text,k text,h text,f uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,tg AS $$
DECLARE item tg.idempotency; inserted integer;
BEGIN
 INSERT INTO tg.idempotency(scope_id,principal,workspace,path,key,request_hash,fence,lease_until,expires_at)
 VALUES(s,p,w,route,k,h,f,clock_timestamp()+interval '10 seconds',clock_timestamp()+interval '24 hours') ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF inserted=1 THEN RETURN jsonb_build_object('state','owned','fence',f); END IF;
 SELECT * INTO item FROM tg.idempotency WHERE scope_id=s AND principal=p AND workspace=w AND path=route AND key=k FOR UPDATE;
 IF item.request_hash<>h THEN RETURN jsonb_build_object('state','conflict'); END IF;
 IF item.response IS NOT NULL THEN RETURN jsonb_build_object('state','replay','response',item.response,'status',item.status); END IF;
 IF item.lease_until>clock_timestamp() THEN RETURN jsonb_build_object('state','processing'); END IF;
 UPDATE tg.idempotency SET fence=f,lease_until=clock_timestamp()+interval '10 seconds' WHERE scope_id=s AND principal=p AND workspace=w AND path=route AND key=k;
 RETURN jsonb_build_object('state','owned','fence',f);
END $$;
REVOKE ALL ON FUNCTION tg.reserve(text,text,text,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tg.reserve(text,text,text,text,text,text,uuid) TO tg_runtime;

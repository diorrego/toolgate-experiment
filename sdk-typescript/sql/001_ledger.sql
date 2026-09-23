CREATE SCHEMA sdk;
CREATE TABLE sdk.preparations(
 integration text NOT NULL, principal text NOT NULL, workspace text NOT NULL,
 operation_id text NOT NULL, revision bigint NOT NULL,
 authorization_revision text NOT NULL, snapshot jsonb NOT NULL,
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(integration,principal,workspace,operation_id));
CREATE TABLE sdk.executions(
 integration text NOT NULL, principal text NOT NULL, workspace text NOT NULL,
 execution_key text NOT NULL, arguments_digest text NOT NULL,
 tool_id text NOT NULL, catalog_version text NOT NULL,
 state text NOT NULL CHECK(state IN ('claimed','dispatching','succeeded','failed_before_dispatch','failed_after_dispatch','unknown')),
 fence uuid NOT NULL, result jsonb, expires_at timestamptz NOT NULL,
 PRIMARY KEY(integration,principal,workspace,execution_key));
ALTER TABLE sdk.preparations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdk.preparations FORCE ROW LEVEL SECURITY;
ALTER TABLE sdk.executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdk.executions FORCE ROW LEVEL SECURITY;
CREATE POLICY provider_isolation ON sdk.preparations USING (integration=current_setting('toolgate.integration',true)) WITH CHECK(integration=current_setting('toolgate.integration',true));
CREATE POLICY provider_isolation ON sdk.executions USING (integration=current_setting('toolgate.integration',true)) WITH CHECK(integration=current_setting('toolgate.integration',true));
GRANT USAGE ON SCHEMA sdk TO tg_provider;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA sdk TO tg_provider;

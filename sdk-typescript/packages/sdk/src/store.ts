import pg from "pg";
import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import type {
  Actor,
  OperationView,
  ExecutionDecision,
} from "./wire.generated.ts";
import { decodeWire, jcs } from "./codec.ts";
import { RemoteError } from "./remote.ts";

interface SnapshotRow {
  snapshot: unknown;
  authorization_revision: string;
}
interface ExecutionRow {
  state: string;
  arguments_digest: string;
  tool_id: string;
  catalog_version: string;
  result: unknown;
  expires_at: Date;
}
export interface Claim {
  fence?: string;
  replay?: unknown;
}
/** Durable provider-local state. The pool is owned only when constructed here. */
export class PostgresStore {
  private readonly pool: Pool;
  private readonly owned: boolean;
  private closing: Promise<void> | undefined;
  readonly integration: string;
  constructor(integration: string, connection: string | Pool) {
    this.integration = integration;
    this.owned = typeof connection === "string";
    this.pool =
      typeof connection === "string"
        ? new pg.Pool({
            connectionString: connection,
            max: 16,
            connectionTimeoutMillis: 250,
            statement_timeout: 3000,
          })
        : connection;
  }
  async close(): Promise<void> {
    if (this.owned) {
      this.closing ??= this.pool.end();
      await this.closing;
    }
  }
  private async transaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('toolgate.integration',$1,true)", [
        this.integration,
      ]);
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async put(actor: Actor, view: OperationView): Promise<void> {
    await this.transaction(async (client) => {
      await client.query(
        `INSERT INTO sdk.preparations(integration,principal,workspace,operation_id,revision,authorization_revision,snapshot,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT(integration,principal,workspace,operation_id) DO UPDATE SET revision=EXCLUDED.revision,snapshot=EXCLUDED.snapshot
    WHERE sdk.preparations.revision<=EXCLUDED.revision AND sdk.preparations.authorization_revision=EXCLUDED.authorization_revision`,
        [
          this.integration,
          actor.principal_ref,
          actor.workspace_ref,
          view.operation_id,
          view.revision,
          actor.authorization_revision,
          jcs(view),
          view.expires_at,
        ],
      );
    });
  }
  async get(actor: Actor, id: string): Promise<OperationView> {
    return this.transaction(async (client) => {
      const result = await client.query<SnapshotRow>(
        "SELECT snapshot,authorization_revision FROM sdk.preparations WHERE integration=$1 AND principal=$2 AND workspace=$3 AND operation_id=$4",
        [this.integration, actor.principal_ref, actor.workspace_ref, id],
      );
      const row = result.rows[0];
      if (!row) throw new RemoteError("OPERATION_NOT_FOUND");
      if (row.authorization_revision !== actor.authorization_revision)
        throw new RemoteError("AUTHORIZATION_CONTEXT_CHANGED");
      return decodeWire("OperationView", row.snapshot);
    });
  }
  private check(row: ExecutionRow, decision: ExecutionDecision): unknown {
    if (
      row.arguments_digest !== decision.arguments_digest ||
      row.tool_id !== decision.tool_id ||
      row.catalog_version !== decision.catalog_version
    )
      throw new RemoteError("EXECUTION_CONFLICT");
    if (row.expires_at.getTime() <= Date.now())
      throw new RemoteError("RESULT_UNAVAILABLE");
    if (
      ["succeeded", "failed_after_dispatch"].includes(row.state) &&
      row.result !== null
    )
      return row.result;
    throw new RemoteError(
      row.state === "claimed" ? "EXECUTION_IN_PROGRESS" : "EXECUTION_UNKNOWN",
    );
  }
  async replay(
    actor: Actor,
    decision: ExecutionDecision,
  ): Promise<{ found: boolean; result?: unknown }> {
    return this.transaction(async (client) => {
      const result = await client.query<ExecutionRow>(
        "SELECT state,arguments_digest,tool_id,catalog_version,result,expires_at FROM sdk.executions WHERE integration=$1 AND principal=$2 AND workspace=$3 AND execution_key=$4",
        [
          this.integration,
          actor.principal_ref,
          actor.workspace_ref,
          decision.execution_key,
        ],
      );
      const row = result.rows[0];
      if (!row) return { found: false };
      return { found: true, result: this.check(row, decision) };
    });
  }
  async claim(actor: Actor, decision: ExecutionDecision): Promise<Claim> {
    return this.transaction(async (client) => {
      const fence = randomUUID();
      const args = [
        this.integration,
        actor.principal_ref,
        actor.workspace_ref,
        decision.execution_key,
      ];
      const inserted = await client.query(
        `INSERT INTO sdk.executions(integration,principal,workspace,execution_key,arguments_digest,tool_id,catalog_version,state,fence,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,'claimed',$8,NOW()+interval '24 hours') ON CONFLICT DO NOTHING`,
        [
          ...args,
          decision.arguments_digest,
          decision.tool_id,
          decision.catalog_version,
          fence,
        ],
      );
      if (inserted.rowCount === 1) return { fence };
      const result = await client.query<ExecutionRow>(
        "SELECT state,arguments_digest,tool_id,catalog_version,result,expires_at FROM sdk.executions WHERE integration=$1 AND principal=$2 AND workspace=$3 AND execution_key=$4 FOR UPDATE",
        args,
      );
      const row = result.rows[0];
      if (!row) throw new RemoteError("STORE_UNAVAILABLE");
      return { replay: this.check(row, decision) };
    });
  }
  async dispatch(
    actor: Actor,
    decision: ExecutionDecision,
    fence: string,
  ): Promise<void> {
    await this.transaction(async (client) => {
      const changed = await client.query(
        "UPDATE sdk.executions SET state='dispatching' WHERE integration=$1 AND principal=$2 AND workspace=$3 AND execution_key=$4 AND fence=$5 AND state='claimed'",
        [
          this.integration,
          actor.principal_ref,
          actor.workspace_ref,
          decision.execution_key,
          fence,
        ],
      );
      if (changed.rowCount !== 1) throw new RemoteError("EXECUTION_UNKNOWN");
    });
  }
  async terminal(
    actor: Actor,
    decision: ExecutionDecision,
    fence: string,
    state:
      | "succeeded"
      | "failed_after_dispatch"
      | "failed_before_dispatch"
      | "unknown",
    result: unknown = null,
  ): Promise<void> {
    await this.transaction(async (client) => {
      const changed = await client.query(
        "UPDATE sdk.executions SET state=$1,result=$2 WHERE integration=$3 AND principal=$4 AND workspace=$5 AND execution_key=$6 AND fence=$7 AND state IN ('claimed','dispatching')",
        [
          state,
          jcs(result),
          this.integration,
          actor.principal_ref,
          actor.workspace_ref,
          decision.execution_key,
          fence,
        ],
      );
      if (changed.rowCount !== 1) throw new RemoteError("EXECUTION_UNKNOWN");
    });
  }
}

import pg from 'pg';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from '../config/env.js';
import type { UUID } from '@flotech/shared';

const { Pool, types } = pg;

/**
 * CRITICAL ARCHITECTURAL RULE:
 * PostgreSQL OID 1700 is NUMERIC / DECIMAL.
 * By default, node-postgres returns NUMERIC columns as strings so JavaScript
 * IEEE 754 float conversion never corrupts monetary values. We explicitly
 * register OID 1700 as a string parser to guarantee this invariant even if
 * downstream library defaults ever change.
 */
types.setTypeParser(1700, (val: string) => val);

export const dbPool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
});

export interface TenantScopedTransactionContext {
  businessId: UUID | null;
  actorUserId: UUID | null;
  isSuperAdmin?: boolean;
}

/**
 * Executes a callback inside an ACID PostgreSQL transaction with
 * transaction-local Row-Level Security (RLS) session variables bound via `SET LOCAL`.
 *
 * This guarantees defense-in-depth multi-tenant isolation:
 * 1. Application repositories explicitly filter by `business_id = $1`.
 * 2. PostgreSQL RLS policies enforce `business_id = current_setting('app.current_business_id', true)::uuid`
 *    at the database engine level, preventing accidental cross-tenant leakage.
 */
export async function withTenantTransaction<T>(
  ctx: TenantScopedTransactionContext,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_business_id', $1, true)`, [
      ctx.businessId ?? '',
    ]);
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [
      ctx.actorUserId ?? '',
    ]);
    await client.query(
      `SELECT set_config('app.is_super_admin', $1, true)`,
      [ctx.isSuperAdmin ? 'true' : 'false']
    );

    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Executes a platform-level database query (e.g. initial authentication lookup or Super Admin operations).
 */
export async function queryPlatform<R extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[]
): Promise<QueryResult<R>> {
  return dbPool.query<R>(text, values);
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dbPool } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Idempotent PostgreSQL Migration Runner.
 * Tracks executed migration files in `schema_migrations` so migrations run
 * exactly once in both local PostgreSQL and Google Cloud SQL.
 */
export async function runMigrations(): Promise<{ executed: string[]; skipped: string[] }> {
  const client = await dbPool.connect();
  const executed: string[] = [];
  const skipped: string[] = [];

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const migrationsDir = path.resolve(__dirname, './migrations');
    const files = (await fs.readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const existing = await client.query<{ filename: string }>(
        `SELECT filename FROM schema_migrations WHERE filename = $1`,
        [file]
      );

      if (existing.rowCount && existing.rowCount > 0) {
        skipped.push(file);
        continue;
      }

      // Check if 001_initial_schema_blueprint.sql was already applied manually before tracking
      if (file === '001_initial_schema_blueprint.sql') {
        const usersTableExists = await client.query<{ exists: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'users'
           ) AS exists`
        );
        if (usersTableExists.rows[0]?.exists) {
          await client.query(
            `INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`,
            [file]
          );
          skipped.push(file);
          continue;
        }
      }

      const sqlPath = path.join(migrationsDir, file);
      const sqlContent = await fs.readFile(sqlPath, 'utf-8');

      await client.query('BEGIN');
      try {
        await client.query(sqlContent);
        await client.query(`INSERT INTO schema_migrations (filename) VALUES ($1)`, [file]);
        await client.query('COMMIT');
        executed.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    return { executed, skipped };
  } finally {
    client.release();
  }
}

// Allow running directly via `npx tsx src/database/migrate.ts`
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runMigrations()
    .then((res) => {
      console.log('[FloTech Migrations] Complete:', res);
      return dbPool.end();
    })
    .catch((err) => {
      console.error('[FloTech Migrations] Failed:', err);
      process.exit(1);
    });
}

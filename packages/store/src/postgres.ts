// Postgres: where Petals' data goes (Elco, 8 Nov). A real server through node-postgres, with a pool of
// connections and time limits, or PGlite, Postgres itself built to run inside Node, for tests. Both
// speak the same SQL and take the same migrations. The password never travels in the address: it comes
// from a file (PETAL_DATABASE_PASSWORD_FILE), so it stays out of logs, env listings and process tables.
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { type Db, numbered, oneConnection, type Param } from './db.ts';
import { PG_SETUP, pgMigrations } from './migrations.ts';

/** One store transaction at a time, as SQLite's BEGIN IMMEDIATE did: read-modify-writes stay safe. */
const TX_LOCK = 7_301_946;

/** The time limits (proposal, section 2), in milliseconds. Each can be set from the environment. */
export interface PgLimits {
  /** PETAL_DB_STATEMENT_MS: the longest any one statement may run on the server */
  statementMs: number;
  /** PETAL_DB_CONNECT_MS: the longest a call waits for a free connection, or to connect */
  connectMs: number;
  /** PETAL_DB_IDLE_TX_MS: the longest a transaction may sit open doing nothing */
  idleTxMs: number;
  /** PETAL_DB_POOL: connections in the pool */
  pool: number;
}

export function pgLimitsOf(env: NodeJS.ProcessEnv = process.env): PgLimits {
  const n = (name: string, fallback: number) => {
    const v = Number(env[name]?.trim());
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  return {
    statementMs: n('PETAL_DB_STATEMENT_MS', 10_000),
    connectMs: n('PETAL_DB_CONNECT_MS', 5_000),
    idleTxMs: n('PETAL_DB_IDLE_TX_MS', 15_000),
    pool: n('PETAL_DB_POOL', 10),
  };
}

export interface PgConnection {
  db: Db;
  /** Connected, with the schema migrated. Every call waits for it. */
  ready: Promise<void>;
  bytes(): Promise<number>;
  close(): Promise<void>;
}

/**
 * A Postgres address as node-postgres takes it, in parts, with the password given apart: handed the whole
 * address, the driver lets its parts override the password it's given, and one with no password in it
 * leaves none.
 */
export function pgConfigOf(url: string, password: string | undefined) {
  const u = new URL(url);
  return {
    host: decodeURIComponent(u.hostname),
    port: u.port ? Number(u.port) : 5432,
    database: decodeURIComponent(u.pathname.replace(/^\//, '')) || undefined,
    user: decodeURIComponent(u.username) || undefined,
    ...(password !== undefined ? { password } : {}),
  };
}

/** The address with nothing secret in it, for messages. */
export function redacted(url: string): string {
  try {
    const u = new URL(url);
    u.password = '';
    return u.toString();
  } catch {
    return 'postgres://(an address that does not parse)';
  }
}

export interface Raw {
  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; count: number }>;
  exec(sql: string): Promise<void>;
}

/**
 * The runtime role (PETAL_DATABASE_URL's user) may only read and write rows: it owns no table and can't
 * create one, so it can't migrate. It checks the schema is current and stops if it isn't. The owner role
 * migrates, by hand (scripts/db-migrate.ts), as do a test database and a local one it owns.
 */
async function migrateOrCheck(raw: Raw, lock: boolean): Promise<void> {
  const { rows } = await raw.query(
    "SELECT has_schema_privilege(current_schema(), 'CREATE') AS can",
  );
  if (rows[0]?.can) return migrate(raw, lock);
  const have = await raw
    .query('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migration')
    .then((r) => Number(r.rows[0]?.v ?? 0))
    .catch(() => 0);
  const want = pgMigrations().length;
  if (have < want) {
    throw new Error(
      `petal: the database is at migration ${have} of ${want}, and this role can't migrate it. Run scripts/db-migrate.ts as the owner role.`,
    );
  }
}

/** Applies the setup and every migration not yet applied, under the transaction lock. */
export async function migrate(raw: Raw, lock: boolean): Promise<void> {
  await raw.exec('BEGIN');
  try {
    if (lock) await raw.query(`SELECT pg_advisory_xact_lock(${TX_LOCK})`);
    await raw.exec(PG_SETUP);
    await raw.exec(`CREATE TABLE IF NOT EXISTS schema_migration (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`);
    const { rows } = await raw.query('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migration');
    const done = Number(rows[0]?.v ?? 0);
    const all = pgMigrations();
    for (let v = done + 1; v <= all.length; v++) {
      await raw.exec(all[v - 1] as string);
      await raw.query('INSERT INTO schema_migration (version, applied_at) VALUES ($1, $2)', [
        v,
        new Date().toISOString(),
      ]);
    }
    await raw.exec('COMMIT');
  } catch (e) {
    await raw.exec('ROLLBACK').catch(() => {});
    throw e;
  }
}

/** A Postgres server, through a pool. `url` must carry no password: it comes from `password`. */
export function postgresConnection(
  url: string,
  o: { password?: string; limits?: PgLimits } = {},
): PgConnection {
  const parsed = new URL(url);
  if (parsed.password) {
    throw new Error(
      `petal: the database address carries a password. Take it out of ${redacted(url)} and put it in the file PETAL_DATABASE_PASSWORD_FILE names.`,
    );
  }
  const file = process.env.PETAL_DATABASE_PASSWORD_FILE?.trim();
  const password = o.password ?? (file ? readFileSync(file, 'utf8').trim() : undefined);
  const limits = o.limits ?? pgLimitsOf();
  let pool: import('pg').Pool | null = null;
  const als = new AsyncLocalStorage<import('pg').PoolClient>();

  const ready = (async () => {
    const pg = (await import('pg')).default;
    // Whole numbers and decimals come back as numbers, as SQLite gives them. Counts are int8 here.
    const parse = (oid: number, format?: 'text' | 'binary') => {
      if (oid === 20 || oid === 1700) return (v: string) => Number(v);
      return pg.types.getTypeParser(oid, format as 'text');
    };
    pool = new pg.Pool({
      ...pgConfigOf(url, password),
      max: limits.pool,
      connectionTimeoutMillis: limits.connectMs,
      statement_timeout: limits.statementMs,
      idle_in_transaction_session_timeout: limits.idleTxMs,
      idleTimeoutMillis: 30_000,
      application_name: 'petals',
      types: { getTypeParser: parse } as never,
    });
    // A connection the server drops while idle is replaced; it mustn't crash the process.
    pool.on('error', (e) => console.warn(`petal: a database connection closed: ${e.message}`));
    const client = await pool.connect();
    try {
      await migrateOrCheck(
        {
          query: async (sql, params) => {
            const r = await client.query(sql, params);
            return { rows: r.rows, count: r.rowCount ?? 0 };
          },
          exec: async (sql) => {
            await client.query(sql);
          },
        },
        true,
      );
    } finally {
      client.release();
    }
  })();
  // Every call waits for it; one that can't be reached fails each call, never the process.
  ready.catch(() => {});

  const query = async (sql: string, params: Param[]) => {
    await ready;
    const c = als.getStore() ?? (pool as import('pg').Pool);
    return c.query(numbered(sql), params);
  };

  const db: Db = {
    engine: 'postgres',
    async run(sql, ...params) {
      return (await query(sql, params)).rowCount ?? 0;
    },
    async get<T>(sql: string, ...params: Param[]) {
      const row = (await query(sql, params)).rows[0];
      return row ? ({ ...row } as T) : null;
    },
    async all<T>(sql: string, ...params: Param[]) {
      return (await query(sql, params)).rows.map((r) => ({ ...r }) as T);
    },
    async tx<T>(fn: () => Promise<T>): Promise<T> {
      if (als.getStore()) return fn();
      await ready;
      const client = await (pool as import('pg').Pool).connect();
      let broken: Error | undefined;
      try {
        await client.query('BEGIN');
        await client.query(`SELECT pg_advisory_xact_lock(${TX_LOCK})`);
        const out = await als.run(client, fn);
        await client.query('COMMIT');
        return out;
      } catch (e) {
        await client.query('ROLLBACK').catch((r: Error) => {
          broken = r;
        });
        throw e;
      } finally {
        client.release(broken);
      }
    },
  };

  return {
    db,
    ready,
    async bytes() {
      const r = await db.get<{ n: number }>('SELECT pg_database_size(current_database()) AS n');
      return r?.n ?? 0;
    },
    async close() {
      await ready.catch(() => {});
      await pool?.end();
    },
  };
}

/** PGlite: Postgres in this process, in memory. For tests: the same SQL and migrations as the server. */
export function pgliteConnection(): PgConnection {
  const one = oneConnection();
  let lite: import('@electric-sql/pglite').PGlite | null = null;
  const ready = (async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const { unaccent } = await import('@electric-sql/pglite/contrib/unaccent');
    lite = await PGlite.create({
      extensions: { unaccent },
      parsers: { 20: (v: string) => Number(v), 1700: (v: string) => Number(v) },
    });
    const l = lite;
    await migrateOrCheck(
      {
        query: async (sql, params) => {
          const r = await l.query<Record<string, unknown>>(sql, params);
          return { rows: r.rows, count: r.affectedRows ?? 0 };
        },
        exec: async (sql) => {
          await l.exec(sql);
        },
      },
      false,
    );
  })();
  ready.catch(() => {});
  const query = async (sql: string, params: Param[]) => {
    await ready;
    await one.turn();
    return (lite as import('@electric-sql/pglite').PGlite).query<Record<string, unknown>>(
      numbered(sql),
      params,
    );
  };
  const db: Db = {
    engine: 'postgres',
    async run(sql, ...params) {
      return (await query(sql, params)).affectedRows ?? 0;
    },
    async get<T>(sql: string, ...params: Param[]) {
      const row = (await query(sql, params)).rows[0];
      return row ? ({ ...row } as T) : null;
    },
    async all<T>(sql: string, ...params: Param[]) {
      return (await query(sql, params)).rows.map((r) => ({ ...r }) as T);
    },
    async tx<T>(fn: () => Promise<T>): Promise<T> {
      await ready;
      const l = lite as import('@electric-sql/pglite').PGlite;
      return one.exclusive(
        fn,
        async () => {
          await l.exec('BEGIN');
        },
        async (ok) => {
          await l.exec(ok ? 'COMMIT' : 'ROLLBACK');
        },
      );
    },
  };
  return {
    db,
    ready,
    async bytes() {
      const r = await db.get<{ n: number }>('SELECT pg_database_size(current_database()) AS n');
      return r?.n ?? 0;
    },
    async close() {
      await ready.catch(() => {});
      await lite?.close();
    },
  };
}

// What the owner role does, by hand, and never the running server (specs/003-target/proposal-database.md,
// sections 4 and 7): migrate the schema and grant the runtime role its rows, and copy a SQLite database
// into Postgres, checked row for row. The runtime role can do neither: it owns nothing and creates nothing.
import { migrate, pgConfigOf, type Raw } from './postgres.ts';

/** The tables a copy carries: every table but SQLite's own and FTS5's internals. */
const SHADOW = /^(sqlite_|search_(data|idx|content|docsize|config)$)/;
/** Parents first, so every reference finds its row. */
const ORDER = [
  'meta',
  'person',
  'invite',
  'wallet_binding',
  'session',
  'challenge',
  'exploration',
  'run',
];

/** A role name as SQL takes it: letters, digits and _ only, so it can be written into a statement. */
function role(name: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) throw new Error(`petal: not a role name: ${name}`);
  return name;
}

/**
 * Migrates as the owner, then gives the runtime role exactly its rows: read, add, change and delete, and
 * the automatic numbering. Nothing else: no schema changes, no TRUNCATE, no ownership.
 */
export async function migrateAndGrant(raw: Raw, runtimeRole: string): Promise<number> {
  await migrate(raw, true);
  const r = role(runtimeRole);
  await raw.exec(`
    GRANT USAGE ON SCHEMA public TO ${r};
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${r};
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${r};
    REVOKE CREATE ON SCHEMA public FROM ${r};
  `);
  const { rows } = await raw.query('SELECT MAX(version) AS v FROM schema_migration');
  return Number(rows[0]?.v ?? 0);
}

export interface TableCheck {
  table: string;
  sqlite: number;
  postgres: number;
  /** every row the same in both, compared as canonical JSON */
  same: boolean;
}

type Row = Record<string, unknown>;
/** A row as one string, keys sorted: rows are flat, so this is enough to compare them exactly. */
const canonicalJson = (row: Row) =>
  JSON.stringify(
    Object.fromEntries(
      Object.keys(row)
        .sort()
        .map((k) => [k, row[k]]),
    ),
  );
const columnsOf = (t: string) => (t === 'search' ? 'rowid, title, text' : '*');
const canonicalRows = (rows: Row[]) =>
  rows
    .map((r) =>
      canonicalJson(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v ?? null]))),
    )
    .sort();

/** SQLite's rows by table, from a file opened read-only. */
function sqliteTables(file: string): {
  names: string[];
  rows: (t: string) => Row[];
  close(): void;
} {
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
  const lite = new DatabaseSync(file, { readOnly: true });
  const names = (
    lite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
      name: string;
    }[]
  )
    .map((r) => r.name)
    .filter((n) => !SHADOW.test(n));
  return {
    names,
    rows: (t) => lite.prepare(`SELECT ${columnsOf(t)} FROM "${t}"`).all() as Row[],
    close: () => lite.close(),
  };
}

/** Row for row, every table: what a copy, or a restore, must show before anything depends on it. */
export async function compareWithSqlite(raw: Raw, file: string): Promise<TableCheck[]> {
  const lite = sqliteTables(file);
  try {
    const out: TableCheck[] = [];
    for (const t of lite.names) {
      const a = canonicalRows(lite.rows(t));
      const r = await raw.query(
        `SELECT COALESCE(json_agg(x), '[]'::json) AS rows FROM (SELECT ${columnsOf(t)} FROM "${t}") x`,
      );
      const value = r.rows[0]?.rows;
      const b = canonicalRows((typeof value === 'string' ? JSON.parse(value) : value) as Row[]);
      out.push({
        table: t,
        sqlite: a.length,
        postgres: b.length,
        same: a.length === b.length && a.every((x, i) => x === b[i]),
      });
    }
    return out;
  } finally {
    lite.close();
  }
}

/**
 * Copies a SQLite database, read-only, into an empty, migrated Postgres database: every row of every
 * table in one transaction, then the automatic numbering set past the highest id copied. Refuses a
 * database that already holds rows, so nothing is copied twice. Returns the row-for-row comparison.
 */
export async function copyFromSqlite(raw: Raw, file: string): Promise<TableCheck[]> {
  const lite = sqliteTables(file);
  try {
    for (const t of lite.names) {
      if (t === 'schema_migration') continue;
      const { rows } = await raw.query(`SELECT COUNT(*) AS n FROM "${t}"`);
      if (Number(rows[0]?.n ?? 0) > 0) {
        throw new Error(`petal: ${t} already holds rows here, so nothing was copied`);
      }
    }
    const order = [
      ...ORDER.filter((t) => lite.names.includes(t)),
      ...lite.names.filter((t) => !ORDER.includes(t)),
    ];
    await raw.exec('BEGIN');
    try {
      // the target's own record of its migrations stays as its migration wrote it
      for (const t of order) {
        if (t === 'schema_migration') continue;
        for (const row of lite.rows(t)) {
          const cols = Object.keys(row);
          await raw.query(
            `INSERT INTO "${t}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols
              .map((_, i) => `$${i + 1}`)
              .join(', ')})`,
            cols.map((c) => row[c] ?? null),
          );
        }
      }
      await raw.query(
        "SELECT setval(pg_get_serial_sequence('search_doc', 'id'), COALESCE((SELECT MAX(id) FROM search_doc), 0) + 1, false)",
      );
      await raw.exec('COMMIT');
    } catch (e) {
      await raw.exec('ROLLBACK').catch(() => {});
      throw e;
    }
  } finally {
    lite.close();
  }
  return (await compareWithSqlite(raw, file)).filter((c) => c.table !== 'schema_migration');
}

/**
 * One connection as the owner, for a script: `postgres://owner@host:port/db`, the password from
 * PETAL_DATABASE_PASSWORD_FILE as for the server, or `pglite:` for a test. Close it when done.
 */
export async function ownerConnection(url: string): Promise<{ raw: Raw; close(): Promise<void> }> {
  if (url === 'pglite:') {
    const { PGlite } = await import('@electric-sql/pglite');
    const { unaccent } = await import('@electric-sql/pglite/contrib/unaccent');
    const lite = await PGlite.create({
      extensions: { unaccent },
      parsers: { 20: (v: string) => Number(v), 1700: (v: string) => Number(v) },
    });
    return {
      raw: {
        query: async (sql, params) => {
          const r = await lite.query<Record<string, unknown>>(sql, params);
          return { rows: r.rows, count: r.affectedRows ?? 0 };
        },
        exec: async (sql) => {
          await lite.exec(sql);
        },
      },
      close: () => lite.close(),
    };
  }
  const { readFileSync } = await import('node:fs');
  if (new URL(url).password) throw new Error('petal: put the password in a file, not the address');
  const file = process.env.PETAL_DATABASE_PASSWORD_FILE?.trim();
  const pg = (await import('pg')).default;
  const client = new pg.Client({
    ...pgConfigOf(url, file ? readFileSync(file, 'utf8').trim() : undefined),
    application_name: 'petals-admin',
    types: {
      getTypeParser: (oid: number, format?: 'text' | 'binary') =>
        oid === 20 || oid === 1700
          ? (v: string) => Number(v)
          : pg.types.getTypeParser(oid, format as 'text'),
    } as never,
  });
  await client.connect();
  return {
    raw: {
      query: async (sql, params) => {
        const r = await client.query(sql, params);
        return { rows: r.rows, count: r.rowCount ?? 0 };
      },
      exec: async (sql) => {
        await client.query(sql);
      },
    },
    close: () => client.end(),
  };
}

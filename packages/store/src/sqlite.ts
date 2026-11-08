// SQLite through node:sqlite: the engine Petals started on, and the one a migration copies from. Its
// calls are synchronous underneath, so a slow one still holds the thread (proposal, section 2); the
// interface above them is the same as Postgres's.
import { resolve } from 'node:path';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { type Db, oneConnection, type Param } from './db.ts';

/**
 * One queue per file, for every connection this process has to it. A transaction holds SQLite's write
 * lock across awaits, and a second connection here that waited for that lock would wait synchronously,
 * holding the thread the first one needs to finish. So they take turns here instead, as one would.
 */
const queues = new Map<string, ReturnType<typeof oneConnection>>();
function queueFor(path: string) {
  if (path === ':memory:') return oneConnection();
  const key = resolve(path);
  let q = queues.get(key);
  if (!q) {
    q = oneConnection();
    queues.set(key, q);
  }
  return q;
}

/** How long a write waits on another process's lock before it fails. */
const BUSY_MS = 5000;

export interface SqliteConnection {
  db: Db;
  conn: DatabaseSync;
  /** Bytes the file holds that SQLite will reuse: deleted rows don't shrink a database file. */
  freeBytes(): number;
  /** Closes it once the calls already made on it have finished; later calls fail. */
  close(): Promise<void>;
  /**
   * True while another connection in this process holds this file in a transaction: the file is then
   * known to be writable and migrated, and taking its lock again here would wait on this very thread.
   */
  sharedBusy(): boolean;
}

export function sqliteConnection(path: string): SqliteConnection {
  // Loaded here, not imported: node:sqlite prints an ExperimentalWarning when first loaded, and a
  // command that never opens a store shouldn't print it.
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
  const conn = new DatabaseSync(path, { timeout: BUSY_MS });
  const cache = new Map<string, StatementSync>();
  const prepared = (sql: string) => {
    let s = cache.get(sql);
    if (!s) {
      s = conn.prepare(sql);
      cache.set(sql, s);
    }
    return s;
  };
  const one = queueFor(path);
  // Calls made and not yet finished, so a close waits for them rather than cutting one off.
  let inFlight = 0;
  const idle: (() => void)[] = [];
  const counted = async <T>(f: () => Promise<T>): Promise<T> => {
    inFlight++;
    try {
      return await f();
    } finally {
      inFlight--;
      if (inFlight === 0) for (const r of idle.splice(0)) r();
    }
  };

  const db: Db = {
    engine: 'sqlite',
    run: (sql: string, ...params: Param[]) =>
      counted(async () => {
        await one.turn();
        return Number(prepared(sql).run(...params).changes);
      }),
    get: <T>(sql: string, ...params: Param[]) =>
      counted(async () => {
        await one.turn();
        const row = prepared(sql).get(...params);
        return row ? ({ ...row } as T) : null;
      }),
    all: <T>(sql: string, ...params: Param[]) =>
      counted(async () => {
        await one.turn();
        return prepared(sql)
          .all(...params)
          .map((row) => ({ ...row }) as T);
      }),
    tx<T>(fn: () => Promise<T>): Promise<T> {
      if (one.inside()) return fn();
      return counted(() =>
        one.exclusive(
          fn,
          () => conn.exec('BEGIN IMMEDIATE'),
          (ok) => {
            if (ok) {
              try {
                conn.exec('COMMIT');
                return;
              } catch (e) {
                if (conn.isTransaction) conn.exec('ROLLBACK');
                throw e;
              }
            }
            // SQLite has already rolled back after some failures, a full disk among them
            if (conn.isTransaction) conn.exec('ROLLBACK');
          },
        ),
      );
    },
  };

  return {
    db,
    conn,
    sharedBusy: () => one.busy(),
    freeBytes() {
      const free = prepared('PRAGMA freelist_count').get() as
        | { freelist_count: number }
        | undefined;
      const page = prepared('PRAGMA page_size').get() as { page_size: number } | undefined;
      return (free?.freelist_count ?? 0) * (page?.page_size ?? 0);
    },
    async close() {
      if (inFlight > 0) await new Promise<void>((r) => idle.push(r));
      if (!conn.isOpen) return;
      cache.clear();
      conn.close();
    },
  };
}

/** The numbered migrations, applied once each, synchronously, at open: the folder is proven writable. */
export function migrateSqlite(conn: DatabaseSync, migrations: readonly string[]): void {
  conn.exec('PRAGMA journal_mode = WAL');
  // Also the proof that the file can be written: BEGIN IMMEDIATE fails on a read-only database.
  conn.exec('BEGIN IMMEDIATE');
  try {
    conn.exec(`CREATE TABLE IF NOT EXISTS schema_migration (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`);
    const row = conn
      .prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migration')
      .get() as {
      v: number;
    };
    const add = conn.prepare('INSERT INTO schema_migration (version, applied_at) VALUES (?, ?)');
    for (let v = row.v + 1; v <= migrations.length; v++) {
      conn.exec(migrations[v - 1] as string);
      add.run(v, new Date().toISOString());
    }
    conn.exec('COMMIT');
  } catch (e) {
    if (conn.isTransaction) conn.exec('ROLLBACK');
    throw e;
  }
}

// openStore (T189): private data in SQLite through node:sqlite. One connection, WAL, a numbered
// migration list, prepared statements. stateStore is the process's one store for a state folder:
// <stateDir>/private.db, or memory, with one log line, when that folder can't be written.
//
// node:sqlite is synchronous, so a function here that doesn't await is atomic within the process;
// tx() (BEGIN IMMEDIATE) makes it atomic against other processes on the same file too.
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { StatementSync } from 'node:sqlite';
import { MIGRATIONS } from './migrations.ts';
import { type Tables, tables } from './tables.ts';

export type Param = string | number | null;

export interface Db {
  /** Returns how many rows changed. */
  run(sql: string, ...params: Param[]): number;
  get<T>(sql: string, ...params: Param[]): T | null;
  all<T>(sql: string, ...params: Param[]): T[];
  /** All of `fn`, or none of it. `fn` must be synchronous. Nested calls join the outer one. */
  tx<T>(fn: () => T): T;
}

export interface Store extends Tables {
  readonly path: string;
  /** False for ':memory:': it ends with the process, so it can't hold anything that must last. */
  readonly durable: boolean;
  tx<T>(fn: () => T): T;
  /** Bytes this file holds that SQLite will reuse: deleted rows don't shrink a database file. */
  freeBytes(): number;
  close(): void;
}

/** How long a write waits on another process's lock before it fails. */
const BUSY_MS = 5000;

function connect(path: string, onClose: () => void, migrations: readonly string[]): Store {
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

  let inTx = false;
  const db: Db = {
    run: (sql, ...params) => Number(prepared(sql).run(...params).changes),
    get: <T>(sql: string, ...params: Param[]) => {
      const row = prepared(sql).get(...params);
      return row ? ({ ...row } as T) : null;
    },
    all: <T>(sql: string, ...params: Param[]) =>
      prepared(sql)
        .all(...params)
        .map((row) => ({ ...row }) as T),
    tx<T>(fn: () => T): T {
      if (inTx) return fn();
      conn.exec('BEGIN IMMEDIATE');
      inTx = true;
      try {
        const out = fn();
        conn.exec('COMMIT');
        return out;
      } catch (e) {
        // SQLite has already rolled back after some failures, a full disk among them
        if (conn.isTransaction) conn.exec('ROLLBACK');
        throw e;
      } finally {
        inTx = false;
      }
    },
  };

  try {
    conn.exec('PRAGMA journal_mode = WAL');
    // Also the proof that the file can be written: BEGIN IMMEDIATE fails on a read-only database.
    db.tx(() => {
      conn.exec(`CREATE TABLE IF NOT EXISTS schema_migration (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )`);
      const row = db.get<{ v: number }>(
        'SELECT COALESCE(MAX(version), 0) AS v FROM schema_migration',
      );
      for (let v = (row?.v ?? 0) + 1; v <= migrations.length; v++) {
        conn.exec(migrations[v - 1] as string);
        db.run(
          'INSERT INTO schema_migration (version, applied_at) VALUES (?, ?)',
          v,
          new Date().toISOString(),
        );
      }
    });
  } catch (e) {
    conn.close();
    throw e;
  }

  return {
    ...tables(db),
    path,
    durable: path !== ':memory:',
    tx: db.tx,
    freeBytes() {
      const free = db.get<{ freelist_count: number }>('PRAGMA freelist_count');
      const page = db.get<{ page_size: number }>('PRAGMA page_size');
      return (free?.freelist_count ?? 0) * (page?.page_size ?? 0);
    },
    close() {
      if (!conn.isOpen) return;
      cache.clear();
      conn.close();
      onClose();
    },
  };
}

/** A new connection to `path`, migrated. Throws if it can't be opened and written. */
export function openStore(path: string, migrations: readonly string[] = MIGRATIONS): Store {
  return connect(path, () => {}, migrations);
}

const open = new Map<string, Store>();

/**
 * The process's one store for a state folder. Falls back to memory when the folder can't be
 * written: that's the keyless public copy on a read-only disk, which must still start. Nothing that
 * must last may rely on it there, so check `durable`. Closing it lets the next call reopen the file.
 */
export function stateStore(stateDir: string, log: (line: string) => void = console.warn): Store {
  const dir = resolve(stateDir);
  const hit = open.get(dir);
  if (hit) return hit;
  const forget = () => {
    open.delete(dir);
  };
  let store: Store;
  try {
    mkdirSync(dir, { recursive: true });
    store = connect(join(dir, 'private.db'), forget, MIGRATIONS);
  } catch (e) {
    log(
      `petal: private data is in memory for this process, because ${dir} can't be written (${(e as Error).message}).`,
    );
    store = connect(':memory:', forget, MIGRATIONS);
  }
  open.set(dir, store);
  return store;
}

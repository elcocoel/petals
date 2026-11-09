// The store: the only way into Petals' private data (specs/003-target/proposal-database.md). The rest of
// the code asks it for things by name and gets plain values back, later; it never sees SQL, a file or a
// connection. Where the data is comes from one setting, the database address:
//   postgres://user@host:5432/db   a Postgres server; the password from PETAL_DATABASE_PASSWORD_FILE
//   pglite:                         Postgres inside this process, in memory: tests only
//   a file path, or :memory:        SQLite, the starting point a migration copies from
// stateStore is the process's one store for a state folder, or for the address it's given.
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Db, Engine } from './db.ts';
import { MIGRATIONS } from './migrations.ts';
import { type PgConnection, pgliteConnection, postgresConnection, redacted } from './postgres.ts';
import { migrateSqlite, sqliteConnection } from './sqlite.ts';
import { type Tables, tables } from './tables.ts';

export type { Db, Engine, Param } from './db.ts';

/** What the data takes up, for the data limit. */
export interface StoreSize {
  /** bytes the database holds */
  stored: number;
  /** of those, bytes a SQLite file will reuse: deleted rows don't shrink it */
  reusable: number;
  /** true when the database's files sit inside the state folder, so a folder measure already has them */
  inStateDir: boolean;
}

export interface Store extends Tables {
  readonly engine: Engine;
  /** Where the data is: a file, :memory:, or a Postgres address with nothing secret in it. */
  readonly path: string;
  /** False for SQLite's :memory:: it ends with the process, so it can't hold anything that must last. */
  readonly durable: boolean;
  /** Connected and migrated. Calls wait for it themselves; await it to find out early. */
  readonly ready: Promise<void>;
  /** All of `fn`, or none of it, one transaction at a time; calls inside it join it (db.ts). */
  tx<T>(fn: () => Promise<T>): Promise<T>;
  size(): Promise<StoreSize>;
  close(): Promise<void>;
}

const isPostgres = (location: string) => /^postgres(ql)?:\/\//.test(location);
const isPglite = (location: string) => location === 'pglite:' || location === 'pglite:memory';

function fromPg(c: PgConnection, path: string, onClose: () => void): Store {
  return {
    ...tables(c.db),
    engine: 'postgres',
    path,
    durable: true,
    ready: c.ready,
    tx: (fn) => c.db.tx(fn),
    async size() {
      return { stored: await c.bytes(), reusable: 0, inStateDir: false };
    },
    async close() {
      onClose();
      await c.close();
    },
  };
}

function connect(location: string, onClose: () => void, migrations: readonly string[]): Store {
  if (isPostgres(location))
    return fromPg(postgresConnection(location), redacted(location), onClose);
  if (isPglite(location)) return fromPg(pgliteConnection(), 'pglite:', onClose);
  const c = sqliteConnection(location);
  try {
    if (!c.sharedBusy()) migrateSqlite(c.conn, migrations);
  } catch (e) {
    void c.close();
    throw e;
  }
  const db: Db = c.db;
  return {
    ...tables(db),
    engine: 'sqlite',
    path: location,
    durable: location !== ':memory:',
    ready: Promise.resolve(),
    tx: (fn) => db.tx(fn),
    async size() {
      const page = (await db.get<{ page_size: number }>('PRAGMA page_size'))?.page_size ?? 0;
      const pages = (await db.get<{ page_count: number }>('PRAGMA page_count'))?.page_count ?? 0;
      return { stored: page * pages, reusable: c.freeBytes(), inStateDir: location !== ':memory:' };
    },
    async close() {
      if (!c.conn.isOpen) return;
      onClose();
      await c.close();
    },
  };
}

/** A new connection to `location`, migrated (SQLite at once; Postgres before its first answer). */
export function openStore(location: string, migrations: readonly string[] = MIGRATIONS): Store {
  return connect(location, () => {}, migrations);
}

const open = new Map<string, Store>();

/**
 * The process's one store: at `databaseUrl` when one is set, else SQLite in `<stateDir>/private.db`.
 * SQLite falls back to memory when the folder can't be written: that's the keyless public copy on a
 * read-only disk, which must still start. Nothing that must last may rely on it there, so check
 * `durable`. Closing it lets the next call reopen it.
 */
export function stateStore(
  stateDir: string,
  log: (line: string) => void = console.warn,
  databaseUrl?: string,
): Store {
  const url = databaseUrl?.trim() || undefined;
  const key = url ?? resolve(stateDir);
  const hit = open.get(key);
  if (hit) return hit;
  const forget = () => {
    open.delete(key);
  };
  let store: Store;
  if (url) {
    store = connect(url, forget, MIGRATIONS);
  } else {
    try {
      mkdirSync(key, { recursive: true });
      store = connect(join(key, 'private.db'), forget, MIGRATIONS);
    } catch (e) {
      log(
        `petal: private data is in memory for this process, because ${key} can't be written (${(e as Error).message}).`,
      );
      store = connect(':memory:', forget, MIGRATIONS);
    }
  }
  open.set(key, store);
  return store;
}

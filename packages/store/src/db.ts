// The one interface between the store's tables and a database engine (specs/003-target/
// proposal-database.md, section 1). Every call answers later, so a slow answer never holds up the
// rest of the process. SQL is written once, with `?` for each value; Postgres numbers them.
import { AsyncLocalStorage } from 'node:async_hooks';

export type Param = string | number | null;
export type Engine = 'sqlite' | 'postgres';

export interface Db {
  readonly engine: Engine;
  /** Returns how many rows changed. */
  run(sql: string, ...params: Param[]): Promise<number>;
  get<T>(sql: string, ...params: Param[]): Promise<T | null>;
  all<T>(sql: string, ...params: Param[]): Promise<T[]>;
  /**
   * All of `fn`, or none of it. One transaction runs at a time, as SQLite's BEGIN IMMEDIATE did, so a
   * read and the write that depends on it can't be split by another request. Every call made inside
   * `fn`, at any depth, joins it; nested calls join the outer one. Keep `fn` to database work.
   */
  tx<T>(fn: () => Promise<T>): Promise<T>;
}

/** `?` as Postgres writes it: `$1, $2…`, in order. Anything inside quotes is left alone. */
export function numbered(sql: string): string {
  let out = '';
  let n = 0;
  let quote: string | null = null;
  for (const ch of sql) {
    if (quote) {
      if (ch === quote) quote = null;
      out += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
    } else if (ch === '?') {
      out += `$${++n}`;
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * One connection, shared by the whole process (SQLite, and PGlite in tests). A transaction has it to
 * itself: a call from outside waits until the transaction ends, so it can't slip into it, and a call
 * from inside (found by AsyncLocalStorage) goes straight through. Transactions queue in order.
 */
export function oneConnection() {
  const als = new AsyncLocalStorage<symbol>();
  let held: symbol | null = null;
  let queue: Promise<void> = Promise.resolve();
  const inside = () => held !== null && als.getStore() === held;
  return {
    inside,
    /** True while a transaction holds it. */
    busy: () => held !== null,
    /** Resolves when this call may use the connection. Use it right away, with no await between. */
    async turn(): Promise<void> {
      while (held !== null && !inside()) await queue;
    },
    /** `begin` and `end` run on the connection while it's held; `fn` runs between them. */
    async exclusive<T>(
      fn: () => Promise<T>,
      begin: () => Promise<void> | void,
      end: (ok: boolean) => Promise<void> | void,
    ): Promise<T> {
      if (inside()) return fn();
      const before = queue;
      let release = () => {};
      queue = new Promise<void>((r) => {
        release = r;
      });
      await before;
      const token = Symbol('tx');
      held = token;
      try {
        return await als.run(token, async () => {
          await begin();
          let out: T;
          try {
            out = await fn();
          } catch (e) {
            await end(false);
            throw e;
          }
          await end(true);
          return out;
        });
      } finally {
        held = null;
        release();
      }
    },
  };
}

// The daily spend ledger behind PETAL_LLM_DAILY_USD (T057, T189): one per server, shared by every
// run, so the one server key can't be drained. Days are UTC. Reserve then settle, each one
// transaction in the private store. Nothing here swallows an error: a ledger that can't be read or
// written rejects, and the run stops spending (SYS-004).
import { readFileSync } from 'node:fs';
import { openStore, type Store } from '@petal/store';
import type { Budget } from './llm.ts';

export type Ledger = NonNullable<Budget['ledger']>;

const day = (d: Date) => d.toISOString().slice(0, 10);

export function storeLedger(store: Store, now: () => Date = () => new Date()): Ledger {
  return {
    async spentToday() {
      const r = store.ledger.get(day(now()));
      return r.usd + r.reserved_usd;
    },
    async add(usd) {
      store.ledger.add(day(now()), usd);
    },
    async reserve(usd, capUsd) {
      const today = day(now());
      const held = store.ledger.reserve(today, usd, capUsd);
      return held === null ? null : { day: today, usd: held };
    },
    async settle(hold, actualUsd) {
      store.ledger.settle(hold.day, hold.usd, actualUsd);
    },
  };
}

/** For tests: it ends with the process, so it must never guard real spend. */
export function memoryLedger(now: () => Date = () => new Date()): Ledger {
  return storeLedger(openStore(':memory:'), now);
}

/** A SQLite file at `path` that survives a restart; for scripts outside the server (T060). */
export function fileLedger(path: string, now: () => Date = () => new Date()): Ledger {
  return storeLedger(openStore(path), now);
}

/** Refuses everything. For a server that can't keep a ledger: a cap that forgets is no cap. */
export function closedLedger(reason: string): Ledger {
  const refuse = () => Promise.reject(new Error(reason));
  return { spentToday: refuse, add: refuse, reserve: refuse, settle: refuse };
}

/** Today's figure from the old .petal/llm-ledger.json, so moving to the store can't reset the cap. */
export function importLedgerFile(store: Store, path: string): void {
  let old: { day?: unknown; usd?: unknown };
  try {
    old = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return;
  }
  if (typeof old.day === 'string' && typeof old.usd === 'number') {
    store.ledger.seed(old.day, old.usd);
  }
}

/** The server's budget: the per-chat limits of http-api.md and the daily cap from the config. */
export function serverBudget(
  base: Budget,
  o: { usdPerDay?: number; wallSeconds?: number; ledger: Ledger },
): Budget {
  const perDay = o.usdPerDay;
  return {
    ...base,
    wallSeconds: o.wallSeconds ?? base.wallSeconds,
    usdPerDay:
      typeof perDay === 'number' && Number.isFinite(perDay) && perDay >= 0
        ? perDay
        : base.usdPerDay,
    ledger: o.ledger,
  };
}

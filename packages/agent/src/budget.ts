// The daily spend ledger behind PETAL_LLM_DAILY_USD (T057): one per server, shared by every run,
// so the one server key can't be drained. Days are UTC.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Budget } from './llm.ts';

export type Ledger = NonNullable<Budget['ledger']>;

const day = (d: Date) => d.toISOString().slice(0, 10);

export function memoryLedger(now: () => Date = () => new Date()): Ledger {
  let state = { day: day(now()), usd: 0 };
  const roll = () => {
    if (state.day !== day(now())) state = { day: day(now()), usd: 0 };
  };
  return {
    async spentToday() {
      roll();
      return state.usd;
    },
    async add(usd) {
      roll();
      state.usd += usd;
    },
  };
}

/** .petal/llm-ledger.json: survives a restart. Writes are serialised in process. */
export function fileLedger(path: string, now: () => Date = () => new Date()): Ledger {
  let chain: Promise<unknown> = Promise.resolve();
  const read = (): { day: string; usd: number } => {
    try {
      const j = JSON.parse(readFileSync(path, 'utf8')) as { day?: unknown; usd?: unknown };
      if (j.day === day(now()) && typeof j.usd === 'number') return { day: j.day, usd: j.usd };
    } catch {
      // no ledger yet, or unreadable: start the day at zero
    }
    return { day: day(now()), usd: 0 };
  };
  return {
    async spentToday() {
      await chain;
      return read().usd;
    },
    add(usd) {
      const next = chain.then(() => {
        const s = read();
        s.usd += usd;
        mkdirSync(dirname(path), { recursive: true });
        const tmp = `${path}.${process.pid}.tmp`;
        writeFileSync(tmp, JSON.stringify(s));
        renameSync(tmp, path);
      });
      chain = next.catch(() => {});
      return next;
    },
  };
}

/** The server's budget: the per-chat limits of http-api.md and the daily cap from the config. */
export function serverBudget(base: Budget, o: { usdPerDay?: number; ledger: Ledger }): Budget {
  const perDay = o.usdPerDay;
  return {
    ...base,
    usdPerDay:
      typeof perDay === 'number' && Number.isFinite(perDay) && perDay >= 0
        ? perDay
        : base.usdPerDay,
    ledger: o.ledger,
  };
}

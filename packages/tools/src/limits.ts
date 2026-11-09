// T300: what a stranger can make this one process do has an end. Every limit is here or named beside
// what it guards, and documented in .env.example. A refusal is the API's, in plain words, with a typed
// code. The checks run on write: no timers, and the folder's size is only remembered briefly.
import { type Dirent, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { type Store, stateStore } from '@petal/store';
import { ToolFailure } from './errors.ts';

export interface Limits {
  /** PETAL_DATA_MAX_MB: past this, writes a stranger can cause are refused */
  dataMaxMb: number;
  /** PETAL_DATA_CHECK_S: how long the folder's measured size is believed */
  dataCheckS: number;
  /** PETAL_UNCLAIMED_DAYS: an exploration nobody owns goes after this long untouched */
  unclaimedDays: number;
  /** PETAL_FRESH_AT_ONCE: fresh reads at one time, for the doors and for the agent's runs each */
  freshAtOnce: number;
  /** PETAL_FRESH_MAX_S: how long a fresh read may take */
  freshMaxS: number;
}

export const DEFAULT_LIMITS: Readonly<Limits> = {
  dataMaxMb: 2048,
  dataCheckS: 10,
  unclaimedDays: 14,
  freshAtOnce: 2,
  // under Cloudflare's 100 s for an answer, so the caller gets this refusal and not its error page
  freshMaxS: 90,
};

const ENV: Record<keyof Limits, string> = {
  dataMaxMb: 'PETAL_DATA_MAX_MB',
  dataCheckS: 'PETAL_DATA_CHECK_S',
  unclaimedDays: 'PETAL_UNCLAIMED_DAYS',
  freshAtOnce: 'PETAL_FRESH_AT_ONCE',
  freshMaxS: 'PETAL_FRESH_MAX_S',
};

export interface LimitsConfig {
  root: string;
  stateDir?: string;
  /** where the private data is (PETAL_DATABASE_URL); unset, SQLite in the state folder */
  databaseUrl?: string;
  limits?: Partial<Limits>;
}

/** The default, then the environment, then what the config says (a test, or an embedding server). */
export function limitsOf(cfg: LimitsConfig, env: NodeJS.ProcessEnv = process.env): Limits {
  const out = { ...DEFAULT_LIMITS };
  for (const key of Object.keys(ENV) as (keyof Limits)[]) {
    const raw = env[ENV[key]]?.trim();
    const n = raw ? Number(raw) : Number.NaN;
    if (Number.isFinite(n) && n >= 0) out[key] = n;
  }
  return { ...out, ...cfg.limits };
}

export function stateDirOf(cfg: { root: string; stateDir?: string }): string {
  return resolve(cfg.root, cfg.stateDir ?? '.petal');
}

/**
 * The one store for this configuration, in this process: the only way into private data. At the
 * database address when one is set (PETAL_DATABASE_URL), else SQLite in <stateDir>/private.db.
 */
export function privateStore(cfg: {
  root: string;
  stateDir?: string;
  databaseUrl?: string;
}): Store {
  return stateStore(stateDirOf(cfg), console.warn, cfg.databaseUrl);
}

// ---------------------------------------------------------------------------------------------
// The data budget

const measured = new Map<string, { at: number; bytes: number }>();

function folderBytes(dir: string): number {
  let total = 0;
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true, recursive: true });
  } catch {
    return 0; // no folder yet
  }
  for (const e of entries) {
    if (!e.isFile()) continue;
    try {
      total += statSync(join(e.parentPath, e.name)).size;
    } catch {
      // gone since the listing: a rename, or a write's temporary file
    }
  }
  return total;
}

/**
 * What Petals holds: every file in the state folder, snapshots included, and the database as the store
 * measures it. A SQLite file is in the folder already, less what SQLite will reuse; a Postgres database
 * is counted by Postgres. Measured through the store, never by finding the database's files.
 */
async function dataBytes(cfg: LimitsConfig): Promise<number> {
  const store = privateStore(cfg);
  const folder = folderBytes(stateDirOf(cfg));
  if (!store.durable) return folder;
  const size = await store.size();
  return Math.max(0, size.inStateDir ? folder - size.reusable : folder + size.stored);
}

/** Over budget, by a size measured at most PETAL_DATA_CHECK_S ago. */
export async function overDataBudget(cfg: LimitsConfig, now: Date): Promise<boolean> {
  const { dataMaxMb, dataCheckS } = limitsOf(cfg);
  const key = `${stateDirOf(cfg)}\n${cfg.databaseUrl ?? ''}`;
  const at = now.getTime();
  let seen = measured.get(key);
  if (!seen || Math.abs(at - seen.at) >= dataCheckS * 1000) {
    seen = { at, bytes: await dataBytes(cfg) };
    measured.set(key, seen);
  }
  return seen.bytes > dataMaxMb * 1024 * 1024;
}

export const DATA_FULL =
  "Petal's disk space for saved data is full, so this was not saved. Reading and drawing what is stored still work.";

/** Throws the plain refusal when the data folder is over budget. */
export async function assertRoom(cfg: LimitsConfig, now: Date): Promise<void> {
  if (await overDataBudget(cfg, now)) throw new ToolFailure('budget_exhausted', DATA_FULL);
}

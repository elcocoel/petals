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
  /** PETAL_EXPLORATIONS_PER_DAY: explorations with nobody behind them, and forks by anyone */
  explorationsPerDay: number;
  /** PETAL_SPEC_BODIES_PER_DAY: new spec bodies a door may store */
  specBodiesPerDay: number;
  /** PETAL_UNCLAIMED_DAYS: an exploration nobody owns goes after this long untouched */
  unclaimedDays: number;
  /** PETAL_FRESH_AT_ONCE: fresh reads at one time, for the doors and for the agent's runs each */
  freshAtOnce: number;
  /** PETAL_FRESH_MAX_S: how long a fresh read may take */
  freshMaxS: number;
  /** PETAL_FRESH_PER_DAY: fresh reads a day through the HTTP and MCP doors */
  freshPerDay: number;
  /** PETAL_FRESH_RUN_PER_DAY: fresh reads a day by the agent's own runs */
  freshRunPerDay: number;
  /** PETAL_PUBLISHES_PER_DAY: publishes by Petal's writer */
  publishesPerDay: number;
  /** PETAL_FINGERPRINTS_PER_DAY: snapshot fingerprints written by Petal's writer */
  fingerprintsPerDay: number;
  /** PETAL_PAGE_READS_PER_DAY: pages read_page fetches, from this machine, for anyone */
  pageReadsPerDay: number;
  /** PETAL_SEARCHES_PER_DAY: searches, on an unofficial route that can refuse this machine */
  searchesPerDay: number;
  /** PETAL_POSTED_SNAPSHOTS_PER_DAY: new readings people's own agents post, made on their machines */
  postedSnapshotsPerDay: number;
}

export const DEFAULT_LIMITS: Readonly<Limits> = {
  dataMaxMb: 2048,
  dataCheckS: 10,
  explorationsPerDay: 100,
  specBodiesPerDay: 1000,
  unclaimedDays: 14,
  freshAtOnce: 2,
  // under Cloudflare's 100 s for an answer, so the caller gets this refusal and not its error page
  freshMaxS: 90,
  freshPerDay: 20,
  freshRunPerDay: 100,
  publishesPerDay: 20,
  fingerprintsPerDay: 20,
  pageReadsPerDay: 500,
  searchesPerDay: 100,
  postedSnapshotsPerDay: 200,
};

const ENV: Record<keyof Limits, string> = {
  dataMaxMb: 'PETAL_DATA_MAX_MB',
  dataCheckS: 'PETAL_DATA_CHECK_S',
  explorationsPerDay: 'PETAL_EXPLORATIONS_PER_DAY',
  specBodiesPerDay: 'PETAL_SPEC_BODIES_PER_DAY',
  unclaimedDays: 'PETAL_UNCLAIMED_DAYS',
  freshAtOnce: 'PETAL_FRESH_AT_ONCE',
  freshMaxS: 'PETAL_FRESH_MAX_S',
  freshPerDay: 'PETAL_FRESH_PER_DAY',
  freshRunPerDay: 'PETAL_FRESH_RUN_PER_DAY',
  publishesPerDay: 'PETAL_PUBLISHES_PER_DAY',
  fingerprintsPerDay: 'PETAL_FINGERPRINTS_PER_DAY',
  pageReadsPerDay: 'PETAL_PAGE_READS_PER_DAY',
  searchesPerDay: 'PETAL_SEARCHES_PER_DAY',
  postedSnapshotsPerDay: 'PETAL_POSTED_SNAPSHOTS_PER_DAY',
};

export interface LimitsConfig {
  root: string;
  stateDir?: string;
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

/** <stateDir>/private.db: the one store for this state folder, in this process. */
export function privateStore(cfg: { root: string; stateDir?: string }): Store {
  return stateStore(stateDirOf(cfg));
}

// ---------------------------------------------------------------------------------------------
// The daily caps: global, so no address can spoof its way past one, and in the store, so a restart
// can't reset one.

const dayOf = (now: Date) => now.toISOString().slice(0, 10);

const untilTomorrow = (now: Date) =>
  Math.max(
    1,
    Math.ceil(
      (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) /
        1000,
    ),
  );

/** One more of `what` today: true, or false at the cap, with nothing changed. */
export function takeToday(cfg: LimitsConfig, what: string, cap: number, now: Date): boolean {
  return privateStore(cfg).dailyCount.take(what, dayOf(now), cap);
}

export function countToday(cfg: LimitsConfig, what: string, now: Date): number {
  return privateStore(cfg).dailyCount.get(what, dayOf(now));
}

/** The refusal for a daily cap: what stopped, and that it starts again at midnight UTC. */
export function overToday(now: Date, message: string, hint?: string): ToolFailure {
  return new ToolFailure(
    'rate_limited',
    `${message} It starts again at midnight UTC.`,
    hint,
    untilTomorrow(now),
  );
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

/** What the state folder holds: every file, snapshots included, less what SQLite will reuse. */
function dataBytes(cfg: LimitsConfig): number {
  const store = privateStore(cfg);
  return Math.max(0, folderBytes(stateDirOf(cfg)) - (store.durable ? store.freeBytes() : 0));
}

/** Over budget, by a size measured at most PETAL_DATA_CHECK_S ago. */
export function overDataBudget(cfg: LimitsConfig, now: Date): boolean {
  const { dataMaxMb, dataCheckS } = limitsOf(cfg);
  const dir = stateDirOf(cfg);
  const at = now.getTime();
  let seen = measured.get(dir);
  if (!seen || Math.abs(at - seen.at) >= dataCheckS * 1000) {
    seen = { at, bytes: dataBytes(cfg) };
    measured.set(dir, seen);
  }
  return seen.bytes > dataMaxMb * 1024 * 1024;
}

export const DATA_FULL =
  "Petal's disk space for saved data is full, so this was not saved. Reading and drawing what is stored still work.";

/** Throws the plain refusal when the data folder is over budget. */
export function assertRoom(cfg: LimitsConfig, now: Date): void {
  if (overDataBudget(cfg, now)) throw new ToolFailure('budget_exhausted', DATA_FULL);
}

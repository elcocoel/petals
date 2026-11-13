// createContext (T045): wires the store, the input modules, the map reader and writer (fake
// unless configured), RPC and quotes from a Config; configFromEnv reads the env list in
// quickstart.md and .env.example. Parts are built on first use, so making a context touches no
// disk, key file or network; a part that cannot be built (a missing key file, say) fails inside
// the tool call that needs it, as a ToolError, never here.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { QuoteRequest, QuoteResult } from '@petal/core/types';
import { fileStore, lastingStore, modules, vercelBlob } from '@petal/inputs';
import type { Rpc } from '@petal/near/auth';
import {
  fakeMap,
  fastDataReader,
  fastDataWriter,
  type MapReader,
  type MapRow,
  type MapWriter,
  mirror,
  toMapRow,
} from '@petal/near/map';
import { fakeQuote, quote1Click } from '@petal/near/pay';
import { skillUrl } from './define.ts';
import { stateDirOf } from './drafts.ts';
import { ToolFailure } from './errors.ts';
import { jsonRpc, RPC_URLS } from './rpc.ts';
import type { Config, ToolContext } from './types.ts';

/** An object whose methods are built on first call. Interfaces of methods only. */
export function deferred<T extends object>(make: () => T): T {
  let inst: T | undefined;
  return new Proxy({} as T, {
    get(_target, prop) {
      inst ??= make();
      const v = Reflect.get(inst, prop);
      return typeof v === 'function' ? v.bind(inst) : v;
    },
  });
}

/** Fake mode answers without RPC; tests put their own fake RPC in the context. */
const offlineRpc: Rpc = {
  async query() {
    throw new ToolFailure(
      'source_failed',
      'NEAR RPC is off in fake mode (PETAL_FAKE=1).',
      'Run without PETAL_FAKE to check proofs against NEAR RPC.',
    );
  },
};

/** A public site's refusal, for a part a tool reached anyway. */
const notHere = (what: string, site?: string) =>
  new ToolFailure(
    'not_on_this_site',
    `This site ${what} for visitors.`,
    `Your own agent does that on your machine: ${skillUrl(site)} says how to add Petals to it.`,
  );

/** A public site reads no chain for a visitor. Sign-in's key check has its own RPC (@petal/agent). */
const publicRpc = (site?: string): Rpc => ({
  async query() {
    throw notHere('reads no chain', site);
  },
});

/**
 * The shared map as a public site holds it: copies of published rows exactly as FastData returned them
 * (key, value, predecessor_id, current_account_id, tx_hash, block_height), shipped in
 * <fixtures>/map-rows/*.row.json. Read from disk, never from the chain, so a visitor's page costs no
 * chain read. Rows for another receiver, or that can't be read, are skipped. get_flower verifies each
 * one as it would a live row.
 */
export function heldMapReader(dir: string, receiver: string): MapReader {
  let rows: MapRow[] | undefined;
  const all = (): MapRow[] => {
    if (rows) return rows;
    rows = [];
    let names: string[] = [];
    try {
      names = readdirSync(dir)
        .filter((n) => n.endsWith('.row.json'))
        .sort();
    } catch {
      // no folder: nothing held
    }
    for (const n of names) {
      try {
        const r = toMapRow(JSON.parse(readFileSync(join(dir, n), 'utf8')));
        if (r && typeof r.key === 'string' && r.receiver === receiver) rows.push(r);
      } catch {
        // an unreadable copy is skipped, like a row that fails verification
      }
    }
    return rows;
  };
  return {
    async latest(prefix, o = {}) {
      const out = all()
        .filter((r) => r.key.startsWith(prefix) && r.value !== null)
        .filter((r) => !o.writers || o.writers.includes(r.writer));
      return (o.limit === undefined ? out : out.slice(0, o.limit)).map((r) => ({ ...r }));
    },
    async get(key, writer) {
      const r = all().find((x) => x.key === key && x.writer === writer && x.value !== null);
      return r ? { ...r } : null;
    },
  };
}

export function createContext(cfg: Config): ToolContext {
  const root = resolve(cfg.root);
  const fixturesDir = resolve(root, cfg.fixturesDir ?? 'fixtures');
  const stateDir = stateDirOf({ root, ...(cfg.stateDir ? { stateDir: cfg.stateDir } : {}) });
  const config: Config = { ...cfg, root, fixturesDir, stateDir };

  const store = deferred(() => {
    const local = fileStore({
      fixtures: join(fixturesDir, 'snapshots'),
      cache: join(stateDir, 'cache'),
    });
    return cfg.blobToken ? lastingStore(local, vercelBlob(cfg.blobToken)) : local;
  });

  let map: ToolContext['map'];
  const m = cfg.fake ? null : (cfg.map ?? null);
  if (cfg.public) {
    // No chain reads and no writer: the rows it ships, trusted as the configured map's would be.
    const writers = m
      ? m.trustedWriters.length
        ? m.trustedWriters
        : m.writer
          ? [m.writer]
          : []
      : [];
    const receiver = m?.receiver ?? 'petals.testnet';
    map = {
      reader: heldMapReader(join(fixturesDir, 'map-rows'), receiver),
      writer: null,
      receiver,
      trustedWriters: writers.length ? writers : ['petals-writer.testnet'],
    };
  } else if (m) {
    const reader: MapReader = deferred(() =>
      fastDataReader({ network: m.network, receiver: m.receiver }),
    );
    // The writer writes where the map is, testnet or mainnet, with its key; a public site has none (above).
    const writer: MapWriter | null =
      m.writer && m.keyFile
        ? deferred(() =>
            mirror(
              join(stateDir, 'mirror'),
              fastDataWriter({
                network: m.network,
                receiver: m.receiver,
                writer: m.writer as string,
                keyFile: resolve(root, m.keyFile as string),
              }),
            ),
          )
        : null;
    const trustedWriters = m.trustedWriters.length ? m.trustedWriters : m.writer ? [m.writer] : [];
    map = { reader, writer, receiver: m.receiver, trustedWriters };
  } else {
    // No map configured: an in-memory map. Outside fake mode every write is also mirrored to
    // .petal/mirror/, so local publishes survive in the mirror (the T043 stand-in).
    const fake = fakeMap();
    const writer: MapWriter = cfg.fake
      ? fake
      : deferred(() => mirror(join(stateDir, 'mirror'), fake));
    map = { reader: fake, writer, receiver: fake.receiver, trustedWriters: [fake.writer] };
  }

  const network = m?.network ?? 'testnet';
  const rpc = cfg.public
    ? publicRpc(cfg.apiBase)
    : cfg.fake
      ? offlineRpc
      : jsonRpc(cfg.rpcUrl ?? RPC_URLS[network], {
          ...(cfg.fastnearApiKey ? { apiKey: cfg.fastnearApiKey } : {}),
        });

  // The recorded dry quote in fake mode; otherwise a live dry quote (keyless, no money moves).
  let quoter: ((req: QuoteRequest) => Promise<QuoteResult>) | undefined;
  const quote = (req: QuoteRequest) => {
    if (cfg.public) return Promise.reject(notHere('asks for no payment quotes', cfg.apiBase));
    quoter ??= cfg.fake ? fakeQuote() : quote1Click;
    return quoter(req);
  };

  return { config, store, modules, map, rpc, quote, now: () => new Date() };
}

type Env = Record<string, string | undefined>;

const set = (v: string | undefined): string | undefined => (v?.trim() ? v.trim() : undefined);

/**
 * Config from environment variables (all optional; .env.example): NEAR_AI_API_KEY,
 * PETAL_LLM_DAILY_USD, PETAL_MAP_NETWORK, PETAL_MAP_RECEIVER, PETAL_WRITER_ACCOUNT,
 * PETAL_WRITER_KEY_FILE, PETAL_TRUSTED_WRITERS, FASTNEAR_API_KEY, PETAL_PAYOUT_ACCOUNT, PETAL_API
 * (public base URL), PETAL_REPO_URL, PETAL_LIVE=1; and PETAL_FAKE=1 (fakes everywhere),
 * PETAL_RPC_URL, PETAL_STATE_DIR, PETAL_FIXTURES_DIR, PETAL_DATABASE_URL (where private data lives);
 * PETAL_PUBLIC=1 (a public site: Config.public). The map counts as configured when any of
 * PETAL_MAP_NETWORK, PETAL_MAP_RECEIVER, PETAL_WRITER_ACCOUNT or PETAL_WRITER_KEY_FILE is set;
 * otherwise the fake map and the mirror are used.
 */
export function configFromEnv(env: Env = process.env, root: string = process.cwd()): Config {
  const networkVar = set(env.PETAL_MAP_NETWORK);
  const receiverVar = set(env.PETAL_MAP_RECEIVER);
  let map: Config['map'] = null;
  if (
    networkVar ||
    receiverVar ||
    set(env.PETAL_WRITER_ACCOUNT) ||
    set(env.PETAL_WRITER_KEY_FILE)
  ) {
    const network = networkVar === 'mainnet' ? 'mainnet' : 'testnet';
    const writer =
      set(env.PETAL_WRITER_ACCOUNT) ??
      (network === 'testnet' ? 'petals-writer.testnet' : undefined);
    const trusted = (set(env.PETAL_TRUSTED_WRITERS) ?? writer ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const keyFile = set(env.PETAL_WRITER_KEY_FILE);
    map = {
      network,
      receiver: receiverVar ?? (network === 'testnet' ? 'petals.testnet' : 'petals.near'),
      ...(writer ? { writer } : {}),
      ...(keyFile ? { keyFile } : {}),
      trustedWriters: trusted,
    };
  }
  const daily = Number(set(env.PETAL_LLM_DAILY_USD));
  const cfg: Config = {
    root: resolve(root),
    map,
    llmDailyUsd: Number.isFinite(daily) && daily >= 0 ? daily : 3,
    live: env.PETAL_LIVE === '1',
    fake: env.PETAL_FAKE === '1',
  };
  // A public site runs Petals' own agent for people who pay for it (TGT-030, amended), so it
  // carries the model key like any other.
  const isPublic = env.PETAL_PUBLIC === '1';
  if (isPublic) cfg.public = true;
  const optional: [keyof Config, string | undefined][] = [
    ['fixturesDir', set(env.PETAL_FIXTURES_DIR)],
    ['stateDir', set(env.PETAL_STATE_DIR)],
    ['databaseUrl', set(env.PETAL_DATABASE_URL)],
    ['rpcUrl', set(env.PETAL_RPC_URL)],
    ['fastnearApiKey', set(env.FASTNEAR_API_KEY)],
    ['nearAiApiKey', set(env.NEAR_AI_API_KEY)],
    ['payoutAccount', set(env.PETAL_PAYOUT_ACCOUNT)],
    ['apiBase', set(env.PETAL_API)?.replace(/\/+$/, '')],
    ['blobToken', set(env.BLOB_READ_WRITE_TOKEN)],
    ['repoUrl', set(env.PETAL_REPO_URL)],
    ['brainDir', set(env.PETAL_BRAIN_DIR)],
    ['searchUrl', set(env.PETAL_SEARCH_URL)?.replace(/\/+$/, '')],
  ];
  for (const [k, v] of optional)
    if (v !== undefined) (cfg as unknown as Record<string, unknown>)[k] = v;
  return cfg;
}

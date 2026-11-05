// createContext (T045): wires the store, the input modules, the map reader and writer (fake
// unless configured), RPC and quotes from a Config; configFromEnv reads the env list in
// quickstart.md and .env.example. Parts are built on first use, so making a context touches no
// disk, key file or network; a part that cannot be built (a missing key file, say) fails inside
// the tool call that needs it, as a ToolError, never here.
import { join, resolve } from 'node:path';
import type { QuoteRequest, QuoteResult } from '@petal/core/types';
import { fileStore, lastingStore, modules, vercelBlob } from '@petal/inputs';
import type { Rpc } from '@petal/near/auth';
import {
  fakeMap,
  fastDataReader,
  fastDataWriter,
  type MapReader,
  type MapWriter,
  mirror,
} from '@petal/near/map';
import { fakeQuote, quote1Click } from '@petal/near/pay';
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
  if (m) {
    const reader: MapReader = deferred(() =>
      fastDataReader({ network: m.network, receiver: m.receiver }),
    );
    // Writes go to testnet only during the build (shared-map.md); mainnet needs Elco's OK.
    const writer: MapWriter | null =
      m.network === 'testnet' && m.writer && m.keyFile
        ? deferred(() =>
            mirror(
              join(stateDir, 'mirror'),
              fastDataWriter({
                network: 'testnet',
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
  const rpc = cfg.fake
    ? offlineRpc
    : jsonRpc(cfg.rpcUrl ?? RPC_URLS[network], {
        ...(cfg.fastnearApiKey ? { apiKey: cfg.fastnearApiKey } : {}),
      });

  // The recorded dry quote in fake mode; otherwise a live dry quote (keyless, no money moves).
  let quoter: ((req: QuoteRequest) => Promise<QuoteResult>) | undefined;
  const quote = (req: QuoteRequest) => {
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
 * PETAL_RPC_URL, PETAL_STATE_DIR, PETAL_FIXTURES_DIR. The map counts as configured when any of
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
  const optional: [keyof Config, string | undefined][] = [
    ['fixturesDir', set(env.PETAL_FIXTURES_DIR)],
    ['stateDir', set(env.PETAL_STATE_DIR)],
    ['rpcUrl', set(env.PETAL_RPC_URL)],
    ['fastnearApiKey', set(env.FASTNEAR_API_KEY)],
    ['nearAiApiKey', set(env.NEAR_AI_API_KEY)],
    ['payoutAccount', set(env.PETAL_PAYOUT_ACCOUNT)],
    ['apiBase', set(env.PETAL_API)?.replace(/\/+$/, '')],
    ['blobToken', set(env.BLOB_READ_WRITE_TOKEN)],
    ['repoUrl', set(env.PETAL_REPO_URL)],
  ];
  for (const [k, v] of optional)
    if (v !== undefined) (cfg as unknown as Record<string, unknown>)[k] = v;
  return cfg;
}

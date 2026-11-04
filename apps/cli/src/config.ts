// The tools' Config from the environment (.env.example). Only variables that are set are passed;
// every default stays with @petal/tools. The CLI never reads ../.secrets/ itself: a key file is
// only ever a path handed on to the tools.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Config } from '@petal/tools';

export type Env = Record<string, string | undefined>;

/** The repo root: PETAL_ROOT, else the nearest folder above `from` with pnpm-workspace.yaml. */
export function findRoot(env: Env, from: string): string {
  if (env.PETAL_ROOT) return resolve(env.PETAL_ROOT);
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    if (dirname(dir) === dir) return resolve(from);
  }
}

const set = (v: string | undefined): v is string => v !== undefined && v.trim() !== '';
const list = (v: string) =>
  v
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

export function configFromEnv(env: Env, root: string, opts: { fake?: boolean } = {}): Config {
  const cfg: Config = { root };
  if (set(env.PETAL_API)) cfg.apiBase = env.PETAL_API;
  if (set(env.PETAL_REPO_URL)) cfg.repoUrl = env.PETAL_REPO_URL;
  if (set(env.PETAL_PAYOUT_ACCOUNT)) cfg.payoutAccount = env.PETAL_PAYOUT_ACCOUNT;
  if (set(env.FASTNEAR_API_KEY)) cfg.fastnearApiKey = env.FASTNEAR_API_KEY;
  if (set(env.NEAR_AI_API_KEY)) cfg.nearAiApiKey = env.NEAR_AI_API_KEY;
  if (set(env.PETAL_LLM_DAILY_USD)) {
    const usd = Number(env.PETAL_LLM_DAILY_USD);
    if (Number.isFinite(usd)) cfg.llmDailyUsd = usd;
  }
  if (env.PETAL_LIVE === '1') cfg.live = true;
  if (opts.fake) cfg.fake = true;

  // The shared map is configured only when one of its variables is set; otherwise the tools
  // use fakeMap plus the local mirror (Config.map absent). Defaults as in .env.example.
  const mapVars = [
    env.PETAL_MAP_NETWORK,
    env.PETAL_MAP_RECEIVER,
    env.PETAL_WRITER_ACCOUNT,
    env.PETAL_WRITER_KEY_FILE,
  ];
  if (mapVars.some(set)) {
    const network = env.PETAL_MAP_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
    const tld = network === 'mainnet' ? 'near' : 'testnet';
    const receiver = set(env.PETAL_MAP_RECEIVER) ? env.PETAL_MAP_RECEIVER : `petals.${tld}`;
    const writer = set(env.PETAL_WRITER_ACCOUNT) ? env.PETAL_WRITER_ACCOUNT : `writer.${receiver}`;
    cfg.map = {
      network,
      receiver,
      writer,
      ...(set(env.PETAL_WRITER_KEY_FILE)
        ? { keyFile: resolve(root, env.PETAL_WRITER_KEY_FILE) }
        : {}),
      trustedWriters: set(env.PETAL_TRUSTED_WRITERS) ? list(env.PETAL_TRUSTED_WRITERS) : [writer],
    };
  }
  return cfg;
}

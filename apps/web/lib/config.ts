// Server only. The repo root and petalApp's Config, read from the environment (.env.example).
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Config } from '@petal/tools';

/** The workspace root (the folder with pnpm-workspace.yaml), found upward from the cwd. */
export function repoRoot(from: string = process.cwd()): string {
  let dir = from;
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const up = dirname(dir);
    if (up === dir) throw new Error(`petal web: no pnpm-workspace.yaml above ${from}`);
    dir = up;
  }
}

const env = (k: string): string | undefined => {
  const v = process.env[k]?.trim();
  return v ? v : undefined;
};

/** petalApp's Config from the environment. Every variable is optional (quickstart.md). */
export function configFromEnv(root: string = repoRoot()): Config {
  const receiver = env('PETAL_MAP_RECEIVER');
  const keyFile = env('PETAL_WRITER_KEY_FILE');
  const writer = env('PETAL_WRITER_ACCOUNT');
  const network = env('PETAL_MAP_NETWORK') === 'mainnet' ? 'mainnet' : 'testnet';
  const trusted = env('PETAL_TRUSTED_WRITERS')
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const daily = Number(env('PETAL_LLM_DAILY_USD'));
  return {
    root,
    map:
      receiver || keyFile
        ? {
            network,
            receiver: receiver ?? 'petals.testnet',
            writer: writer ?? 'writer.petals.testnet',
            keyFile,
            trustedWriters: trusted ?? [writer ?? 'writer.petals.testnet'],
          }
        : null,
    fastnearApiKey: env('FASTNEAR_API_KEY'),
    nearAiApiKey: env('NEAR_AI_API_KEY'),
    llmDailyUsd: Number.isFinite(daily) && daily > 0 ? daily : undefined,
    payoutAccount: env('PETAL_PAYOUT_ACCOUNT'),
    repoUrl: env('PETAL_REPO_URL'),
    live: env('PETAL_LIVE') === '1',
  };
}

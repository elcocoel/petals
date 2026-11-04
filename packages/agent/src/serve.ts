// Standalone API (T058): petalApp under Node on http://localhost:8787.
//   pnpm --filter @petal/agent api      (the root `pnpm api` goes through the CLI, W7)
// Reads only the variables the agent needs; createContext (W4) reads the rest of .env.example.
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import type { Config } from '@petal/tools';
import { buildPetalApp } from './app.ts';

export const DEFAULT_PORT = 8787;
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export function configFromEnv(env: NodeJS.ProcessEnv = process.env, port = DEFAULT_PORT): Config {
  const daily = Number(env.PETAL_LLM_DAILY_USD);
  return {
    root: REPO_ROOT,
    nearAiApiKey: env.NEAR_AI_API_KEY || undefined,
    llmDailyUsd: env.PETAL_LLM_DAILY_USD && Number.isFinite(daily) ? daily : undefined,
    apiBase: env.PETAL_API || `http://localhost:${port}`,
    live: env.PETAL_LIVE === '1',
  };
}

export function serveApi(o: { cfg?: Config; port?: number } = {}) {
  const port = o.port ?? (Number(process.env.PORT) || DEFAULT_PORT);
  const cfg = o.cfg ?? configFromEnv(process.env, port);
  const app = buildPetalApp(cfg);
  const mode = cfg.nearAiApiKey && !cfg.fake ? 'NEAR AI Cloud' : 'recorded run, no NEAR_AI_API_KEY';
  const server = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Petal API on http://localhost:${info.port} (agent: ${mode})`);
  });
  return server;
}

if (import.meta.main) serveApi();

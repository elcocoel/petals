// petalApp (T058; packages.md, F1): the one Hono app the web app and `pnpm api` mount. It joins
// the tool routes (httpApp from @petal/tools) and the agent routes. With no NEAR AI key, or with
// cfg.fake, the agent replays the recorded skeleton run: done.model = "recorded", health.llm =
// "recorded" (SC-009: the judge path works with no credentials).
import { join } from 'node:path';
import { type Config, createContext, httpApp } from '@petal/tools';
import { Hono } from 'hono';
import { fileLedger, serverBudget } from './budget.ts';
import { DEFAULT_BUDGET, type LlmClient } from './llm.ts';
import { chosenModel, createNearAiClient, FALLBACK_MODELS, type NearAiOptions } from './near-ai.ts';
import { recordedClient, SKELETON_TRANSCRIPT } from './recorded.ts';
import { type AgentRouteOptions, createAgentRoutes, stateDirOf } from './routes.ts';
import { fileRunStore } from './runs.ts';

export interface PetalAppOptions extends AgentRouteOptions {
  /** the model client; default from the config (NEAR AI Cloud with a key, else recorded) */
  llm?: LlmClient;
  /** passed to nearAiClient when the app builds one */
  nearAi?: NearAiOptions;
}

/** "recorded", or the NEAR AI client's own up/down. */
export function llmHealth(llm: LlmClient): 'up' | 'down' | 'recorded' {
  if (llm.kind === 'recorded') return 'recorded';
  const s = (llm as { status?: () => 'up' | 'down' }).status;
  return typeof s === 'function' ? s.call(llm) : 'up';
}

/** The full app; `petalApp` in index.ts is this with the contract's arguments only. */
export function buildPetalApp(cfg: Config, o: PetalAppOptions = {}): Hono {
  const ctx = createContext(cfg);
  const config = ctx.config ?? cfg;
  const stateDir = stateDirOf(config);
  const key = config.fake ? undefined : config.nearAiApiKey || undefined;
  const llm =
    o.llm ??
    (key
      ? createNearAiClient(
          { apiKeyEnv: 'NEAR_AI_API_KEY', model: chosenModel(), fallbacks: [...FALLBACK_MODELS] },
          {
            apiKey: key,
            attestationsDir: join(stateDir, 'attestations'),
            apiBase: config.apiBase,
            ...o.nearAi,
          },
        )
      : recordedClient(SKELETON_TRANSCRIPT));
  const budget = serverBudget(DEFAULT_BUDGET, {
    usdPerDay: config.llmDailyUsd,
    ledger: fileLedger(join(stateDir, 'llm-ledger.json')),
  });
  const runs = fileRunStore(join(stateDir, 'runs'));

  const app = new Hono();
  // The tool side owns /api/v1/health; only the agent knows which model mode it is in.
  app.use('/api/v1/health', async (c, next) => {
    await next();
    if (!(c.res.headers.get('content-type') ?? '').includes('json')) return;
    const body = (await c.res
      .clone()
      .json()
      .catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return;
    const headers = new Headers(c.res.headers);
    headers.delete('content-length');
    const status = c.res.status;
    // unset first: Hono's setter would copy the old headers, content-length included
    c.res = undefined;
    c.res = new Response(JSON.stringify({ ...body, llm: llmHealth(llm) }), { status, headers });
  });
  app.route('/', createAgentRoutes({ tools: ctx, llm, budget, runs }, o));
  app.route('/', httpApp(ctx));
  return app;
}

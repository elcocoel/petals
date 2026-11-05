// petalApp (T058; packages.md, F1): the one Hono app the web app and `pnpm api` mount. It joins
// the tool routes (httpApp from @petal/tools) and the agent routes. With no NEAR AI key, or with
// cfg.fake, the agent replays the recorded skeleton run: done.model = "recorded", health.llm =
// "recorded" (SC-009: the judge path works with no credentials).
import { join } from 'node:path';
import { TOOLS_VERSION } from '@petal/core';
import { durableNonceStore, nearRpc, type Rpc } from '@petal/near/auth';
import { stateStore } from '@petal/store';
import { type Config, createContext, httpApp } from '@petal/tools';
import { Hono } from 'hono';
import { agentAccess, createAuth, type Network, siteOf } from './auth-routes.ts';
import { closedLedger, importLedgerFile, serverBudget, storeLedger } from './budget.ts';
import { DEFAULT_BUDGET, type LlmClient, runMaxSeconds } from './llm.ts';
import { chosenModel, createNearAiClient, FALLBACK_MODELS, type NearAiOptions } from './near-ai.ts';
import { recordedClient, SKELETON_TRANSCRIPT } from './recorded.ts';
import { type AgentRouteOptions, createAgentRoutes, stateDirOf } from './routes.ts';
import { importRunFiles, interruptRuns, sqliteRunStore } from './runs.ts';
import { walletCipherFrom } from './wallet-cipher.ts';

export interface PetalAppOptions extends AgentRouteOptions {
  /** the model client; default from the config (NEAR AI Cloud with a key, else recorded) */
  llm?: LlmClient;
  /** passed to nearAiClient when the app builds one */
  nearAi?: NearAiOptions;
  /** where PETAL_AGENT_ACCESS, PETAL_WALLET_KEY and NODE_ENV are read; default process.env */
  env?: Record<string, string | undefined>;
  /** NEAR RPC per network, for sign-in; default the public RPC, or the context's in fake mode */
  rpcFor?: (network: Network) => Rpc;
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
  // <stateDir>/private.db, or memory when that can't be written: the keyless public copy must still
  // start. Memory is fine for a recorded run, which spends nothing. It can't guard real spend,
  // because a restart would forget the day's total, so a server with a key then refuses to spend.
  const store = stateStore(stateDir);
  try {
    importLedgerFile(store, join(stateDir, 'llm-ledger.json'));
    importRunFiles(store, join(stateDir, 'runs'));
  } catch (e) {
    // the old files stay where they are, and the next start tries again
    console.warn(`petal: couldn't import the old run files: ${(e as Error).message}`);
  }
  try {
    interruptRuns(store);
  } catch (e) {
    // the server still starts; the next boot scans again
    console.warn(`petal: couldn't scan for interrupted runs: ${(e as Error).message}`);
  }
  const budget = serverBudget(DEFAULT_BUDGET, {
    usdPerDay: config.llmDailyUsd,
    wallSeconds: runMaxSeconds(),
    ledger: store.durable ? storeLedger(store) : closedLedger(`${stateDir} can't be written`),
  });
  const runs = sqliteRunStore(store);

  const env = o.env ?? process.env;
  const access = agentAccess(env);
  const auth = createAuth({
    store,
    // the same table as publish's nonces: nonceStore(cfg) in @petal/tools opens this very store
    nonces: durableNonceStore(store.challenge),
    cipher: walletCipherFrom(env, { gated: access === 'gated', spends: llm.kind !== 'recorded' }),
    rpcFor: o.rpcFor ?? (config.fake ? () => ctx.rpc : nearRpc),
    access,
    site: siteOf(config.apiBase),
    ...(o.clock ? { clock: o.clock } : {}),
  });

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
    c.res = new Response(JSON.stringify({ ...body, llm: llmHealth(llm), agent_access: access }), {
      status,
      headers,
    });
  });
  // Before the tool routes, whose open CORS must not answer for them.
  app.route('/', auth.routes);
  app.route('/', createAgentRoutes({ tools: ctx, llm, budget, runs }, { ...o, auth: auth.gate }));
  app.route('/', httpApp(ctx));
  // A store that fails mid-request (a full disk, say) ends in the API's own error shape: no chat
  // starts, so nothing is spent, and the caller is told plainly.
  app.onError((e, c) => {
    console.error(`petal: ${c.req.method} ${c.req.path} failed: ${String(e)}`);
    return c.json(
      {
        error: {
          code: 'internal',
          message:
            "Petal can't reach its records right now, so nothing was started. Try again in a little while.",
        },
        tools_version: TOOLS_VERSION,
      },
      500,
    );
  });
  return app;
}

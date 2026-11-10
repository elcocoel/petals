// petalApp (T058; packages.md, F1): the one Hono app the web app and `pnpm api` mount. It joins
// the tool routes (httpApp from @petal/tools) and the agent routes. With no NEAR AI key, or with
// cfg.fake, the agent replays the recorded skeleton run: done.model = "recorded", health.llm =
// "recorded" (SC-009: the judge path works with no credentials).
import { join } from 'node:path';
import { TOOLS_VERSION } from '@petal/core';
import { durableNonceStore, nearRpc, type Rpc } from '@petal/near/auth';
import { nearUsd } from '@petal/near/pay';
import { type JobRow, stateStore } from '@petal/store';
import { type Config, createContext, freshGate, httpApp, overDataBudget } from '@petal/tools';
import { Hono } from 'hono';
import { agentLinkRoutes, JobBell } from './agent-links.ts';
import { agentAccess, createAuth, type Network, siteOf } from './auth-routes.ts';
import { closedLedger, importLedgerFile, serverBudget, storeLedger } from './budget.ts';
import { creditFrom } from './credit.ts';
import { DEFAULT_BUDGET, type LlmClient, personUsdPerChat, runMaxSeconds } from './llm.ts';
import { meRoutes } from './me-routes.ts';
import { chosenModel, createNearAiClient, FALLBACK_MODELS, type NearAiOptions } from './near-ai.ts';
import { type PayDeps, payRoutes } from './pay-routes.ts';
import { recordedClient, SKELETON_TRANSCRIPT } from './recorded.ts';
import { type AgentRouteOptions, createAgentRoutes, stateDirOf } from './routes.ts';
import { importRunFiles, interruptRuns, sqliteRunStore } from './runs.ts';
import { walletCipherFrom } from './wallet-cipher.ts';
import { workspaceRoutes } from './workspace.ts';

export interface PetalAppOptions extends AgentRouteOptions {
  /** the model client; default from the config (NEAR AI Cloud with a key, else recorded) */
  llm?: LlmClient;
  /** passed to nearAiClient when the app builds one */
  nearAi?: NearAiOptions;
  /** where PETAL_AGENT_ACCESS, PETAL_WALLET_KEY and NODE_ENV are read; default process.env */
  env?: Record<string, string | undefined>;
  /** NEAR RPC per network, for sign-in; default the public RPC, or the context's in fake mode */
  rpcFor?: (network: Network) => Rpc;
  /** for tests: how a payment is read on chain, NEAR's price, and the credit contract */
  pay?: Pick<PayDeps, 'readTransfer' | 'nearUsd' | 'credit' | 'oneClick'>;
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
  // The configured database (PETAL_DATABASE_URL), else SQLite in the state folder: the store is the only
  // way in, wherever the data is.
  const store = stateStore(stateDir, console.warn, config.databaseUrl);
  // What a start must do before it answers: old files folded in, and runs a stop cut short marked. The
  // first request waits for it; neither failure stops the server.
  const started = (async () => {
    try {
      await importLedgerFile(store, join(stateDir, 'llm-ledger.json'));
      await importRunFiles(store, join(stateDir, 'runs'));
    } catch (e) {
      // the old files stay where they are, and the next start tries again
      console.warn(`petal: couldn't import the old run files: ${(e as Error).message}`);
    }
    try {
      await interruptRuns(store);
    } catch (e) {
      // the server still starts; the next boot scans again
      console.warn(`petal: couldn't scan for interrupted runs: ${(e as Error).message}`);
    }
  })();
  const budget = serverBudget(DEFAULT_BUDGET, {
    usdPerDay: config.llmDailyUsd,
    wallSeconds: runMaxSeconds(),
    ledger: store.durable ? storeLedger(store) : closedLedger(`${stateDir} can't be written`),
  });
  const runs = sqliteRunStore(store);

  const env = o.env ?? process.env;
  const usdPerOwnChat = personUsdPerChat(env);
  // The credit contract (Elco, 9 Nov), when PETAL_CREDIT_CONTRACT is set; none in fake mode.
  const credit =
    o.pay?.credit !== undefined
      ? o.pay.credit
      : config.fake
        ? null
        : creditFrom(env, { public: config.public === true });
  const priceNow =
    o.pay?.nearUsd ??
    (config.fake
      ? async () => null
      : () => nearUsd({ onWarning: (m: string) => console.warn(`petal: ${m}`) }));
  // A public site runs Petals' agent too (9 Nov): for a person who has paid for it, or holds an invite.
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
    full: () => overDataBudget(config, ctx.now()),
    personUsdPerChat: usdPerOwnChat,
    credit,
    nearUsd: priceNow,
  });

  const app = new Hono();
  app.use('*', async (_c, next) => {
    await started;
    await next();
  });
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
    const llmNow = access === 'none' ? 'none' : llmHealth(llm);
    c.res = new Response(JSON.stringify({ ...body, llm: llmNow, agent_access: access }), {
      status,
      headers,
    });
  });
  // Before the tool routes, whose open CORS must not answer for them.
  app.route('/', auth.routes);
  app.route(
    '/',
    payRoutes({
      store,
      gate: auth.gate,
      ...(o.price ? { price: o.price } : {}),
      usdPerChat: usdPerOwnChat,
      mainnetOnly: config.public === true,
      credit,
      nearUsd: priceNow,
      ...(o.clock ? { clock: o.clock } : {}),
      // fakes everywhere: no chain is read
      ...(config.fake
        ? { readTransfer: () => Promise.reject(new Error('fake mode reads no chain')) }
        : {}),
      ...(o.pay?.readTransfer ? { readTransfer: o.pay.readTransfer } : {}),
      ...(o.pay?.oneClick ? { oneClick: o.pay.oneClick } : {}),
    }),
  );
  // a person's own view and profile (Elco, 10 Nov), and the pictures in profiles
  app.route(
    '/',
    meRoutes({
      store,
      gate: auth.gate,
      llm,
      ...(o.price ? { price: o.price } : {}),
      ...(config.apiBase ? { apiBase: config.apiBase } : {}),
      ...(o.clock ? { clock: o.clock } : {}),
    }),
  );
  app.route(
    '/',
    workspaceRoutes({
      store,
      tools: ctx,
      gate: auth.gate,
      llm,
      ...(o.clock ? { clock: o.clock } : {}),
      full: () => overDataBudget(config, ctx.now()),
    }),
  );
  // A person's agents across their projects (9 Nov, agent-house): a job handed out wakes their waiting agents,
  // and a report is taken up at once in its run.
  const bell = new JobBell();
  const takeUp: { current?: (job: JobRow) => Promise<void> } = {};
  app.route('/', agentLinkRoutes({ store, gate: auth.gate, tools: ctx, bell }));
  // The agent's runs read fresh data apart from the doors, so strangers there can't starve a run. On a
  // public site its runs read the chain, pages and search from here too (Elco, 9 Nov: "yes"): every run that
  // reaches the model is paid for, by the person or an invite. The site's own doors still read nothing.
  const agentCtx = config.public ? createContext({ ...cfg, public: false }) : ctx;
  const tools = { ...agentCtx, fresh: freshGate(agentCtx) };
  app.route(
    '/',
    createAgentRoutes({ tools, llm, budget, runs }, { ...o, auth: auth.gate, bell, takeUp }),
  );
  const onJobReported = (job: JobRow) => {
    void takeUp
      .current?.(job)
      .catch((e) => console.warn(`petal: a report's turn failed: ${(e as Error).message}`));
  };
  app.route('/', httpApp({ ...ctx, onJobReported }, { gate: auth.gate }));
  // A store that fails mid-request (a full disk, say) ends in the API's own error shape: no chat
  // starts, so nothing is spent, and the caller is told plainly.
  app.onError((e, c) => {
    console.error(`petal: ${c.req.method} ${c.req.path} failed: ${String(e)}`);
    return c.json(
      {
        error: {
          code: 'internal',
          message:
            "Petals can't reach its records right now, so nothing was started. Try again in a little while.",
        },
        tools_version: TOOLS_VERSION,
      },
      500,
    );
  });
  return app;
}

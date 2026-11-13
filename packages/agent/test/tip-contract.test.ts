// A person's tip on the credit contract, end to end through the routes: they set it, a turn is charged on chain
// when it ends, NEAR AI's bill comes in and the tip is taken as its own entry, and the next charge carries it,
// so what the contract has earned is the bills plus the tip. A stand-in contract; the real one is rehearsed on
// testnet (scripts/rehearse-credit.ts).
import { join } from 'node:path';
import { fakeRpcFor, testSigner } from '@petal/near/auth/testing';
import { openStore } from '@petal/store';
import { describe, expect, test } from 'vitest';
import { buildPetalApp } from '../src/app.ts';
import type { CreditChain } from '../src/credit.ts';
import type { LlmClient } from '../src/llm.ts';
import { DEFAULT_MODEL, inferenceIdOf } from '../src/near-ai.ts';
import { fakeRegistry, scriptedLlm, tmpRoot } from './helpers.ts';

const SITE = 'https://petals.example';
const COOKIE = '__Host-petal_session';
const NEAR = 10n ** 24n;
const alice = testSigner('alice.near');
// biome-ignore lint/suspicious/noExplicitAny: walking what the server answers
type Out = Record<string, any>;

function setup() {
  const root = tmpRoot();
  const stateDir = join(root, 'state');
  const balances: Record<string, bigint> = { 'alice.near': NEAR };
  let earned = 0n;
  const chain: CreditChain = {
    contract: { network: 'mainnet', contract: 'credit.petals.near', chargerKeyFile: '/nowhere' },
    balanceOf: async (a) => balances[a] ?? 0n,
    charge: async (a, y) => {
      const had = balances[a] ?? 0n;
      const charged = y < had ? y : had;
      balances[a] = had - charged;
      earned += charged;
      return { charged, tx_hash: '6zgh2u9DqHHiXzdy9ouTP7oGky2T4nugqzqt9wJZwNFm' };
    },
  };
  const bills = new Map<string, number>();
  const inner = scriptedLlm(
    Array.from({ length: 4 }, () => ({ content: 'an answer' })),
    { costUsd: 0.004, model: DEFAULT_MODEL },
  );
  const llm: LlmClient = {
    kind: inner.kind,
    model: inner.model,
    complete: async (req, o) => {
      const c = await inner.complete(req, o);
      return { ...c, inference_id: inferenceIdOf(c.completion_id) };
    },
    billed: async (ids) =>
      new Map(ids.flatMap((id) => (bills.has(id) ? [[id, bills.get(id) as number]] : []))),
  };
  const app = buildPetalApp(
    { root, stateDir, apiBase: SITE, llmDailyUsd: 5 },
    {
      llm,
      rpcFor: () => fakeRpcFor([alice]),
      registry: fakeRegistry().registry,
      // $2 a NEAR, so every figure checks by hand
      pay: { credit: chain, nearUsd: async () => 2 },
      env: { PETAL_AGENT_ACCESS: 'gated', PETAL_WALLET_KEY: 'ab'.repeat(32), NODE_ENV: 'test' },
    },
  );
  const jar = { cookie: '' };
  const request = async (path: string, method = 'GET', json?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: {
        origin: SITE,
        ...(json === undefined ? {} : { 'content-type': 'application/json' }),
        ...(jar.cookie ? { cookie: jar.cookie } : {}),
      },
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
    });
    const set = res.headers.getSetCookie().find((l) => l.startsWith(`${COOKIE}=`));
    if (set) jar.cookie = set.split(';')[0] as string;
    return res;
  };
  const signIn = async () => {
    const c = (await (await request('/api/v1/auth/challenge', 'POST', {})).json()) as Out;
    await request('/api/v1/auth/verify', 'POST', {
      network: 'mainnet',
      proof: alice.sign(c as never),
    });
  };
  const chat = async () => {
    await (
      await request('/api/v1/agent/chat', 'POST', {
        messages: [{ role: 'user', content: 'who holds the power here?' }],
      })
    ).text();
    await new Promise((r) => setTimeout(r, 20));
  };
  const entries = async () => {
    const s = openStore(join(stateDir, 'private.db'));
    try {
      const person = ((await (await request('/api/v1/me')).json()) as Out).person_id;
      return (await s.credit.entries(`person:${person}`)).filter((e) => e.reason.startsWith('Tip'));
    } finally {
      await s.close();
    }
  };
  return { request, signIn, chat, bills, entries, earned: () => earned, balances };
}

describe('a tip on the credit contract', () => {
  test('set it, a turn is charged, the bill comes in with the tip, and the next charge carries it into earned', async () => {
    const w = setup();
    await w.signIn();
    expect(
      await (await w.request('/api/v1/me/tip', 'PUT', { tip_percent: 20 })).json(),
    ).toMatchObject({ tip_percent: 20 });
    // the first turn: $0.004 counted, charged on chain when it ends ($0.004 at $2 a NEAR is 0.002 NEAR)
    await w.chat();
    expect(w.earned()).toBe((2n * NEAR) / 1000n);
    // NEAR AI bills that call $0.004, so nothing comes back; the tip is 20% of it, $0.0008, its own entry
    w.bills.set(inferenceIdOf('cmpl-1'), 0.004);
    const usage = (await (await w.request('/api/v1/me/usage')).json()) as Out;
    expect(usage.totals).toMatchObject({ calls: 1, billed_usd: 0.004, reconciled: 1 });
    expect((await w.entries()).map((e) => e.delta_usd)).toEqual([-0.0008]);
    // the next turn's charge carries the tip: $0.004 + $0.0008 = $0.0048, 0.0024 NEAR
    await w.chat();
    expect(w.earned()).toBe((2n * NEAR) / 1000n + (24n * NEAR) / 10000n);
    // all told the contract earned both bills and the tip: $0.0088
    expect((Number(w.earned()) / 1e24) * 2).toBeCloseTo(0.0088, 9);
    expect(w.balances['alice.near']).toBe(NEAR - w.earned());
  });
});

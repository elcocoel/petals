// The price on Petals' agent (price/v2; Elco, 10 Nov: "there's three components to the price"): NEAR AI's
// bill, plus a base fee whose switches are all off live, plus the person's tip, a donation at a percent of
// their usage, 0 by default. Each goes onto the credit as its own entry, naming the price.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Price, priceHash } from '@petal/core';
import { fakeRpcFor, testSigner } from '@petal/near/auth/testing';
import { openStore } from '@petal/store';
import { describe, expect, test } from 'vitest';
import { buildPetalApp } from '../src/app.ts';
import { fundPerson } from '../src/invites.ts';
import type { LlmClient } from '../src/llm.ts';
import { DEFAULT_MODEL, inferenceIdOf } from '../src/near-ai.ts';
import { PRICE, PRICE_FILE } from '../src/price.ts';
import { fakeRegistry, scriptedLlm, tmpRoot } from './helpers.ts';

const SITE = 'https://petals.example';
const COOKIE = '__Host-petal_session';
const alice = testSigner('alice.near');
// biome-ignore lint/suspicious/noExplicitAny: walking what the server answers
type Out = Record<string, any>;
const FIXTURE = new URL('../../core/schema/fixtures/price.v2.json', import.meta.url);

function setup(price: Price | undefined, bills: Map<string, number>) {
  const root = tmpRoot();
  const stateDir = join(root, 'state');
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
      ...(price ? { price } : {}),
      rpcFor: () => fakeRpcFor([alice]),
      registry: fakeRegistry().registry,
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
  let person = '';
  const signInFunded = async () => {
    const c = (await (await request('/api/v1/auth/challenge', 'POST', {})).json()) as Out;
    await request('/api/v1/auth/verify', 'POST', {
      network: 'mainnet',
      proof: alice.sign(c as never),
    });
    person = ((await (await request('/api/v1/me')).json()) as Out).person_id;
    const s = openStore(join(stateDir, 'private.db'));
    try {
      await fundPerson(s, person, 5);
    } finally {
      await s.close();
    }
  };
  const entries = async () => {
    const s = openStore(join(stateDir, 'private.db'));
    try {
      return (await s.credit.entries(`person:${person}`)).filter(
        (e) => e.reason.startsWith('Petals base fee') || e.reason.startsWith('Tip to Petals'),
      );
    } finally {
      await s.close();
    }
  };
  const chat = (q: string) =>
    request('/api/v1/agent/chat', 'POST', { messages: [{ role: 'user', content: q }] }).then((r) =>
      r.text(),
    );
  return { request, signInFunded, entries, chat };
}

describe('price/v2 on the server', () => {
  test('the live price is every switch off, served with its hash, so Petals runs at cost', async () => {
    expect(PRICE).toEqual(JSON.parse(readFileSync(FIXTURE, 'utf8')));
    expect(readFileSync(PRICE_FILE, 'utf8')).toBe(readFileSync(FIXTURE, 'utf8'));
    const bills = new Map<string, number>();
    const w = setup(undefined, bills);
    expect(await (await w.request('/api/v1/price')).json()).toMatchObject({
      price: PRICE,
      hash: priceHash(PRICE),
    });
    await w.signInFunded();
    await w.chat('first');
    bills.set(inferenceIdOf('cmpl-1'), 0.001);
    await w.request('/api/v1/me/usage');
    expect(await w.entries()).toEqual([]);
  });

  test("the base fee and the person's tip, each its own entry; the tip a percent of the bill they set", async () => {
    const price = structuredClone(PRICE);
    price.base.usage = { on: true, percent: 10 };
    price.base.per_turn = { on: true, usd: 0.002 };
    const bills = new Map<string, number>();
    const w = setup(price, bills);
    await w.signInFunded();
    expect(await (await w.request('/api/v1/me/tip')).json()).toMatchObject({
      tip_percent: 0,
      min_percent: 0,
      max_percent: 50,
      step_percent: 1,
    });
    expect((await w.request('/api/v1/me/tip', 'PUT', { tip_percent: 51 })).status).toBe(400);
    expect(
      await (await w.request('/api/v1/me/tip', 'PUT', { tip_percent: 20 })).json(),
    ).toMatchObject({ tip_percent: 20 });
    await w.chat('first');
    bills.set(inferenceIdOf('cmpl-1'), 0.01);
    await w.request('/api/v1/me/usage');
    const hash = priceHash(price).slice(0, 12);
    // the turn's base fee $0.002; the call's base fee 10% of $0.01; the tip 20% of $0.01, apart
    expect((await w.entries()).map((e) => [e.reason, e.delta_usd]).sort()).toEqual([
      [`Petals base fee (call, price ${hash})`, -0.001],
      [`Petals base fee (turn, price ${hash})`, -0.002],
      [`Tip to Petals (price ${hash})`, -0.002],
    ]);
  });
});

// The price's switches on Petals' agent (price/v1; Elco, 10 Nov: "build the switches for all of them as
// options that we can choose later"). The live price is all off, so Petals runs at cost; with a switch on,
// Petals' part goes onto the person's credit as its own entry, naming the price, times their tip.
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
const FIXTURE = new URL('../../core/schema/fixtures/price.v1.json', import.meta.url);

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
      return (await s.credit.entries(`person:${person}`)).filter((e) =>
        e.reason.startsWith('Petals ('),
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

describe('price/v1 on the server', () => {
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

  test('with a fee and the protocol rate on: each billed call, times the tip, as its own entry', async () => {
    const price = structuredClone(PRICE);
    price.fees.usage = { on: true, percent: 10 };
    price.fees.per_turn = { on: true, usd: 0.002 };
    price.protocol = { on: true, percent: 5 };
    const bills = new Map<string, number>();
    const w = setup(price, bills);
    await w.signInFunded();
    expect(await (await w.request('/api/v1/me/tip')).json()).toMatchObject({
      tip: 1,
      min: 0,
      max: 10,
    });
    expect((await w.request('/api/v1/me/tip', 'PUT', { tip: 11 })).status).toBe(400);
    expect(await (await w.request('/api/v1/me/tip', 'PUT', { tip: 2 })).json()).toMatchObject({
      tip: 2,
    });
    await w.chat('first');
    bills.set(inferenceIdOf('cmpl-1'), 0.01);
    await w.request('/api/v1/me/usage');
    const got = await w.entries();
    const hash = priceHash(price).slice(0, 12);
    // the turn: $0.002 × 2; the call: 10% of $0.01 × 2, plus 5% of $0.01
    expect(got.map((e) => [e.reason, e.delta_usd]).sort()).toEqual([
      [`Petals (call, price ${hash})`, -0.0025],
      [`Petals (turn, price ${hash})`, -0.004],
    ]);
  });
});

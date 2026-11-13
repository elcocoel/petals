// usage/v1: every model call is kept with NEAR AI's id for it, the
// tokens and the price it was counted at, and what was charged; NEAR AI's own bill is read by that id, and
// the person is charged the bill: the difference goes back as its own entry. A scripted model with a fake
// billing, so nothing is spent.
import { join } from 'node:path';
import { canonicalJson } from '@petal/core';
import { fakeRpcFor, testSigner } from '@petal/near/auth/testing';
import { openStore } from '@petal/store';
import { describe, expect, test } from 'vitest';
import { buildPetalApp } from '../src/app.ts';
import { fundPerson, personCredit } from '../src/invites.ts';
import type { LlmClient } from '../src/llm.ts';
import { DEFAULT_MODEL, inferenceIdOf } from '../src/near-ai.ts';
import { RECONCILED } from '../src/usage.ts';
import { fakeRegistry, scriptedLlm, tmpRoot } from './helpers.ts';

const SITE = 'https://petals.example';
const COOKIE = '__Host-petal_session';
const alice = testSigner('alice.near');
// biome-ignore lint/suspicious/noExplicitAny: walking what the server answers
type Out = Record<string, any>;

/** A scripted model whose answers carry NEAR AI's ids, and a billing that knows what it was told. */
function billedLlm(costUsd: number, bills: Map<string, number>): LlmClient {
  const inner = scriptedLlm(
    Array.from({ length: 6 }, () => ({ content: 'an answer' })),
    { costUsd, model: DEFAULT_MODEL },
  );
  return {
    kind: inner.kind,
    model: inner.model,
    async complete(req, o) {
      const c = await inner.complete(req, o);
      return {
        ...c,
        inference_id: inferenceIdOf(c.completion_id),
        list_price: { in: 0.3, cached: 0.006, out: 1.2 },
      };
    },
    billed: async (ids) =>
      new Map(ids.flatMap((id) => (bills.has(id) ? [[id, bills.get(id) as number]] : []))),
  };
}

function setup(llm: LlmClient) {
  const root = tmpRoot();
  const stateDir = join(root, 'state');
  const app = buildPetalApp(
    { root, stateDir, apiBase: SITE, llmDailyUsd: 5 },
    {
      llm,
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
  const credit = async () => {
    const s = openStore(join(stateDir, 'private.db'));
    try {
      return {
        credit: await personCredit(s, person),
        entries: await s.credit.entries(`person:${person}`),
      };
    } finally {
      await s.close();
    }
  };
  const chat = (q: string) =>
    request('/api/v1/agent/chat', 'POST', { messages: [{ role: 'user', content: q }] }).then((r) =>
      r.text(),
    );
  return { request, signInFunded, credit, chat };
}

describe('usage/v1', () => {
  test("every call is kept with NEAR AI's id, and the person is charged NEAR AI's bill", async () => {
    const bills = new Map<string, number>();
    const w = setup(billedLlm(0.004, bills));
    await w.signInFunded();
    await w.chat('first');
    // not billed yet: what was counted is what was charged
    let usage = (await (await w.request('/api/v1/me/usage')).json()) as Out;
    expect(usage.totals).toMatchObject({ calls: 1, charged_usd: 0.004, reconciled: 0 });
    const [rec] = usage.usage;
    expect(rec).toMatchObject({
      petal: 'usage/v1',
      call: inferenceIdOf('cmpl-1'),
      completion: 'cmpl-1',
      model: DEFAULT_MODEL,
      tokens: { in: 100, cached: 0, out: 10 },
      computed_usd: 0.004,
      charged_usd: 0.004,
      billed_usd: null,
    });
    // NEAR AI bills less: the difference goes back, once, as its own entry
    bills.set(rec.call, 0.001);
    usage = (await (await w.request('/api/v1/me/usage')).json()) as Out;
    expect(usage.usage[0]).toMatchObject({ billed_usd: 0.001 });
    expect(usage.totals).toMatchObject({ reconciled: 1, billed_usd: 0.001 });
    await w.request('/api/v1/me/usage');
    const { credit, entries } = await w.credit();
    expect(entries.filter((e) => e.reason === RECONCILED).map((e) => e.delta_usd)).toEqual([0.003]);
    expect(credit?.spent_usd).toBeCloseTo(0.001, 9);
    // the record is usage/v1 as its schema has it
    expect(canonicalJson(usage.usage[0])).toBeTruthy();
  });

  test("the next chat reconciles the last one's calls first", async () => {
    const bills = new Map<string, number>();
    const w = setup(billedLlm(0.004, bills));
    await w.signInFunded();
    await w.chat('first');
    bills.set(inferenceIdOf('cmpl-1'), 0.005);
    await w.chat('second');
    const { entries } = await w.credit();
    // NEAR AI billed more: the difference is charged
    expect(entries.filter((e) => e.reason === RECONCILED).map((e) => e.delta_usd)).toEqual([
      -0.001,
    ]);
  });
});

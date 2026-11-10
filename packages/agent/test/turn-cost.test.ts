// What a turn really costs (Elco, 10 Nov: "how fast my balance is going down (the price estimates seem
// incorrect)"): the catalogue gives each model the median cost of its last turns here, priced as NEAR AI
// bills them (cached input at the cache-read rate), and nothing until it has one. Scripted model, no spend.
import { join } from 'node:path';
import { fakeRpcFor, testSigner } from '@petal/near/auth/testing';
import { openStore } from '@petal/store';
import { describe, expect, test } from 'vitest';
import { buildPetalApp } from '../src/app.ts';
import { fundPerson } from '../src/invites.ts';
import { DEFAULT_MODEL } from '../src/near-ai.ts';
import { fakeRegistry, scriptedLlm, tmpRoot } from './helpers.ts';

const SITE = 'https://petals.example';
const COOKIE = '__Host-petal_session';
const alice = testSigner('alice.near');
// biome-ignore lint/suspicious/noExplicitAny: walking what the server answers
type Out = Record<string, any>;

function setup(costUsd: number) {
  const root = tmpRoot();
  const stateDir = join(root, 'state');
  const app = buildPetalApp(
    { root, stateDir, apiBase: SITE, llmDailyUsd: 5 },
    {
      llm: scriptedLlm(
        Array.from({ length: 6 }, () => ({ content: 'an answer' })),
        { costUsd, model: DEFAULT_MODEL },
      ),
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
  const signInFunded = async () => {
    const c = (await (await request('/api/v1/auth/challenge', 'POST', {})).json()) as Out;
    await request('/api/v1/auth/verify', 'POST', {
      network: 'mainnet',
      proof: alice.sign(c as never),
    });
    const me = (await (await request('/api/v1/me')).json()) as Out;
    const s = openStore(join(stateDir, 'private.db'));
    try {
      await fundPerson(s, me.person_id, 5);
    } finally {
      await s.close();
    }
  };
  const deepseek = async () =>
    ((await (await request('/api/v1/catalogue')).json()) as Out).providers[0].models.find(
      (m: Out) => m.id === DEFAULT_MODEL,
    );
  return { request, signInFunded, deepseek };
}

describe('what a turn costs, measured', () => {
  test('nothing until a turn is measured, then the median of the last turns on that model', async () => {
    const w = setup(0.004);
    expect(await w.deepseek()).toMatchObject({ usd_per_turn: null, turns_measured: 0 });
    await w.signInFunded();
    for (const q of ['first', 'second', 'third']) {
      await (
        await w.request('/api/v1/agent/chat', 'POST', { messages: [{ role: 'user', content: q }] })
      ).text();
    }
    expect(await w.deepseek()).toMatchObject({ usd_per_turn: 0.004, turns_measured: 3 });
  });
});

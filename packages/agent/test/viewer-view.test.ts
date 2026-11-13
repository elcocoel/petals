// Petals' agent draws through the person's view, the glasses they see everything through: every tool its run
// calls has that view as the viewer's, so render_flower draws, and the agent describes, what the person sees.
// Scripted model, no spend.
import { join } from 'node:path';
import { DEFAULT_VIEW } from '@petal/core';
import type { View } from '@petal/core/types';
import { fakeRpcFor, testSigner } from '@petal/near/auth/testing';
import { openStore } from '@petal/store';
import { describe, expect, test } from 'vitest';
import { buildPetalApp } from '../src/app.ts';
import { fundPerson } from '../src/invites.ts';
import { fakeRegistry, parseSse, scriptedLlm, tmpRoot } from './helpers.ts';

const SITE = 'https://petals.example';
const COOKIE = '__Host-petal_session';
const alice = testSigner('alice.near');
const IDENTITY: View = {
  ...DEFAULT_VIEW,
  dimensions: { ...DEFAULT_VIEW.dimensions, colour: { data: 'identity' } },
};

function setup() {
  const root = tmpRoot();
  const stateDir = join(root, 'state');
  const seen: (View | undefined)[] = [];
  const fake = fakeRegistry();
  // what the run's tools are handed as the viewer's view
  const registry = fake.registry.map((t) =>
    t.name === 'list_networks'
      ? {
          ...t,
          run: (args: unknown, ctx: { view?: View }) => (
            seen.push(ctx.view), t.run(args, ctx as never)
          ),
        }
      : t,
  );
  const app = buildPetalApp(
    { root, stateDir, apiBase: SITE, llmDailyUsd: 5 },
    {
      llm: scriptedLlm(
        [{ calls: [{ name: 'list_networks', args: {} }] }, { content: 'Here it is.' }],
        { costUsd: 0.01 },
      ),
      rpcFor: () => fakeRpcFor([alice]),
      registry: registry as never,
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
    const c = (await (await request('/api/v1/auth/challenge', 'POST', {})).json()) as {
      nonce: string;
      message: string;
      recipient: string;
    };
    await request('/api/v1/auth/verify', 'POST', { network: 'mainnet', proof: alice.sign(c) });
    const me = (await (await request('/api/v1/me')).json()) as { person_id: string };
    const s = openStore(join(stateDir, 'private.db'));
    try {
      await fundPerson(s, me.person_id, 5);
    } finally {
      await s.close();
    }
  };
  return { request, signInFunded, seen };
}

const ASK = { messages: [{ role: 'user', content: 'what can you map?' }] };

describe("Petals' agent sees through the person's view", () => {
  test("a person who set one: every tool of the run has it as the viewer's", async () => {
    const w = setup();
    await w.signInFunded();
    expect((await w.request('/api/v1/me/view', 'PUT', { view: IDENTITY })).status).toBe(200);
    parseSse(await (await w.request('/api/v1/agent/chat', 'POST', ASK)).text());
    expect(w.seen).toEqual([IDENTITY]);
  });

  test("a person who didn't: the default", async () => {
    const w = setup();
    await w.signInFunded();
    parseSse(await (await w.request('/api/v1/agent/chat', 'POST', ASK)).text());
    expect(w.seen).toEqual([DEFAULT_VIEW]);
  });
});

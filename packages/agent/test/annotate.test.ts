// Petals' agent keeps what the person tells it (annotation-layer.md step 3): "this is Dekan's wallet" becomes a
// name in their project, in the same message as its answer, at no model call of its own, with their account
// answering for it. Through petalApp, signed in with a test wallet, scripted model. The names are invented.
import { join } from 'node:path';
import { fakeRpcFor, testSigner } from '@petal/near/auth/testing';
import { openStore } from '@petal/store';
import { describe, expect, test } from 'vitest';
import { buildPetalApp } from '../src/app.ts';
import { fundPerson } from '../src/invites.ts';
import { fakeRegistry, parseSse, type ScriptTurn, scriptedLlm, tmpRoot } from './helpers.ts';

const SITE = 'https://petals.example';
const COOKIE = '__Host-petal_session';
const alice = testSigner('alice.near');
const DEKAN = 'eip155:100:0xced608aa29bb92185d9b6340adcbfa263dae075b';
const SAID = { messages: [{ role: 'user', content: "0xced6… is Dekan's wallet" }] };
const NAMED = {
  annotations: [{ subject: DEKAN, verb: 'named', object: { value: 'Dekan' }, kind: 'stated' }],
};

// biome-ignore lint/suspicious/noExplicitAny: reading answers
type Out = Record<string, any>;

function setup(turns: ScriptTurn[]) {
  const root = tmpRoot();
  const stateDir = join(root, 'state');
  const llm = scriptedLlm(turns, { costUsd: 0.01 });
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
  const call = async (method: string, path: string, json?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: {
        origin: SITE,
        'content-type': 'application/json',
        ...(jar.cookie ? { cookie: jar.cookie } : {}),
      },
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
    });
    const set = res.headers.getSetCookie().find((l) => l.startsWith(`${COOKIE}=`));
    if (set) jar.cookie = set.split(';')[0] as string;
    return res;
  };
  const signInFunded = async () => {
    const c = (await (await call('POST', '/api/v1/auth/challenge', {})).json()) as Out;
    await call('POST', '/api/v1/auth/verify', {
      network: 'mainnet',
      proof: alice.sign(c as never),
    });
    const me = (await (await call('GET', '/api/v1/me')).json()) as Out;
    const s = openStore(join(stateDir, 'private.db'));
    try {
      await fundPerson(s, me.person_id, 5);
    } finally {
      await s.close();
    }
  };
  /** A chat, and the project its conversation keeps. */
  const chat = async () => {
    const events = parseSse(await (await call('POST', '/api/v1/agent/chat', SAID)).text());
    const runId = (events[0] as { data: { run_id: string } }).data.run_id;
    const conversation = (await (
      await call('GET', `/api/v1/conversations/${runId}`)
    ).json()) as Out;
    return { events, exploration: conversation.conversation.exploration as string };
  };
  const kept = async (exploration: string) =>
    ((await (await call('GET', `/api/v1/explorations/${exploration}/annotations`)).json()) as Out)
      .annotations as Out[];
  return { llm, call, signInFunded, chat, kept };
}

describe("Petals' agent keeps what the person tells it", () => {
  test('"this is Dekan\'s wallet" is kept as a name, the person\'s word, in the same message as the answer', async () => {
    const w = setup([
      {
        content: "Kept in your project: 0xced6… is Dekan's.",
        calls: [{ name: 'annotate', args: NAMED }],
      },
    ]);
    await w.signInFunded();
    const { exploration } = await w.chat();
    // no model call of its own: the answer was already said
    expect(w.llm.requests).toHaveLength(1);
    expect(w.llm.requests[0]?.tools?.some((t) => t.name === 'annotate')).toBe(true);
    expect(w.llm.requests[0]?.messages[0]?.content).toContain('## Annotations');
    expect(await w.kept(exploration)).toMatchObject([
      {
        exploration,
        claim: {
          petal: 'claim/v2',
          subject: DEKAN,
          verb: 'named',
          object: { value: 'Dekan' },
          kind: 'stated',
          by: 'near:mainnet:alice.near',
          via: 'tool:petals-agent@1',
          evidence: [],
        },
      },
    ]);
  });

  test('the person reads every name they keep, from all their projects; a visitor reads none', async () => {
    const w = setup([
      {
        content: "Kept in your project: 0xced6… is Dekan's.",
        calls: [{ name: 'annotate', args: NAMED }],
      },
    ]);
    expect((await w.call('GET', '/api/v1/me/annotations')).status).toBe(401);
    await w.signInFunded();
    const { exploration } = await w.chat();
    const mine = (await (await w.call('GET', '/api/v1/me/annotations?verb=named')).json()) as Out;
    expect(mine.annotations).toMatchObject([
      { exploration, claim: { subject: DEKAN, object: { value: 'Dekan' }, kind: 'stated' } },
    ]);
    const notes = (await (await w.call('GET', '/api/v1/me/annotations?verb=noted')).json()) as Out;
    expect(notes.annotations).toEqual([]);
  });

  test("one that isn't kept goes back to the model, which says so or fixes it", async () => {
    const wrong = { annotations: [{ ...NAMED.annotations[0], subject: '0xced6' }] };
    const w = setup([
      { content: 'Kept.', calls: [{ name: 'annotate', args: wrong }] },
      { calls: [{ name: 'annotate', args: NAMED }] },
      { content: "Kept in your project: 0xced6… is Dekan's." },
    ]);
    await w.signInFunded();
    const { exploration } = await w.chat();
    expect(w.llm.requests).toHaveLength(3);
    expect(JSON.stringify(w.llm.requests[1]?.messages.at(-1))).toMatch(/None was added/);
    expect((await w.kept(exploration)).map((a) => a.claim.object.value)).toEqual(['Dekan']);
  });
});

// Test 1, lines 2 and 3 (coordinator/test-1.md), at $0: the real routes, the real NEAR AI client, the real
// tools and SQLite, on the stub model. What isn't real: the model, and the chain behind sign-in (a fake RPC,
// so it needs no network). tests/e2e/test1-path.ts does this over HTTP, through Next, on NEAR's real RPC.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPetalApp, mintInvite, modelOf, openPrivateStore } from '@petal/agent';
import { fakeRpc, fakeRpcFor, implicitSigner, testSigner } from '@petal/near/auth/testing';
import { afterEach, describe, expect, test } from 'vitest';
import { REPO, readSse } from './helpers.ts';
import { stubModel } from './stub-model.ts';
import { SESSION_COOKIE, seedWorkspace } from './workspace-seed.ts';

const WALLET_KEY = 'cd'.repeat(32);
const DEEPSEEK = 'deepseek-ai/DeepSeek-V4.1-Flash-1017';
const GLM = 'z-ai/glm-5.3-flash';
const QWEN = 'Qwen/Qwen3.8-27B';
const HAIKU = 'anthropic/claude-haiku-5-5';
const SONNET = 'anthropic/claude-sonnet-5-5';
const QUESTION = 'Who stands behind NEAR’s validators?';

/** A script as SYSTEMS runs it: its own process, its own environment, and its print or its error. */
function script(name: string, args: string[], env: Record<string, string> = {}) {
  const out = spawnSync(process.execPath, [join(REPO, 'scripts', name), ...args], {
    env,
    encoding: 'utf8',
  });
  if (out.status !== 0) {
    throw new Error(
      out.stderr.replace(/^.*(ExperimentalWarning|trace-warnings).*\n?/gm, '').trim(),
    );
  }
  return out.stdout;
}
const bindWallet = (args: string[], env: Record<string, string> = {}) =>
  script('bind-wallet.ts', args, env);
const fundPerson = (args: string[]) => script('fund-person.ts', args);

const closing: (() => void)[] = [];
afterEach(() => {
  for (const close of closing.splice(0)) close();
});

interface World {
  o?: { dailyUsd?: number; env?: Record<string, string>; rpc?: ReturnType<typeof fakeRpc> };
}

/** A server's worth of everything, on its own stub and state folder. */
async function world(o: World['o'] = {}) {
  const stub = stubModel();
  const server: Server = createServer((req, res) => stub.handle(req, res));
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  const modelBase = `http://127.0.0.1:${port}/v1`;
  const stateDir = mkdtempSync(join(tmpdir(), 'petal-test1-'));
  closing.push(() => {
    server.close();
    rmSync(stateDir, { recursive: true, force: true });
  });
  const app = buildPetalApp(
    { root: REPO, stateDir, nearAiApiKey: 'stub', llmDailyUsd: o.dailyUsd ?? 5, map: null },
    {
      nearAi: {
        baseURL: modelBase,
        signatureDelaysMs: [0],
        attestationsDir: join(stateDir, 'attestations'),
      },
      env: {
        NODE_ENV: 'test',
        PETAL_AGENT_ACCESS: 'gated',
        PETAL_WALLET_KEY: WALLET_KEY,
        ...o.env,
      },
      rpcFor: () => o.rpc ?? fakeRpc({}),
      chatsPerHour: 1000,
      followUpsPerHour: 1000,
    },
  );
  const env = { PETAL_WALLET_KEY: WALLET_KEY };
  return { stub, app, stateDir, modelBase, env };
}
type W = Awaited<ReturnType<typeof world>>;

/** A browser: only its cookie, kept as a real one keeps it. */
function browser(w: W, cookie = '') {
  let jar = cookie;
  const request = async (path: string, method = 'GET', json?: unknown) => {
    const res = await w.app.request(path, {
      method,
      headers: {
        ...(jar ? { cookie: jar } : {}),
        ...(json === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
    });
    jar = res.headers.get('set-cookie')?.split(';')[0] ?? jar;
    return res;
  };
  return {
    request,
    async signIn(signer: ReturnType<typeof testSigner>, network = 'mainnet') {
      const c = (await (await request('/api/v1/auth/challenge', 'POST')).json()) as {
        nonce: string;
        message: string;
        recipient: string;
      };
      return request('/api/v1/auth/verify', 'POST', { network, proof: signer.sign(c) });
    },
    async me() {
      return (await (await request('/api/v1/me')).json()) as {
        person_id: string;
        network: string;
        wallets: { caip10: string; network: string }[];
        credit: { funded_usd: number; spent_usd: number; left_usd: number; usd_per_chat: number };
      };
    },
    async conversations() {
      const body = (await (await request('/api/v1/conversations')).json()) as {
        conversations: { id: string }[];
      };
      return body.conversations.map((x) => x.id).sort();
    },
    async conversation(id: string) {
      const body = (await (await request(`/api/v1/conversations/${id}`)).json()) as {
        conversation: {
          settings: { model: string; effort: string | null };
          answered_by: string | null;
          turns: {
            model: string | null;
            picked: string | null;
            fallback_used: boolean;
            cost_usd: number;
            model_calls: number;
          }[];
        };
      };
      return body.conversation;
    },
    /** One message; the stream to its end, with the run it's in and its `done`. */
    async say(content: string, more: Record<string, unknown> = {}) {
      const sent = Date.now();
      const res = await request('/api/v1/agent/chat', 'POST', {
        messages: [{ role: 'user', content }],
        ...more,
      });
      if (!res.ok) return { refused: res.status, body: await res.json() };
      const events = await readSse(res, sent);
      const named = (name: string) => events.filter((e) => e.event === name);
      return {
        events,
        named,
        run: (events[0]?.data as { run_id?: string } | undefined)?.run_id ?? '',
        done: named('done').at(-1)?.data as {
          model: string;
          picked?: string;
          fallback_used: boolean;
          cost_usd: number;
          turns: number;
        },
        error: named('error').at(-1)?.data as { code: string; message: string } | undefined,
      };
    },
  };
}
type Said = Extract<Awaited<ReturnType<ReturnType<typeof browser>['say']>>, { run: string }>;

/** A person with a wallet and this much of their own credit. */
async function funded(w: W, usd: number, seed = 'alice') {
  const b = browser(w);
  await b.signIn(implicitSigner(seed));
  const { person_id: person } = await b.me();
  fundPerson(['--state', w.stateDir, '--person', person, '--total', String(usd)]);
  return { b, person };
}

/** The question, the agent asking, the yes, the flower: the second chat's stream. */
async function flowerChat(b: ReturnType<typeof browser>, settings?: Record<string, unknown>) {
  const first = (await b.say(QUESTION, settings ? { settings } : {})) as Said;
  return (await b.say('yes', { run_id: first.run })) as Said;
}

describe('line 2: one person, whichever wallet', () => {
  test('two test wallets, bound by the script, sign in to the same person and the same conversations', async () => {
    const w = await world();
    const store = openPrivateStore(w.stateDir);
    const invite = mintInvite(store, { usd: 1, days: 1 });
    store.close();
    const seed = await seedWorkspace({
      stateDir: w.stateDir,
      modelBase: w.modelBase,
      walletKey: WALLET_KEY,
      inviteId: invite.id,
    });
    // The seeded browser signs in, as Elco's first did: its work moves to the person.
    const first = browser(w, `${SESSION_COOKIE}=${seed.session}`);
    const signedIn = await first.signIn(implicitSigner('alice'));
    expect(signedIn.status).toBe(200);
    const { person_id: person } = await first.me();
    const theirs = await first.conversations();
    expect(theirs.length).toBe(seed.conversations);

    const bob = implicitSigner('bob');
    const carol = implicitSigner('carol');
    const bound = bindWallet(
      [
        '--state',
        w.stateDir,
        '--person',
        person,
        '--wallet',
        `near:mainnet:${bob.accountId}`,
        '--wallet',
        `near:testnet:${carol.accountId}`,
      ],
      w.env,
    );
    expect(bound).toContain(`near:mainnet:${bob.accountId}: bound`);
    expect(bound).not.toContain(WALLET_KEY);

    // Another browser, another wallet, the other network: the same person, the same conversations.
    const second = browser(w);
    await second.signIn(bob);
    const asBob = await second.me();
    expect(asBob.person_id).toBe(person);
    expect(asBob.network).toBe('mainnet');
    expect(await second.conversations()).toEqual(theirs);
    const third = browser(w);
    await third.signIn(carol, 'testnet');
    const asCarol = await third.me();
    expect(asCarol.person_id).toBe(person);
    // The session says which wallet they came in with. Nothing else reads it, so nothing splits them.
    expect(asCarol.network).toBe('testnet');
    expect(asCarol.wallets.map((x) => x.network).sort()).toEqual(['mainnet', 'mainnet', 'testnet']);
    expect(await third.conversations()).toEqual(theirs);
    // A conversation opens, and continues, from any of them.
    const id = theirs[0] as string;
    expect((await third.request(`/api/v1/conversations/${id}`)).status).toBe(200);

    // The same wallet on the other network is still someone else, and sees nothing.
    const other = browser(w);
    await other.signIn(bob, 'testnet');
    expect((await other.me()).person_id).not.toBe(person);
    expect(await other.conversations()).toEqual([]);
    expect((await other.request(`/api/v1/conversations/${id}`)).status).toBe(404);
  });

  test('the script is idempotent, and refuses a wrong key, someone else’s wallet and a typo', async () => {
    const w = await world();
    const a = browser(w);
    await a.signIn(implicitSigner('alice'));
    const { person_id: person } = await a.me();
    const b = browser(w);
    await b.signIn(implicitSigner('bob'));
    const base = ['--state', w.stateDir, '--person', person];
    const bind = (wallet: string, env = w.env) => bindWallet([...base, '--wallet', wallet], env);

    expect(bind('near:mainnet:petals.near')).toContain('near:mainnet:petals.near: bound');
    expect(bind('near:mainnet:petals.near')).toContain(': already this person’s'.replace('’', "'"));
    const store = openPrivateStore(w.stateDir);
    expect(store.walletBinding.ofPerson(person)).toHaveLength(2);
    store.close();

    expect(() => bind(`near:mainnet:${implicitSigner('bob').accountId}`)).toThrow(
      /already belongs/,
    );
    expect(() => bind('near:mainnet:elcocoel.near', { PETAL_WALLET_KEY: 'ef'.repeat(32) })).toThrow(
      /isn't the server's key/,
    );
    expect(() => bind('near:testnet:petals.near')).toThrow(/can't exist on testnet/);
    expect(() => bind('near:mainnet:elcocoel.testnet')).toThrow(/can't exist on mainnet/);
    expect(() => bind('petals.near')).toThrow(/isn't near:/);
    expect(() =>
      bindWallet(
        ['--state', w.stateDir, '--person', 'prs_nope', '--wallet', 'near:mainnet:x.near'],
        w.env,
      ),
    ).toThrow(/no person/);
    expect(() => bindWallet(['--state', join(w.stateDir, 'nope')], w.env)).toThrow(/no private.db/);
    // What it reads out holds no key, and works with none.
    const read = bindWallet(['--state', w.stateDir], {});
    expect(read).toContain(`person ${person}: 2 wallet(s)`);
    expect(read).toContain('sealed');
  });

  test('Elco’s wallets: named accounts sign with their own keys, on their own networks, and no one else’s do', async () => {
    const petals = testSigner('petals.near');
    const near = testSigner('elcocoel.near');
    const testnet = testSigner('elcocoel.testnet');
    const w = await world({ rpc: fakeRpcFor([petals, near, testnet]) });
    const first = browser(w);
    await first.signIn(petals);
    const { person_id: person } = await first.me();
    bindWallet(
      [
        '--state',
        w.stateDir,
        '--person',
        person,
        '--wallet',
        'near:mainnet:elcocoel.near',
        '--wallet',
        'near:testnet:elcocoel.testnet',
      ],
      w.env,
    );
    for (const [signer, network] of [
      [near, 'mainnet'],
      [testnet, 'testnet'],
    ] as const) {
      const b = browser(w);
      await b.signIn(signer, network);
      expect((await b.me()).person_id).toBe(person);
    }
    // The name alone gets nobody in: signing in still takes that account's key.
    const thief = browser(w);
    const refused = await thief.signIn(testSigner('elcocoel.near', 'a thief'));
    expect(refused.status).toBe(401);
  });

  test('--adopt-strays gives the person what has no owner or an anonymous one, and no one else’s', async () => {
    const w = await world();
    const a = browser(w);
    await a.signIn(implicitSigner('alice'));
    const { person_id: person } = await a.me();
    const b = browser(w);
    await b.signIn(implicitSigner('bob'));
    const { person_id: other } = await b.me();
    const at = new Date().toISOString();
    const store = openPrivateStore(w.stateDir);
    for (const [id, owner] of [
      ['unowned01', null],
      ['anonymous1', 'anon_1'],
      ['othersrun1', other],
    ] as const) {
      store.run.insert({
        id,
        owner,
        exploration: null,
        status: 'done',
        model: null,
        title: id,
        settings: null,
        body: JSON.stringify({ messages: [] }),
        created_at: at,
        updated_at: at,
      });
    }
    store.close();
    const out = bindWallet(['--state', w.stateDir, '--person', person, '--adopt-strays'], w.env);
    expect(out).toContain(`runs   2 moved to ${person}`);
    expect(await a.conversations()).toEqual(['anonymous1', 'unowned01']);
    expect(await b.conversations()).toEqual(['othersrun1']);
  });
});

describe('line 3: the model they picked, on their own money', () => {
  test('a pick names the model and its effort on the request, per conversation, and PATCH changes it', async () => {
    const w = await world();
    const { b } = await funded(w, 5);
    const glm = (await b.say(QUESTION, { settings: { model: GLM, effort: 'medium' } })) as Said;
    expect(w.stub.asked[0]).toEqual({ model: GLM, effort: 'medium' });
    expect(glm.done).toMatchObject({ model: GLM, picked: GLM, fallback_used: false });

    // Another conversation on another pick, at the same time as far as the client's concerned.
    const n = w.stub.asked.length;
    const haiku = (await b.say(QUESTION, { settings: { model: HAIKU } })) as Said;
    expect(w.stub.asked[n]).toEqual({ model: HAIKU, effort: null });
    expect(haiku.done).toMatchObject({ model: HAIKU, picked: HAIKU });

    // No pick: the server's default, at its default effort, with nothing stored.
    const m = w.stub.asked.length;
    const plain = (await b.say(QUESTION)) as Said;
    expect(w.stub.asked[m]).toEqual({ model: DEEPSEEK, effort: 'low' });
    expect(plain.done.model).toBe(DEEPSEEK);
    expect(plain.done).not.toHaveProperty('picked');

    // The first goes on as picked, and a change sticks to the next chat, by body or by PATCH.
    const k = w.stub.asked.length;
    await b.say('yes', { run_id: glm.run });
    expect(w.stub.asked[k]).toEqual({ model: GLM, effort: 'medium' });
    const patched = await b.request(`/api/v1/conversations/${glm.run}`, 'PATCH', {
      settings: { model: QWEN, effort: 'high' },
    });
    expect(patched.status).toBe(200);
    const j = w.stub.asked.length;
    await b.say('and now?', { run_id: glm.run });
    expect(w.stub.asked[j]).toEqual({ model: QWEN, effort: 'high' });
    const shown = await b.conversation(glm.run);
    expect(shown.settings.model).toBe(QWEN);
    expect(shown.answered_by).toBe(QWEN);
    expect(shown.turns.map((t) => [t.picked, t.model])).toEqual([
      [GLM, GLM],
      [GLM, GLM],
      [QWEN, QWEN],
    ]);
  });

  test('a pick outside the catalogue, or an effort it doesn’t offer, is refused before anything is spent', async () => {
    const w = await world();
    const { b } = await funded(w, 5);
    const before = await b.me();
    for (const settings of [
      { model: 'anthropic/claude-fable-5' },
      { model: 42 },
      { provider: 'openai', model: GLM },
      { model: GLM, effort: 'extreme' },
      { model: HAIKU, effort: 'low' },
    ]) {
      const said = await b.say(QUESTION, { settings });
      expect(said).toMatchObject({ refused: 400, body: { error: { code: 'bad_input' } } });
    }
    expect(w.stub.calls).toBe(0);
    expect((await b.me()).credit).toEqual(before.credit);
    expect(await b.conversations()).toEqual([]);
  });

  test('a fallback shows, and stays inside its promise', async () => {
    const w = await world();
    const { b } = await funded(w, 5);
    w.stub.down.add(GLM);
    const signed = (await b.say(QUESTION, { settings: { model: GLM, effort: 'medium' } })) as Said;
    expect(w.stub.asked.slice(0, 2)).toEqual([
      { model: GLM, effort: 'medium' },
      { model: QWEN, effort: 'medium' },
    ]);
    expect(signed.done).toMatchObject({ model: QWEN, picked: GLM, fallback_used: true });
    const shown = await b.conversation(signed.run);
    expect(shown.settings.model).toBe(GLM);
    expect(shown.answered_by).toBe(QWEN);
    expect(shown.turns[0]).toMatchObject({ picked: GLM, model: QWEN, fallback_used: true });

    // Every signed model down: nothing unsigned is ever asked.
    w.stub.down.add(QWEN).add(DEEPSEEK);
    const n = w.stub.asked.length;
    const none = (await b.say(QUESTION, { settings: { model: DEEPSEEK } })) as Said;
    const asked = w.stub.asked.slice(n).map((x) => x.model);
    expect(new Set(asked)).toEqual(new Set([DEEPSEEK, GLM, QWEN]));
    expect(none.error?.code).toBe('source_failed');
    expect(none.done.turns).toBe(0);
  });

  test('a passed-through pick with no fallback fails plainly, and doesn’t claim it answered', async () => {
    const w = await world();
    const { b } = await funded(w, 5);
    w.stub.down.add(HAIKU);
    const said = (await b.say(QUESTION, { settings: { model: HAIKU } })) as Said;
    expect(w.stub.asked).toEqual([{ model: HAIKU, effort: null }]);
    expect(said.error?.code).toBe('source_failed');
    expect(said.named('message')).toEqual([]);
    expect(said.done).toMatchObject({ turns: 0, picked: HAIKU, cost_usd: 0 });
    const shown = await b.conversation(said.run);
    expect(shown.answered_by).toBeNull();
    expect(shown.turns[0]).toMatchObject({ picked: HAIKU, model: null, model_calls: 0 });
    expect((await b.me()).credit.spent_usd).toBe(0);
  });

  test('credit needs no invite, follows the person across wallets and browsers, and spends down', async () => {
    const w = await world();
    const { b, person } = await funded(w, 5);
    const said = (await b.say(QUESTION, { settings: { model: GLM, effort: 'low' } })) as Said;
    expect(said.error).toBeUndefined();
    const after = await b.me();
    expect(after.credit.funded_usd).toBe(5);
    expect(after.credit.spent_usd).toBeCloseTo(said.done.cost_usd, 5);
    expect(after.credit.left_usd).toBeCloseTo(5 - said.done.cost_usd, 5);
    expect(after.credit.usd_per_chat).toBe(0.5);

    const bob = implicitSigner('bob');
    bindWallet(
      ['--state', w.stateDir, '--person', person, '--wallet', `near:mainnet:${bob.accountId}`],
      w.env,
    );
    const elsewhere = browser(w);
    await elsewhere.signIn(bob);
    expect((await elsewhere.me()).credit).toEqual(after.credit);
    const again = (await elsewhere.say(QUESTION, {
      settings: { model: GLM, effort: 'low' },
    })) as Said;
    expect(again.error).toBeUndefined();
    expect((await b.me()).credit.spent_usd).toBeCloseTo(
      said.done.cost_usd + again.done.cost_usd,
      5,
    );
    // Logged out, in a new browser: still theirs when they come back, and no invite was ever redeemed.
    const fresh = browser(w);
    await fresh.signIn(implicitSigner('alice'));
    expect((await fresh.me()).credit.spent_usd).toBeCloseTo(
      said.done.cost_usd + again.done.cost_usd,
      5,
    );
  });

  test('at the end of the credit it stops with a clear refusal, spends nothing more, and can be raised', async () => {
    const w = await world();
    const { b, person } = await funded(w, 0.0001);
    const last = (await b.say(QUESTION, { settings: { model: GLM, effort: 'low' } })) as Said;
    expect(last.error).toMatchObject({ code: 'budget_exhausted' });
    expect(last.error?.message).toMatch(/credit is used up/i);
    const calls = w.stub.calls;
    expect(calls).toBeGreaterThan(0);
    expect((await b.me()).credit.left_usd).toBe(0);

    const refused = await b.say(QUESTION);
    expect(refused).toMatchObject({ refused: 429, body: { error: { code: 'budget_exhausted' } } });
    expect(JSON.stringify(refused)).toMatch(/credit is used up/i);
    expect(w.stub.calls).toBe(calls);

    // Elco changes it.
    const out = fundPerson(['--state', w.stateDir, '--person', person, '--total', '5']);
    expect(out).toContain('funded $5');
    const back = (await b.say(QUESTION, { settings: { model: GLM, effort: 'low' } })) as Said;
    expect(back.error).toBeUndefined();
    expect(fundPerson(['--state', w.stateDir, '--person', person, '--total', '5'])).toContain(
      'funded $5',
    );
    const store = openPrivateStore(w.stateDir);
    const entries = store.credit.entries(`person:${person}`).filter((e) => e.reason === 'funded');
    expect(entries).toHaveLength(2);
    store.close();
    // And down to nothing, which stops them whatever's left.
    fundPerson(['--state', w.stateDir, '--person', person, '--total', '0']);
    expect(await b.say(QUESTION)).toMatchObject({ refused: 429 });
  });

  test('a stranger is refused, a person with no credit too, and nothing is spent', async () => {
    const w = await world();
    const { b } = await funded(w, 5);
    const before = (await b.me()).credit;
    const stranger = browser(w);
    expect(await stranger.say(QUESTION, { settings: { model: GLM } })).toMatchObject({
      refused: 403,
      body: { error: { code: 'invite_required' } },
    });
    const unfunded = browser(w);
    await unfunded.signIn(implicitSigner('dave'));
    expect((await unfunded.me()).credit).toBeNull();
    expect(await unfunded.say(QUESTION)).toMatchObject({
      refused: 403,
      body: { error: { code: 'invite_required' } },
    });
    expect(w.stub.calls).toBe(0);
    expect((await b.me()).credit).toEqual(before);
    const store = openPrivateStore(w.stateDir);
    expect(store.ledger.get(new Date().toISOString().slice(0, 10)).usd).toBe(0);
    store.close();
  });

  test('a flower-sized chat over 5¢ and under 50¢ isn’t cut off, and an invite’s cap still is', async () => {
    const w = await world();
    const { b } = await funded(w, 5);
    const said = await flowerChat(b, { model: SONNET });
    expect(said.error).toBeUndefined();
    expect(said.named('flower')).toHaveLength(1);
    expect(said.done.cost_usd).toBeGreaterThan(0.05);
    expect(said.done.cost_usd).toBeLessThan(0.5);
    expect(said.done.model).toBe(SONNET);

    // The same chat on an invite stops at the invite's cap, whatever the catalogue lists for Sonnet.
    expect(modelOf(SONNET)?.usd_per_chat).toBe(0.3);
    const store = openPrivateStore(w.stateDir);
    const invite = mintInvite(store, { usd: 1, days: 1 });
    store.close();
    const guest = browser(w);
    await guest.request('/api/v1/auth/invite', 'POST', { token: invite.token });
    const cut = await flowerChat(guest, { model: SONNET });
    expect(cut.error).toMatchObject({ code: 'budget_exhausted' });
    expect(cut.error?.message).toContain('$0.05');
  });

  test('the cap is the environment’s to change', async () => {
    const w = await world({ env: { PETAL_PERSON_USD_PER_CHAT: '0.06' } });
    const { b } = await funded(w, 5);
    expect((await b.me()).credit.usd_per_chat).toBe(0.06);
    const said = await flowerChat(b, { model: SONNET });
    expect(said.error?.message).toContain('$0.06');
  });

  test('the server’s daily cap still holds over a person’s credit', async () => {
    const w = await world({ dailyUsd: 0.0001 });
    const { b } = await funded(w, 5);
    const said = (await b.say(QUESTION, { settings: { model: GLM, effort: 'low' } })) as Said;
    expect(said.error).toMatchObject({ code: 'budget_exhausted' });
    expect(said.error?.message).toMatch(/today's budget/);
    expect((await b.me()).credit.left_usd).toBeGreaterThan(4.9);
  });
});

// The workspace (W1; design/workspace-data.md), through petalApp over HTTP shapes: conversations, work
// from other doors, the catalogue, following, a person's notes and search. Browsers are cookie jars. No
// model is called: answers come from a scripted client.
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { canonicalJson, specHash } from '@petal/core';
import type { Spec } from '@petal/core/types';
import { fakeRpcFor, testSigner } from '@petal/near/auth/testing';
import { openStore, type Store } from '@petal/store';
import { afterEach, describe, expect, test } from 'vitest';
import { buildPetalApp } from '../src/app.ts';
import { catalogue, modelOf, resolveSettings, settingsOf } from '../src/catalogue.ts';
import { mintInvite } from '../src/invites.ts';
import { DEFAULT_MODEL, FALLBACK_MODELS, PRICES } from '../src/near-ai.ts';
import { searchWords } from '../src/workspace.ts';
import { fakeRegistry, parseSse, scriptedLlm, tmpRoot } from './helpers.ts';

const SITE = 'https://petals.example';
const WALLET_KEY = 'ab'.repeat(32);
const ACCOUNT = 'near:mainnet:validator.poolv1.near';
const NETWORK = 'network:near-validators';
const SPEC = {
  petal: 'spec/v1',
  // no module has this id, so nothing tries to read this made-up spec as a real recipe
  network: { id: 'a-test-network', title: 'A test network', params: {} },
  snapshot: { sha256: 'a'.repeat(64), as_of: '2026-11-01T00:00:00Z', block_height: 1 },
  marker: 'a stored flower',
} as unknown as Spec;
const answers = (n: number) => Array.from({ length: n }, () => ({ content: 'an answer' }));

type App = ReturnType<typeof buildPetalApp>;
// biome-ignore lint/suspicious/noExplicitAny: walking what the server answers
type Out = Record<string, any>;

const open: Store[] = [];
afterEach(async () => {
  for (const s of open.splice(0)) await s.close();
});

function setup(o: { dailyUsd?: number; apiBase?: string } = {}) {
  const root = tmpRoot();
  const stateDir = join(root, 'state');
  const maker = testSigner('maker.testnet');
  const app = buildPetalApp(
    { root, stateDir, apiBase: o.apiBase ?? SITE, llmDailyUsd: o.dailyUsd ?? 1 },
    {
      llm: scriptedLlm(answers(30), { costUsd: 0.001 }),
      rpcFor: () => fakeRpcFor([maker]),
      registry: fakeRegistry().registry,
      env: { PETAL_AGENT_ACCESS: 'gated', PETAL_WALLET_KEY: WALLET_KEY, NODE_ENV: 'test' },
    },
  );
  const store = () => {
    const s = openStore(join(stateDir, 'private.db'));
    open.push(s);
    return s;
  };
  const invite = async () => (await mintInvite(store(), { usd: 1, days: 1 })).token;
  return { app, store, invite, maker };
}

class Browser {
  jar = new Map<string, string>();
  app: App;
  origin: string | null;
  constructor(app: App, origin: string | null = SITE) {
    this.app = app;
    this.origin = origin;
  }
  async request(path: string, init: RequestInit & { json?: unknown } = {}) {
    const headers = new Headers(init.headers);
    const cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) headers.set('cookie', cookie);
    if (this.origin && init.method && init.method !== 'GET') headers.set('origin', this.origin);
    if (init.json !== undefined) headers.set('content-type', 'application/json');
    const res = await this.app.request(path, {
      ...init,
      headers,
      ...(init.json === undefined ? {} : { body: JSON.stringify(init.json) }),
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair = ''] = line.split('; ');
      const at = pair.indexOf('=');
      this.jar.set(pair.slice(0, at), pair.slice(at + 1));
    }
    return res;
  }
  get = (path: string) => this.request(path);
  post = (path: string, json: unknown = {}) => this.request(path, { method: 'POST', json });
  patch = (path: string, json: unknown) => this.request(path, { method: 'PATCH', json });
  del = (path: string) => this.request(path, { method: 'DELETE' });
  /** Holds an invite, so a chat is let in; the session opens here. */
  redeem = (token: string) => this.post('/api/v1/auth/invite', { token });
  /** One chat, to its end. Returns its run id. */
  async chat(body: Out): Promise<string> {
    const res = await this.post('/api/v1/agent/chat', body);
    expect(res.status).toBe(200);
    const events = parseSse(await res.text());
    const first = events[0] as { event: string; data: { run_id: string } };
    expect(first.event).toBe('run');
    return first.data.run_id;
  }
}

const ask = (content: string, more: Out = {}) => ({
  messages: [{ role: 'user', content }],
  ...more,
});
const body = async (res: Response): Promise<Out> => (await res.json()) as Out;

async function signedIn(app: App, invite: () => Promise<string>) {
  const b = new Browser(app);
  await b.redeem(await invite());
  return b;
}

/** An exploration from another door: no run, written by a door that isn't the site. */
async function doorWork(store: Store, owner: string | null, id = `exp_${'1'.repeat(24)}`) {
  const at = '2026-11-02T00:00:00.000Z';
  await store.exploration.create({
    id,
    owner,
    question: 'Who holds the DAO?',
    target: 'near-validators',
    head: null,
    visibility: 'private',
    share_token_hash: null,
    forked_from: null,
    created_at: at,
    updated_at: at,
  });
  await store.step.append({
    exploration: id,
    parent: null,
    spec_sha256: null,
    recipe_sha256: null,
    snapshot_sha256: null,
    door: 'mcp',
    author: 'owner',
    note: 'drew it in Claude Code',
    at,
  });
  await store.note.append({
    exploration: id,
    author: 'link:abc',
    door: 'mcp',
    text: 'the delegate looks concentrated',
    at: '2026-11-02T00:00:01.000Z',
  });
  return id;
}

const subjectOf = async (store: Store, b: Browser) => {
  // the session is opaque to a browser; a test may read the store behind it
  const cookie = b.jar.get('__Host-petal_session') ?? '';
  return (
    await store.session.get(
      createHash('sha256').update(cookie, 'utf8').digest('hex'),
      new Date().toISOString(),
    )
  )?.subject as string;
};

describe('the catalogue', () => {
  test('near-ai alone, with its five models and what each promises', async () => {
    const { app } = setup();
    const c = await body(await new Browser(app).get('/api/v1/catalogue'));
    expect(c.providers.map((p: Out) => p.id)).toEqual(['near-ai']);
    const [near] = c.providers;
    expect(near.credential).toBe('server');
    expect(near.permissions).toEqual(['ask', 'auto']);
    expect(near.models.map((m: Out) => [m.name, m.promise])).toEqual([
      ['DeepSeek V4.1 Flash', 'signed'],
      ['GLM 5.3 Flash', 'signed'],
      ['Qwen 3.8', 'signed'],
      ['Claude Haiku 5.5', 'passed_through'],
      ['Claude Sonnet 5.5', 'passed_through'],
    ]);
    expect(c.default).toEqual({
      provider: 'near-ai',
      model: near.models[0].id,
      effort: 'low',
      permissions: 'ask',
    });
  });

  test('a signed model only ever falls back to another signed one', async () => {
    const { providers } = catalogue('near-ai-cloud');
    for (const m of providers[0]?.models ?? []) {
      for (const next of m.fallbacks) expect(modelOf(next)?.promise).toBe(m.promise);
    }
    for (const m of (providers[0]?.models ?? []).filter((x) => x.promise === 'passed_through')) {
      expect(m.fallbacks).toEqual([]);
      expect(m.efforts).toEqual([]);
    }
    expect(modelOf('anthropic/claude-sonnet-5-5')?.usd_per_chat).toBe(0.3);
  });

  test('the wheel has what it needs: a window, where compaction starts, and the dollar cap', async () => {
    const { app } = setup();
    const c = await body(await new Browser(app).get('/api/v1/catalogue'));
    for (const m of c.providers[0].models) {
      expect(m.context_window).toBeGreaterThan(0);
      expect(m.compacts_at_tokens).toBe(Math.floor(m.context_window * 0.8));
      expect(m.usd_per_chat).toBeGreaterThan(0);
    }
  });

  test("it agrees with the model client's own list", async () => {
    // until the client reads its models from the catalogue, this is what keeps the two level
    const { default: first } = catalogue('near-ai-cloud');
    expect(first.model).toBe(DEFAULT_MODEL);
    expect(modelOf(DEFAULT_MODEL)?.fallbacks).toEqual([...FALLBACK_MODELS]);
    for (const [id, price] of Object.entries(PRICES)) {
      expect(modelOf(id)?.usd_per_million).toMatchObject(price);
    }
  });

  test('a pick is checked against the model it lands on, with effort per model', async () => {
    const now = settingsOf(null);
    expect(resolveSettings({ model: 'not/a-model' }, now)).toMatch(/isn't in the catalogue/);
    expect(resolveSettings({ provider: 'openai' }, now)).toMatch(/only near-ai/);
    expect(resolveSettings({ effort: 'extreme' }, now)).toMatch(/doesn't offer effort/);
    expect(resolveSettings({ permissions: 'yolo' }, now)).toMatch(/permissions must be/);
    const claude = resolveSettings({ model: 'anthropic/claude-haiku-5-5' }, now);
    expect(claude).toMatchObject({ effort: null, permissions: 'ask' });
    expect(resolveSettings({ model: 'anthropic/claude-haiku-5-5', effort: 'low' }, now)).toMatch(
      /doesn't offer effort/,
    );
    expect(resolveSettings({ permissions: 'auto' }, now)).toMatchObject({ permissions: 'auto' });
  });
});

describe('conversations', () => {
  test('nothing here yet reads as empty, and opens no session', async () => {
    const { app } = setup();
    const b = new Browser(app);
    expect((await body(await b.get('/api/v1/conversations'))).conversations).toEqual([]);
    expect((await body(await b.get('/api/v1/follows'))).follows).toEqual([]);
    expect((await body(await b.get('/api/v1/notes'))).notes).toEqual([]);
    expect((await body(await b.get('/api/v1/search?q=anything'))).results).toEqual([]);
    expect(b.jar.size).toBe(0);
  });

  test('a chat is a conversation, listed, opened and continued, with its usage per turn', async () => {
    const { app, invite } = setup();
    const b = await signedIn(app, invite);
    const id = await b.chat(ask('who holds the power here?'));

    const [item] = (await body(await b.get('/api/v1/conversations'))).conversations;
    expect(item).toMatchObject({
      id,
      run_id: id,
      door: 'site',
      title: 'who holds the power here?',
      status: 'done',
      settings: { provider: 'near-ai', permissions: 'ask' },
      exploration: null,
      shapes_count: 0,
      hidden_at: null,
    });
    expect(item.answered_by).toBeTruthy();

    await b.chat({ ...ask('and the top ten?'), run_id: id });
    const { conversation: open } = await body(await b.get(`/api/v1/conversations/${id}`));
    expect(open.turns).toHaveLength(2);
    expect(open.turns[1]).toMatchObject({
      model_calls: 1,
      signed: false,
      fallback_used: false,
    });
    expect(open.turns[1].tokens).toEqual({
      in: expect.any(Number),
      out: expect.any(Number),
      cached: expect.any(Number),
    });
    expect(open.turns[1].context_tokens).toBe(open.turns[1].tokens.in);
    expect(open.door_turns).toEqual([]);
  });

  test('settings are the pick: stored with a chat, changed by PATCH, and bad ones spend nothing', async () => {
    const { app, invite, store } = setup();
    const b = await signedIn(app, invite);
    const refused = await b.post(
      '/api/v1/agent/chat',
      ask('hello', { settings: { model: 'not/a-model' } }),
    );
    expect(refused.status).toBe(400);
    expect(await store().run.listByOwner('nobody')).toEqual([]);
    expect((await body(await b.get('/api/v1/conversations'))).conversations).toEqual([]);

    const haiku = 'anthropic/claude-haiku-5-5';
    const id = await b.chat(ask('hello', { settings: { model: haiku } }));
    const open = (await body(await b.get(`/api/v1/conversations/${id}`))).conversation;
    expect(open.settings).toMatchObject({ model: haiku, effort: null });
    // two facts: what was picked, and what answered
    expect(open.answered_by).toBe('scripted');
    expect(open.turns[0].model).toBe('scripted');

    const patched = await b.patch(`/api/v1/conversations/${id}`, {
      settings: { model: 'z-ai/glm-5.3-flash', effort: 'high', permissions: 'auto' },
      title: 'my question',
    });
    expect((await body(patched)).conversation).toMatchObject({
      title: 'my question',
      settings: { model: 'z-ai/glm-5.3-flash', effort: 'high', permissions: 'auto' },
    });
    const wrong = await b.patch(`/api/v1/conversations/${id}`, { settings: { effort: 'nope' } });
    expect(wrong.status).toBe(400);
  });

  test('hiding takes it off the list, and it comes back; renaming to null goes back to the question', async () => {
    const { app, invite } = setup();
    const b = await signedIn(app, invite);
    const id = await b.chat(ask('first words'));
    await b.patch(`/api/v1/conversations/${id}`, { title: 'renamed' });
    await b.patch(`/api/v1/conversations/${id}`, { title: null });
    expect((await body(await b.get(`/api/v1/conversations/${id}`))).conversation.title).toBe(
      'first words',
    );
    const before = (await body(await b.get(`/api/v1/conversations/${id}`))).conversation.updated_at;
    await b.patch(`/api/v1/conversations/${id}`, { hidden: true });
    expect((await body(await b.get('/api/v1/conversations'))).conversations).toEqual([]);
    const hidden = (await body(await b.get('/api/v1/conversations?hidden=1'))).conversations;
    expect(hidden[0].hidden_at).toBeTruthy();
    expect(hidden[0].updated_at).toBe(before);
    await b.patch(`/api/v1/conversations/${id}`, { hidden: false });
    expect((await body(await b.get('/api/v1/conversations'))).conversations).toHaveLength(1);
  });

  test("someone else's conversation answers as if it never existed", async () => {
    const { app, invite } = setup();
    const a = await signedIn(app, invite);
    const b = await signedIn(app, invite);
    const id = await a.chat(ask('mine'));
    expect((await b.get(`/api/v1/conversations/${id}`)).status).toBe(404);
    expect((await b.patch(`/api/v1/conversations/${id}`, { title: 'x' })).status).toBe(404);
    expect((await body(await b.get('/api/v1/conversations'))).conversations).toEqual([]);
  });

  test('a write from another site is refused', async () => {
    const { app, invite } = setup();
    const a = await signedIn(app, invite);
    const id = await a.chat(ask('mine'));
    const foreign = new Browser(app, 'https://evil.example');
    foreign.jar = a.jar;
    expect((await foreign.patch(`/api/v1/conversations/${id}`, { title: 'x' })).status).toBe(401);
    expect((await foreign.post('/api/v1/follows', { ref: ACCOUNT })).status).toBe(401);
  });
});

describe('work from other doors (the pane is never empty)', () => {
  test('an exploration with no run shows as a conversation, with no run invented', async () => {
    const { app, invite, store } = setup();
    const b = await signedIn(app, invite);
    const db = store();
    const subject = await subjectOf(db, b);
    const id = await doorWork(db, subject);

    const { conversations } = await body(await b.get('/api/v1/conversations'));
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      id,
      run_id: null,
      door: 'mcp',
      title: 'Who holds the DAO?',
      status: 'elsewhere',
      exploration: id,
      shapes_count: 1,
    });
    expect(await db.run.latestOfExploration(id)).toBeNull();

    const { conversation } = await body(await b.get(`/api/v1/conversations/${id}`));
    expect(conversation.turns).toEqual([]);
    expect(conversation.door_turns).toEqual([
      expect.objectContaining({ kind: 'step', door: 'mcp', text: 'drew it in Claude Code' }),
      expect.objectContaining({
        kind: 'note',
        door: 'mcp',
        from: 'link:abc',
        text: 'the delegate looks concentrated',
      }),
    ]);
  });

  test("an unowned exploration, and someone else's, stay out of the list", async () => {
    const { app, invite, store } = setup();
    const b = await signedIn(app, invite);
    const db = store();
    const id = await doorWork(db, null);
    expect((await body(await b.get('/api/v1/conversations'))).conversations).toEqual([]);
    expect((await b.get(`/api/v1/conversations/${id}`)).status).toBe(404);
    expect((await b.post('/api/v1/agent/chat', ask('go on', { exploration: id }))).status).toBe(
      404,
    );
  });

  test('continuing starts a run on that exploration, and the list then shows the run', async () => {
    const { app, invite, store } = setup();
    const b = await signedIn(app, invite);
    const db = store();
    const id = await doorWork(db, await subjectOf(db, b));
    const runId = await b.chat(ask('carry on from there', { exploration: id }));

    expect((await db.run.get(runId))?.exploration).toBe(id);
    const { conversations } = await body(await b.get('/api/v1/conversations'));
    expect(conversations.map((c: Out) => c.id)).toEqual([runId]);
    // the other door's work is still shown, beside the run's own
    const { conversation } = await body(await b.get(`/api/v1/conversations/${runId}`));
    expect(conversation.door_turns.map((t: Out) => t.door)).toEqual(['mcp', 'mcp']);
    // the exploration's id still finds it
    const same = await body(await b.get(`/api/v1/conversations/${id}`));
    expect(same.conversation.id).toBe(runId);
    const both = await b.post(
      '/api/v1/agent/chat',
      ask('both', { exploration: id, run_id: runId }),
    );
    expect(both.status).toBe(400);
  });

  test("another door's work can't be renamed before there's a run to hold it", async () => {
    const { app, invite, store } = setup();
    const b = await signedIn(app, invite);
    const db = store();
    const id = await doorWork(db, await subjectOf(db, b));
    const res = await b.patch(`/api/v1/conversations/${id}`, { title: 'x' });
    expect(res.status).toBe(400);
    expect((await body(res)).error.hint).toMatch(/exploration/);
  });
});

describe("the binding: an agent's work reaches a person's workspace", () => {
  /** What an agent does: no session, so it gets an exploration with no owner, and a continue link. */
  async function agentStarts(app: App) {
    const agent = new Browser(app, null);
    const started = await agent.post('/api/v1/explorations', { question: 'Who holds the DAO?' });
    expect(started.status).toBe(200);
    expect(agent.jar.size).toBe(0);
    const out = await body(started);
    const token = String(out.link.url).split('/').at(-1) as string;
    const noted = await agent.post(`/api/v1/explorations/${token}/notes`, {
      text: 'the delegate looks concentrated',
    });
    expect(noted.status).toBe(200);
    return { id: out.exploration as string, token, agent };
  }

  test('a browser with no session claims it, comes back, and sees it as a conversation', async () => {
    const { app } = setup();
    const { id, token } = await agentStarts(app);

    const browser = new Browser(app);
    expect((await body(await browser.get('/api/v1/conversations'))).conversations).toEqual([]);

    const claimed = await browser.post(`/api/v1/explorations/${token}/claim`);
    expect(claimed.status).toBe(200);
    expect(await body(claimed)).toMatchObject({ exploration: id, claimed: true });
    // the session outlives the browser: closing it doesn't lose the work
    const cookie = claimed.headers.getSetCookie().join(';');
    expect(cookie).toMatch(/Max-Age=\d+/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(browser.jar.size).toBe(1);

    // the browser closes and comes back: all it has is its cookie
    const back = new Browser(app);
    back.jar = new Map(browser.jar);
    const { conversations } = await body(await back.get('/api/v1/conversations'));
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      id,
      run_id: null,
      door: 'http',
      title: 'Who holds the DAO?',
      status: 'elsewhere',
    });
    const { conversation } = await body(await back.get(`/api/v1/conversations/${id}`));
    expect(conversation.door_turns.map((t: Out) => [t.kind, t.text])).toEqual([
      ['note', 'the delegate looks concentrated'],
    ]);

    // claiming again changes nothing, and opens nothing
    const again = await back.post(`/api/v1/explorations/${token}/claim`);
    expect(await body(again)).toMatchObject({ exploration: id, claimed: false });
    expect(again.headers.getSetCookie()).toEqual([]);

    // what the agent saves after the claim shows up here too
    const agent = new Browser(app, null);
    await agent.post(`/api/v1/explorations/${token}/notes`, { text: 'and one more thing' });
    const later = await body(await back.get(`/api/v1/conversations/${id}`));
    expect(later.conversation.door_turns.map((t: Out) => t.text)).toContain('and one more thing');
  });

  test('a browser that already has a session claims it into that session', async () => {
    const { app, invite } = setup();
    const b = await signedIn(app, invite);
    const before = new Map(b.jar);
    const { id, token } = await agentStarts(app);
    const claimed = await b.post(`/api/v1/explorations/${token}/claim`);
    expect((await body(claimed)).claimed).toBe(true);
    expect(claimed.headers.getSetCookie()).toEqual([]);
    expect(b.jar).toEqual(before);
    expect((await body(await b.get('/api/v1/conversations'))).conversations[0].id).toBe(id);
  });

  test("what can't be claimed opens no session", async () => {
    const { app } = setup();
    const { id, token, agent } = await agentStarts(app);
    const refused = async (path: string, status: number) => {
      const b = new Browser(app);
      expect((await b.post(path)).status).toBe(status);
      expect(b.jar.size).toBe(0);
    };
    await refused(`/api/v1/explorations/${'x'.repeat(43)}/claim`, 404);
    await refused(`/api/v1/explorations/${id}/claim`, 404);

    // a read link holds no right to it
    const owner = new Browser(app);
    await owner.post(`/api/v1/explorations/${token}/claim`);
    const made = await owner.post(`/api/v1/explorations/${id}/links`, { scope: 'read' });
    const read = String((await body(made)).url)
      .split('/')
      .at(-1) as string;
    await refused(`/api/v1/explorations/${read}/claim`, 401);

    // once it's someone's, the same continue link claims nothing, and they keep it
    await refused(`/api/v1/explorations/${token}/claim`, 401);
    expect((await body(await owner.get('/api/v1/conversations'))).conversations).toHaveLength(1);
    expect(agent.jar.size).toBe(0);
  });

  test('a claim from another site is refused', async () => {
    const { app } = setup();
    const { token } = await agentStarts(app);
    const foreign = new Browser(app, 'https://evil.example');
    expect((await foreign.post(`/api/v1/explorations/${token}/claim`)).status).toBe(401);
    expect(foreign.jar.size).toBe(0);
  });

  test('continuing it starts a run on it, and signing in keeps it', async () => {
    const { app, invite, maker } = setup();
    const b = await signedIn(app, invite);
    const { id, token } = await agentStarts(app);
    await b.post(`/api/v1/explorations/${token}/claim`);
    const run = await b.chat(ask('carry on', { exploration: id }));
    const { conversations } = await body(await b.get('/api/v1/conversations'));
    expect(conversations.map((c: Out) => c.id)).toEqual([run]);

    const ch = await body(await b.post('/api/v1/auth/challenge'));
    const proof = maker.sign({ message: ch.message, nonce: ch.nonce, recipient: ch.recipient });
    const verified = await b.post('/api/v1/auth/verify', { network: 'testnet', proof });
    expect((await body(verified)).claimed_explorations).toBe(1);
    expect((await body(await b.get('/api/v1/conversations'))).conversations[0].id).toBe(run);
  });
});

describe('a conversation with many shapes', () => {
  test('its flowers are listed in order, each by its hash, with no words of its own', async () => {
    const { app, invite, store } = setup();
    const b = await signedIn(app, invite);
    const id = await b.chat(ask('draw two'));
    const db = store();
    const sha = specHash(SPEC);
    await db.draft.put({ sha256: sha, body: canonicalJson(SPEC), created_at: 'now' });
    const exp = await doorWork(db, await subjectOf(db, b));
    await db.run.setExploration(id, exp);
    await db.step.append({
      exploration: exp,
      parent: null,
      spec_sha256: sha,
      recipe_sha256: null,
      snapshot_sha256: SPEC.snapshot.sha256,
      door: 'site',
      author: 'owner',
      note: null,
      at: '2026-11-03T00:00:00.000Z',
    });
    const { conversation } = await body(await b.get(`/api/v1/conversations/${id}`));
    expect(conversation.shapes_count).toBe(2);
    // the step with no spec has nothing to show; the one with a spec is a shape
    expect(conversation.shapes).toEqual([
      {
        spec_sha256: sha,
        short_url: `${SITE}/d/${sha}`,
        network: SPEC.network,
        target: 'a-test-network',
        as_of: '2026-11-01T00:00:00Z',
        door: 'site',
        at: '2026-11-03T00:00:00.000Z',
      },
    ]);
    // a site's step is in the run's own log, so it isn't repeated among the other doors' turns
    expect(conversation.door_turns.map((t: Out) => t.door)).toEqual(['mcp', 'mcp']);
  });
});

describe('following', () => {
  test('a first follow opens a session, and following again answers the same row', async () => {
    const { app } = setup();
    const b = new Browser(app);
    const res = await b.post('/api/v1/follows', { ref: ACCOUNT, label: 'a validator' });
    expect(res.status).toBe(201);
    const { follow } = await body(res);
    expect(follow).toMatchObject({ kind: 'account', ref: ACCOUNT, label: 'a validator' });
    expect(b.jar.size).toBe(1);

    const again = await b.post('/api/v1/follows', { ref: ACCOUNT });
    expect(again.status).toBe(200);
    expect((await body(again)).follow).toMatchObject({ id: follow.id, label: 'a validator' });
    expect((await body(await b.get('/api/v1/follows'))).follows).toHaveLength(1);
  });

  test('only an account in its one spelling, or a network, can be followed', async () => {
    const { app } = setup();
    const b = new Browser(app);
    for (const ref of ['alice.near', 'near:mainnet:UPPER', 'claim:abc', '', 7, 'network: spaced']) {
      expect((await b.post('/api/v1/follows', { ref })).status).toBe(400);
    }
    const network = await b.post('/api/v1/follows', { ref: NETWORK });
    expect((await body(network)).follow.kind).toBe('network');
  });

  test('it reopens as a shape: the stored flower, or null when none was drawn', async () => {
    const { app, store } = setup();
    const b = new Browser(app);
    const sha = specHash(SPEC);
    store().draft.put({ sha256: sha, body: canonicalJson(SPEC), created_at: 'now' });

    const { follow } = await body(await b.post('/api/v1/follows', { ref: ACCOUNT }));
    expect(follow).toMatchObject({ spec_sha256: null, short_url: null });
    expect((await body(await b.get(`/api/v1/follows/${follow.id}`))).current).toBeNull();

    const patched = await body(await b.patch(`/api/v1/follows/${follow.id}`, { spec_sha256: sha }));
    expect(patched.follow.short_url).toBe(`${SITE}/d/${sha}`);
    const { current } = await body(await b.get(`/api/v1/follows/${follow.id}`));
    expect(current).toMatchObject({
      spec_sha256: sha,
      spec: { marker: 'a stored flower' },
      as_of: '2026-11-01T00:00:00Z',
      short_url: `${SITE}/d/${sha}`,
      target: 'a-test-network',
    });
    expect(current.network.id).toBe('a-test-network');

    const stranger = new Browser(app);
    expect((await stranger.get(`/api/v1/follows/${follow.id}`)).status).toBe(404);
    expect((await stranger.patch(`/api/v1/follows/${follow.id}`, { label: 'x' })).status).toBe(404);
    expect((await stranger.del(`/api/v1/follows/${follow.id}`)).status).toBe(404);
    expect((await body(await b.del(`/api/v1/follows/${follow.id}`))).ok).toBe(true);
    expect((await body(await b.get('/api/v1/follows'))).follows).toEqual([]);
  });
});

describe('notes', () => {
  test('about a conversation, a shape or a followed address, private to the person', async () => {
    const { app, invite } = setup();
    const b = await signedIn(app, invite);
    const id = await b.chat(ask('hello'));
    const about = [`conversation:${id}`, `spec:${'a'.repeat(64)}`, ACCOUNT, NETWORK];
    for (const a of about) {
      expect((await b.post('/api/v1/notes', { about: a, text: `about ${a}` })).status).toBe(201);
    }
    expect((await body(await b.get('/api/v1/notes'))).notes).toHaveLength(4);
    const one = await body(await b.get(`/api/v1/notes?about=${encodeURIComponent(ACCOUNT)}`));
    expect(one.notes).toHaveLength(1);
    expect(one.notes[0]).toMatchObject({ author: 'owner', about: ACCOUNT, evidence: [] });
    expect((await body(await new Browser(app).get('/api/v1/notes'))).notes).toEqual([]);
  });

  test("a note can't name someone else's conversation, or a thing that isn't one", async () => {
    const { app, invite } = setup();
    const a = await signedIn(app, invite);
    const b = await signedIn(app, invite);
    const id = await a.chat(ask('mine'));
    expect((await b.post('/api/v1/notes', { about: `conversation:${id}`, text: 'x' })).status).toBe(
      404,
    );
    for (const bad of ['alice.near', 'spec:nothash', 'tool:x@1', '']) {
      expect((await b.post('/api/v1/notes', { about: bad, text: 'x' })).status).toBe(400);
    }
    expect((await b.post('/api/v1/notes', { about: ACCOUNT, text: '  ' })).status).toBe(400);
  });

  test("evidence takes a claim's shape, and an edit keeps the rest", async () => {
    const { app } = setup();
    const b = new Browser(app);
    const evidence = [
      { snapshot_sha256: 'b'.repeat(64) },
      { url: 'https://example.com/a', retrieved_at: '2026-11-01T00:00:00Z', note: 'a source' },
    ];
    const { note } = await body(
      await b.post('/api/v1/notes', { about: ACCOUNT, text: 'first', evidence }),
    );
    expect(note.evidence).toEqual(evidence);
    for (const wrong of [
      'a string',
      [{ snapshot_sha256: 'short' }],
      [{ url: 'ftp://x' }],
      [{ invented: 'field' }],
      [{ note: 7 }],
    ]) {
      const res = await b.post('/api/v1/notes', { about: ACCOUNT, text: 'x', evidence: wrong });
      expect(res.status).toBe(400);
    }
    const edited = await body(await b.patch(`/api/v1/notes/${note.id}`, { text: 'second' }));
    expect(edited.note).toMatchObject({ text: 'second', evidence });
    expect((await new Browser(app).patch(`/api/v1/notes/${note.id}`, { text: 'x' })).status).toBe(
      404,
    );
    expect((await body(await b.del(`/api/v1/notes/${note.id}`))).ok).toBe(true);
    expect((await body(await b.get('/api/v1/notes'))).notes).toEqual([]);
  });
});

describe('search', () => {
  const texts = (r: Out) => r.snippet.map((p: Out) => p.text).join('');

  test('finds conversations, notes and follows, marks the match, and keeps to its owner', async () => {
    const { app, invite } = setup();
    const a = await signedIn(app, invite);
    const b = await signedIn(app, invite);
    const id = await a.chat(ask('Quem controla os validadores?'));
    await a.post('/api/v1/notes', { about: ACCOUNT, text: 'watch this delegate closely' });
    await a.post('/api/v1/follows', { ref: ACCOUNT, label: 'pool of interest' });

    const accents = await body(await a.get('/api/v1/search?q=validadóres'));
    expect(accents.results.map((r: Out) => [r.kind, r.id])).toEqual([['conversation', id]]);
    expect(accents.results[0].snippet.some((p: Out) => p.hit && /validadores/i.test(p.text))).toBe(
      true,
    );

    const note = await body(await a.get('/api/v1/search?q=delegate'));
    expect(note.results.map((r: Out) => r.kind)).toEqual(['note']);
    expect(note.results[0].about).toBe(ACCOUNT);
    expect(texts(note.results[0])).toContain('watch this delegate');

    // the parts of an address, and a word still being typed
    const follow = await body(await a.get('/api/v1/search?q=poolv1.near'));
    expect(follow.results.map((r: Out) => r.kind).sort()).toEqual(['follow', 'note'].sort());
    expect((await body(await a.get('/api/v1/search?q=intere'))).results[0].kind).toBe('follow');

    expect((await body(await b.get('/api/v1/search?q=delegate'))).results).toEqual([]);
    expect((await a.get('/api/v1/search?q=x&kinds=wallets')).status).toBe(400);
    const only = await body(await a.get('/api/v1/search?q=poolv1&kinds=follow'));
    expect(only.results.map((r: Out) => r.kind)).toEqual(['follow']);
  });

  test("a person's words are never syntax", async () => {
    expect(searchWords('  ')).toBeNull();
    expect(searchWords('--- ()')).toBeNull();
    expect(searchWords('foo AND (bar')).toEqual(['foo', 'AND', '(bar']);
    expect(searchWords('say "hi"')).toEqual(['say', '"hi"']);
    const { app } = setup();
    const b = new Browser(app);
    await b.post('/api/v1/notes', { about: ACCOUNT, text: 'plain words' });
    for (const q of ['foo AND (', '"', 'NEAR*', 'text:plain', 'a OR', '(((']) {
      const res = await b.get(`/api/v1/search?q=${encodeURIComponent(q)}`);
      expect(res.status).toBe(200);
    }
  });

  test('it catches up on what changed, forgets what went, and rebuilds if the index is deleted', async () => {
    const { app, invite, store } = setup();
    const b = await signedIn(app, invite);
    const id = await b.chat(ask('apples and pears'));
    const q = async (w: string) => (await body(await b.get(`/api/v1/search?q=${w}`))).results;
    expect(await q('pears')).toHaveLength(1);

    await b.chat({ ...ask('now plums'), run_id: id });
    expect(await q('plums')).toHaveLength(1);

    await b.patch(`/api/v1/conversations/${id}`, { title: 'fruit' });
    expect((await q('pears'))[0].title).toBe('fruit');

    const { note } = await body(await b.post('/api/v1/notes', { about: ACCOUNT, text: 'quinces' }));
    expect(await q('quinces')).toHaveLength(1);
    await b.patch(`/api/v1/notes/${note.id}`, { text: 'figs' });
    expect(await q('quinces')).toEqual([]);
    expect(await q('figs')).toHaveLength(1);
    await b.del(`/api/v1/notes/${note.id}`);
    expect(await q('figs')).toEqual([]);

    // hidden isn't gone: search still finds it
    await b.patch(`/api/v1/conversations/${id}`, { hidden: true });
    expect(await q('pears')).toHaveLength(1);

    const db = store();
    const docs = await db.search.staleRuns(await subjectOf(db, b));
    expect(docs).toEqual([]);
    await db.search.forgetOwner(await subjectOf(db, b));
    expect(await q('pears')).toHaveLength(1);
  });

  test("another door's work is found: its question, its notes", async () => {
    const { app, invite, store } = setup();
    const b = await signedIn(app, invite);
    const db = store();
    const id = await doorWork(db, await subjectOf(db, b));
    const asked = await body(await b.get('/api/v1/search?q=DAO'));
    expect(asked.results[0]).toMatchObject({ kind: 'conversation', id });
    const noted = await body(await b.get('/api/v1/search?q=concentrated'));
    expect(noted.results[0]).toMatchObject({ kind: 'note', about: `exploration:${id}` });
  });
});

describe('signing in', () => {
  test('follows and notes move with the rest, and search finds them under the person', async () => {
    const { app, invite, maker } = setup();
    const b = await signedIn(app, invite);
    await b.post('/api/v1/follows', { ref: ACCOUNT, label: 'keep me' });
    await b.post('/api/v1/follows', { ref: NETWORK });
    await b.post('/api/v1/notes', { about: ACCOUNT, text: 'a keepsake' });
    await b.chat(ask('and this conversation'));
    expect((await body(await b.get('/api/v1/search?q=keepsake'))).results).toHaveLength(1);

    const ch = await body(await b.post('/api/v1/auth/challenge'));
    const proof = maker.sign({ message: ch.message, nonce: ch.nonce, recipient: ch.recipient });
    const verified = await b.post('/api/v1/auth/verify', { network: 'testnet', proof });
    expect(verified.status).toBe(200);
    expect((await body(verified)).person_id).toMatch(/^prs_/);

    expect((await body(await b.get('/api/v1/follows'))).follows).toHaveLength(2);
    expect((await body(await b.get('/api/v1/notes'))).notes).toHaveLength(1);
    expect((await body(await b.get('/api/v1/conversations'))).conversations).toHaveLength(1);
    expect((await body(await b.get('/api/v1/search?q=keepsake'))).results).toHaveLength(1);
  });

  test('a follow the person already has stays one follow', async () => {
    const { store } = setup();
    const db = store();
    const row = (id: string, owner: string, label: string) => ({
      id,
      owner,
      kind: 'account',
      ref: ACCOUNT,
      label,
      spec_sha256: null,
      created_at: 'then',
      updated_at: 'then',
    });
    await db.follow.insert(row('flw_a', 'anon_x', 'from before'));
    await db.follow.insert(row('flw_b', 'prs_y', 'theirs'));
    await db.follow.moveOwner('anon_x', 'prs_y');
    expect((await db.follow.list('prs_y', 10)).map((f) => f.label)).toEqual(['theirs']);
    expect(await db.follow.list('anon_x', 10)).toEqual([]);
  });
});

describe('folders (004-workspace, W4)', () => {
  const make = async (b: Browser, name: string, more: Out = {}) => {
    const res = await b.post('/api/v1/folders', { name, ...more });
    expect(res.status).toBe(201);
    return (await body(res)).folder as Out;
  };
  const folders = async (b: Browser) =>
    (await body(await b.get('/api/v1/folders'))).folders as Out[];
  const listed = async (b: Browser) =>
    Object.fromEntries(
      ((await body(await b.get('/api/v1/conversations'))).conversations as Out[]).map((c) => [
        c.id,
        c.folder,
      ]),
    );

  test('nothing here yet reads as empty, and opens no session', async () => {
    const { app } = setup();
    const b = new Browser(app);
    expect(await folders(b)).toEqual([]);
    expect(b.jar.size).toBe(0);
  });

  test('made, nested, renamed and reordered, and listed flat with each one naming its parent', async () => {
    const { app } = setup();
    const b = new Browser(app);
    const projects = await make(b, 'Projects');
    expect(b.jar.size).toBe(1);
    expect(projects).toMatchObject({ name: 'Projects', parent: null, position: 0 });
    const near = await make(b, '  NEAR  ', { parent: projects.id });
    expect(near).toMatchObject({ name: 'NEAR', parent: projects.id, position: 0 });
    const ideas = await make(b, 'Ideas');
    expect(ideas.position).toBe(1);
    expect((await folders(b)).map((f) => f.name)).toEqual(['Projects', 'Ideas', 'NEAR']);

    const renamed = await body(await b.patch(`/api/v1/folders/${near.id}`, { name: 'Validators' }));
    expect(renamed.folder).toMatchObject({ name: 'Validators', parent: projects.id, position: 0 });
    await b.patch(`/api/v1/folders/${ideas.id}`, { position: -1 });
    expect((await folders(b)).map((f) => f.name)).toEqual(['Ideas', 'Projects', 'Validators']);
    // moved to the top, it goes after the last one there
    const up = await body(await b.patch(`/api/v1/folders/${near.id}`, { parent: null }));
    expect(up.folder).toMatchObject({ parent: null, position: 1 });
  });

  test('a conversation moves in and out, and so does work from another door', async () => {
    const { app, invite, store } = setup();
    const b = await signedIn(app, invite);
    const db = store();
    const f = await make(b, 'Validators');
    const run = await b.chat(ask('who stakes the most?'));
    const door = await doorWork(db, await subjectOf(db, b));

    const moved = await body(await b.patch(`/api/v1/conversations/${run}`, { folder: f.id }));
    expect(moved.conversation.folder).toBe(f.id);
    const doorMoved = await b.patch(`/api/v1/conversations/${door}`, { folder: f.id });
    expect(doorMoved.status).toBe(200);
    expect((await body(doorMoved)).conversation).toMatchObject({ id: door, folder: f.id });
    expect(await listed(b)).toEqual({ [run]: f.id, [door]: f.id });
    expect((await body(await b.get(`/api/v1/conversations/${door}`))).conversation.folder).toBe(
      f.id,
    );
    // another door's work still can't be renamed, even on its way into a folder
    expect(
      (await b.patch(`/api/v1/conversations/${door}`, { folder: f.id, title: 'x' })).status,
    ).toBe(400);

    await b.patch(`/api/v1/conversations/${run}`, { folder: null });
    expect((await listed(b))[run]).toBeNull();
    // continued here, the door's work keeps its place
    const continued = await b.chat(ask('carry on', { exploration: door }));
    expect((await listed(b))[continued]).toBe(f.id);
  });

  test("a folder can't go inside itself, and they nest eight deep at most", async () => {
    const { app } = setup();
    const b = new Browser(app);
    const chain: Out[] = [];
    for (let i = 0; i < 8; i++)
      chain.push(await make(b, `level ${i + 1}`, { parent: chain[i - 1]?.id }));
    const ninth = await b.post('/api/v1/folders', { name: 'too deep', parent: chain[7]?.id });
    expect(ninth.status).toBe(400);
    expect((await body(ninth)).error.message).toMatch(/8 deep/);
    const loop = await b.patch(`/api/v1/folders/${chain[0]?.id}`, { parent: chain[2]?.id });
    expect(loop.status).toBe(400);
    expect((await body(loop)).error.message).toMatch(/inside itself/);
    expect(
      (await b.patch(`/api/v1/folders/${chain[0]?.id}`, { parent: chain[0]?.id })).status,
    ).toBe(400);
    // a folder with one inside it counts as two levels
    const pair = await make(b, 'pair');
    await make(b, 'inside the pair', { parent: pair.id });
    expect((await b.patch(`/api/v1/folders/${pair.id}`, { parent: chain[6]?.id })).status).toBe(
      400,
    );
    expect((await b.patch(`/api/v1/folders/${pair.id}`, { parent: chain[5]?.id })).status).toBe(
      200,
    );
  });

  test('deleting one keeps everything in it, a level up', async () => {
    const { app, invite } = setup();
    const b = await signedIn(app, invite);
    const outer = await make(b, 'Outer');
    const middle = await make(b, 'Middle', { parent: outer.id });
    const inner = await make(b, 'Inner', { parent: middle.id });
    const run = await b.chat(ask('keep me'));
    await b.patch(`/api/v1/conversations/${run}`, { folder: middle.id });

    expect((await b.del(`/api/v1/folders/${middle.id}`)).status).toBe(200);
    const now = await folders(b);
    expect(now.find((f) => f.id === inner.id)?.parent).toBe(outer.id);
    expect((await listed(b))[run]).toBe(outer.id);
    expect((await b.del(`/api/v1/folders/${outer.id}`)).status).toBe(200);
    expect((await folders(b)).map((f) => [f.name, f.parent])).toEqual([['Inner', null]]);
    expect((await listed(b))[run]).toBeNull();
    expect((await b.del(`/api/v1/folders/${outer.id}`)).status).toBe(404);
  });

  test("someone else's folders answer as if they never existed", async () => {
    const { app, invite } = setup();
    const a = await signedIn(app, invite);
    const b = await signedIn(app, invite);
    const theirs = await make(a, 'Private');
    const run = await a.chat(ask('mine alone'));
    await a.patch(`/api/v1/conversations/${run}`, { folder: theirs.id });
    const own = await b.chat(ask('my own'));

    expect(await folders(b)).toEqual([]);
    expect((await b.patch(`/api/v1/folders/${theirs.id}`, { name: 'taken' })).status).toBe(404);
    expect((await b.del(`/api/v1/folders/${theirs.id}`)).status).toBe(404);
    expect((await b.post('/api/v1/folders', { name: 'x', parent: theirs.id })).status).toBe(404);
    expect((await b.patch(`/api/v1/conversations/${own}`, { folder: theirs.id })).status).toBe(404);
    expect((await b.patch(`/api/v1/conversations/${run}`, { folder: null })).status).toBe(404);
    const mine = await make(b, 'Mine');
    expect((await a.patch(`/api/v1/folders/${theirs.id}`, { parent: mine.id })).status).toBe(404);
    expect((await a.patch(`/api/v1/conversations/${run}`, { folder: mine.id })).status).toBe(404);

    expect((await folders(a)).map((f) => f.name)).toEqual(['Private']);
    expect((await listed(a))[run]).toBe(theirs.id);
  });

  test('what a folder takes, and how many', async () => {
    const { app, store } = setup();
    const b = new Browser(app);
    for (const wrong of [
      {},
      { name: '' },
      { name: '   ' },
      { name: 'x'.repeat(121) },
      { name: 7 },
      { name: 'ok', parent: 'not-a-folder' },
      { name: 'ok', position: 1.5 },
      { name: 'ok', position: 10_000_001 },
    ]) {
      expect((await b.post('/api/v1/folders', wrong)).status, JSON.stringify(wrong)).toBe(400);
    }
    expect(b.jar.size).toBe(0);
    const f = await make(b, 'ok');
    expect((await b.patch(`/api/v1/folders/${f.id}`, { name: '' })).status).toBe(400);
    expect((await b.patch('/api/v1/folders/fld_nope', { name: 'x' })).status).toBe(404);
    const run = `run_${'0'.repeat(24)}`;
    expect((await b.patch(`/api/v1/conversations/${run}`, { folder: 'elsewhere' })).status).toBe(
      400,
    );

    const db = store();
    const owner = await subjectOf(db, b);
    for (let i = 1; i < 200; i++) {
      await db.folder.insert({
        id: `fld_${i.toString(16).padStart(24, '0')}`,
        owner,
        name: `f${i}`,
        parent: null,
        position: i,
        created_at: 'then',
        updated_at: 'then',
      });
    }
    const full = await b.post('/api/v1/folders', { name: 'one more' });
    expect(full.status).toBe(400);
    expect((await body(full)).error.message).toMatch(/200 folders/);
  });

  test('a write from another site is refused', async () => {
    const { app, invite } = setup();
    const a = await signedIn(app, invite);
    const f = await make(a, 'Mine');
    const foreign = new Browser(app, 'https://evil.example');
    foreign.jar = a.jar;
    expect((await foreign.post('/api/v1/folders', { name: 'x' })).status).toBe(401);
    expect((await foreign.patch(`/api/v1/folders/${f.id}`, { name: 'x' })).status).toBe(401);
    expect((await foreign.del(`/api/v1/folders/${f.id}`)).status).toBe(401);
    expect((await folders(a)).map((x) => x.name)).toEqual(['Mine']);
  });

  test('signing in keeps the folders, and the conversations in them', async () => {
    const { app, invite, maker } = setup();
    const b = await signedIn(app, invite);
    const f = await make(b, 'Before signing in');
    const run = await b.chat(ask('in a folder'));
    await b.patch(`/api/v1/conversations/${run}`, { folder: f.id });

    const ch = await body(await b.post('/api/v1/auth/challenge'));
    const proof = maker.sign({ message: ch.message, nonce: ch.nonce, recipient: ch.recipient });
    expect((await b.post('/api/v1/auth/verify', { network: 'testnet', proof })).status).toBe(200);

    expect((await folders(b)).map((x) => x.id)).toEqual([f.id]);
    expect((await listed(b))[run]).toBe(f.id);
  });
});

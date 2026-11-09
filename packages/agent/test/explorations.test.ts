// T194: a run saves its flowers as steps, on the real tools through petalApp, with a test model and
// the test NEP-413 signer. Browsers are cookie jars. The chain itself is in tests/e2e/explore-path.ts.
import { join } from 'node:path';
import { fakeRpcFor, testSigner } from '@petal/near/auth/testing';
import { openStore } from '@petal/store';
import { registry } from '@petal/tools';
import { describe, expect, test } from 'vitest';
import { buildPetalApp } from '../src/app.ts';
import type { LlmClient, LlmCompletion, LlmMessage } from '../src/llm.ts';
import { loadTranscript, SKELETON_TRANSCRIPT } from '../src/recorded.ts';
import { forModel } from '../src/summary.ts';
import { forAgent, llmTools } from '../src/tool-defs.ts';
import { agreed, parseSse, tmpRoot } from './helpers.ts';

// biome-ignore lint/suspicious/noExplicitAny: walking tool outputs
type Out = Record<string, any>;

const SITE = 'https://petals.example';
const REPO = new URL('../../../', import.meta.url).pathname;
const maker = testSigner('maker.testnet');
const other = testSigner('other.testnet');

const interpretation = loadTranscript(SKELETON_TRANSCRIPT).turns.flatMap((t) =>
  (t.tool_calls ?? []).filter((c) => c.name === 'validate_spec'),
)[0]?.arguments as Out;

/**
 * A model that draws one flower per question, on the real tools: the last user message picks the
 * width, or says not to draw.
 */
function drawingLlm(): LlmClient {
  return {
    kind: 'near-ai-cloud',
    model: 'test-model',
    async complete(req): Promise<LlmCompletion> {
      const at = req.messages.findLastIndex((m) => m.role === 'user');
      const since = req.messages.slice(at + 1);
      // what was asked, not the yes that lets it go ahead
      const asked = String(
        req.messages.findLast((m) => m.role === 'user' && m.content !== 'yes')?.content,
      );
      const results = since.filter((m) => m.role === 'tool') as (LlmMessage & {
        content: string;
      })[];
      const last = results.at(-1) ? (JSON.parse(results.at(-1)?.content as string) as Out) : {};
      const turn = since.filter((m) => m.role === 'assistant').length;
      const call = (name: string, args: unknown) => ({
        role: 'assistant' as const,
        content: null,
        tool_calls: [{ id: `c${turn}`, name, arguments: JSON.stringify(args) }],
      });
      const steps = asked.includes('no flower')
        ? []
        : [
            () => call('get_snapshot', { network: 'near-validators' }),
            () =>
              call('propose_spec', {
                network: 'near-validators',
                sha256: last.sha256,
                choices: {
                  segments: 'backers',
                  ...(asked.includes('equal') ? { width: 'equal' } : {}),
                },
              }),
            () =>
              call('validate_spec', {
                spec: last.spec_sha256,
                interpretation: interpretation.interpretation,
              }),
            () => call('render_flower', { spec: firstSpecHash(req.messages, at) }),
          ];
      const step = steps[turn];
      return {
        model: 'test-model',
        completion_id: `c-${turn}`,
        message: step ? step() : { role: 'assistant', content: 'That is the answer.' },
        usage: { in: 1, out: 1 },
        cost_usd: 0,
        fallback_used: false,
        signature: null,
      };
    },
  };
}

function firstSpecHash(messages: LlmMessage[], from: number): string {
  for (const m of messages.slice(from)) {
    if (m.role !== 'tool') continue;
    const o = JSON.parse(m.content) as Out;
    if (o.spec_sha256) return o.spec_sha256;
  }
  throw new Error('no spec yet');
}

function setup() {
  const stateDir = join(tmpRoot(), 'state');
  const app = buildPetalApp(
    { root: REPO, stateDir, apiBase: SITE, llmDailyUsd: 1 },
    {
      llm: drawingLlm(),
      rpcFor: () => fakeRpcFor([maker, other]),
      env: { PETAL_AGENT_ACCESS: 'open', PETAL_WALLET_KEY: 'ab'.repeat(32), NODE_ENV: 'test' },
    },
  );
  return { app, stateDir };
}

type App = ReturnType<typeof buildPetalApp>;

class Browser {
  jar = new Map<string, string>();
  app: App;
  constructor(app: App) {
    this.app = app;
  }
  async request(path: string, init: RequestInit & { json?: unknown } = {}) {
    const headers = new Headers(init.headers);
    const cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) headers.set('cookie', cookie);
    if (init.method === 'POST') headers.set('origin', SITE);
    if (init.json !== undefined) headers.set('content-type', 'application/json');
    const res = await this.app.request(path, {
      ...init,
      headers,
      ...(init.json === undefined ? {} : { body: JSON.stringify(init.json) }),
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair = '', ...attrs] = line.split('; ');
      const at = pair.indexOf('=');
      if (attrs.includes('Max-Age=0')) this.jar.delete(pair.slice(0, at));
      else this.jar.set(pair.slice(0, at), pair.slice(at + 1));
    }
    return res;
  }
  post = (path: string, json: unknown = {}) => this.request(path, { method: 'POST', json });
  get = (path: string) => this.request(path);
  json = async (path: string) => (await (await this.get(path)).json()) as Out;
  async ask(content: string, run_id?: string) {
    const res = await this.post('/api/v1/agent/chat', {
      messages: run_id ? [{ role: 'user', content }] : agreed(content),
      ...(run_id ? { run_id } : {}),
    });
    const events = parseSse(await res.text());
    return { id: (events[0] as { data: Out }).data.run_id as string, events };
  }
  async signIn(signer = maker) {
    const ch = (await (await this.post('/api/v1/auth/challenge')).json()) as Out;
    const proof = signer.sign({ message: ch.message, nonce: ch.nonce, recipient: ch.recipient });
    return (await (
      await this.post('/api/v1/auth/verify', { network: 'testnet', proof })
    ).json()) as Out;
  }
}

describe("a run's flowers are steps", () => {
  test('the first flower makes the exploration, each new one adds a step; words unchanged', async () => {
    const { app, stateDir } = setup();
    const b = new Browser(app);
    await b.signIn();
    const first = await b.ask('who holds the power?');
    const names = first.events.map((e) => e.event);
    expect(names).toContain('flower');
    expect(names.at(-1)).toBe('done');

    const { explorations } = await b.json('/api/v1/explorations');
    expect(explorations).toHaveLength(1);
    const [row] = explorations as Out[];
    expect(row).toMatchObject({
      question: 'who holds the power?',
      target: 'near-validators',
      steps: 1,
      notes: 0,
      run_id: first.id,
      forked_from: null,
    });
    expect(row?.short_url).toBe(`${SITE}/d/${row?.head}`);

    const run = await b.json(`/api/v1/agent/runs/${first.id}`);
    expect(run.exploration).toBe(row?.exploration);

    const packet = await b.json(`/api/v1/explorations/${row?.exploration}`);
    expect(packet).toMatchObject({
      question: 'who holds the power?',
      run_id: first.id,
      access: { as: 'owner' },
      current: { spec_sha256: row?.head },
    });
    expect(packet.steps[0]).toMatchObject({ seq: 0, door: 'site', from: 'owner', parent: null });
    expect(packet.steps[0].recipe_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(packet.steps[0].snapshot_sha256).toMatch(/^[0-9a-f]{64}$/);

    // the same flower again: no new step. A different one, in the same run: a step on top.
    await b.ask('and again?', first.id);
    expect((await b.json(`/api/v1/explorations/${row?.exploration}`)).steps_total).toBe(1);
    await b.ask('with equal widths', first.id);
    const after = await b.json(`/api/v1/explorations/${row?.exploration}`);
    expect(after.steps_total).toBe(2);
    expect(after.steps[1]).toMatchObject({ seq: 1, door: 'site', parent: row?.head });
    expect(after.steps[1].diff.design[0]).toMatchObject({ what: 'width', to: 'equal' });
    expect((await b.json('/api/v1/explorations')).explorations).toHaveLength(1);

    const db = openStore(join(stateDir, 'private.db'));
    expect((await db.run.get(first.id))?.exploration).toBe(row?.exploration);
    db.close();
  });

  test('a run that draws nothing saves nothing', async () => {
    const { app } = setup();
    const b = new Browser(app);
    await b.signIn();
    await b.ask('no flower, just a word');
    expect((await b.json('/api/v1/explorations')).explorations).toEqual([]);
  });

  test('a recorded run has no owner, so nothing is saved for it', async () => {
    const stateDir = join(tmpRoot(), 'state');
    const app = buildPetalApp({ root: REPO, stateDir, fake: true }, { env: { NODE_ENV: 'test' } });
    const res = await app.request('/api/v1/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'who?' }] }),
    });
    const events = parseSse(await res.text());
    expect(events.map((e) => e.event)).toContain('flower');
    const { run_id: id } = (events[0] as { data: Out }).data;
    const db = openStore(join(stateDir, 'private.db'));
    expect((await db.run.get(id))?.exploration).toBeNull();
    db.close();
  });

  test('a store that fails on a step leaves the chat as it was', async () => {
    const { app, stateDir } = setup();
    const b = new Browser(app);
    await b.signIn();
    const db = openStore(join(stateDir, 'private.db'));
    const exec = process.getBuiltinModule('node:sqlite').DatabaseSync;
    const raw = new exec(join(stateDir, 'private.db'));
    raw.exec('DROP TABLE step');
    raw.close();
    db.close();
    const { events } = await b.ask('who holds the power?');
    expect(events.map((e) => e.event)).toEqual(expect.arrayContaining(['flower', 'done']));
    expect(events.some((e) => e.event === 'error')).toBe(false);
  });
});

describe('coming back', () => {
  test('sign-in moves an anonymous exploration, and the same wallet finds it in a new browser', async () => {
    const { app } = setup();
    const a = new Browser(app);
    const { id } = await a.ask('who holds the power?');
    const before = await a.json('/api/v1/explorations');
    expect(before.explorations).toHaveLength(1);
    const [row] = before.explorations as Out[];

    const stranger = new Browser(app);
    await stranger.signIn(other);
    const hidden = await stranger.get(`/api/v1/explorations/${row?.exploration}`);
    expect(hidden.status).toBe(404);

    const signedIn = await a.signIn();
    expect(signedIn).toMatchObject({ claimed_runs: 1, claimed_explorations: 1 });
    expect((await a.json('/api/v1/explorations')).explorations).toHaveLength(1);

    const phone = new Browser(app);
    await phone.signIn();
    const list = await phone.json('/api/v1/explorations');
    expect(list.explorations.map((x: Out) => x.run_id)).toEqual([id]);
    const packet = await phone.json(`/api/v1/explorations/${row?.exploration}`);
    expect(packet).toMatchObject({ question: 'who holds the power?', access: { as: 'owner' } });
    expect(JSON.stringify(packet)).not.toMatch(/prs_|anon_/);

    expect((await stranger.json('/api/v1/explorations')).explorations).toEqual([]);
    const still = await stranger.get(`/api/v1/explorations/${row?.exploration}`);
    expect(still.status).toBe(404);
    expect((await stranger.get(`/api/v1/agent/runs/${id}`)).status).toBe(404);
  });

  test('a person signed in on an old cookie keeps their own work: only anonymous work moves', async () => {
    const { app } = setup();
    const a = new Browser(app);
    await a.signIn(other);
    await a.ask('who holds the power?');
    const moved = await a.signIn(maker);
    expect(moved.claimed_explorations).toBe(0);
    expect((await a.json('/api/v1/explorations')).explorations).toEqual([]);
    const back = new Browser(app);
    await back.signIn(other);
    expect((await back.json('/api/v1/explorations')).explorations).toHaveLength(1);
  });

  test('a link written by a person, used by a second door, seen by the owner', async () => {
    const { app } = setup();
    const a = new Browser(app);
    await a.signIn();
    await a.ask('who holds the power?');
    const [row] = (await a.json('/api/v1/explorations')).explorations as Out[];
    const link = (await (
      await a.post(`/api/v1/explorations/${row?.exploration}/links`, { scope: 'continue' })
    ).json()) as Out;
    expect(link.url).toMatch(new RegExp(`^${SITE}/s/[A-Za-z0-9_-]{43}$`));

    const tool = new Browser(app);
    const noted = await tool.post(`/api/v1/explorations/${link.url.split('/').pop()}/notes`, {
      text: 'from a second door',
    });
    expect(noted.status).toBe(200);
    expect([...tool.jar.keys()]).toEqual([]);
    const packet = await a.json(`/api/v1/explorations/${row?.exploration}`);
    expect(packet.notes[0]).toMatchObject({
      text: 'from a second door',
      door: 'http',
      from: `link:${link.id}`,
      untrusted: true,
    });
  });
});

describe("Petal's own agent", () => {
  const FIVE = [
    'list_explorations',
    'get_exploration',
    'start_exploration',
    'save_step',
    'add_note',
  ];

  test('is offered none of the exploration tools, and no door loses them', async () => {
    for (const name of FIVE) {
      const t = registry.find((x) => x.name === name);
      expect(t, name).toBeDefined();
      expect(forAgent(t as never), name).toBe(false);
    }
    expect(llmTools(registry).map((t) => t.name)).not.toEqual(expect.arrayContaining(FIVE));
    expect(llmTools(registry).some((t) => FIVE.includes(t.name))).toBe(false);
  });

  test('reads no short link: its result is the same size as before', async () => {
    const out = {
      spec_sha256: 'a'.repeat(64),
      view_url: 'https://x/draft?spec=abc',
      short_url: `https://x/d/${'a'.repeat(64)}`,
      legend: [],
      petals: [],
      tools_version: 'tools/v1',
    };
    const read = forModel('render_flower', out) as Out;
    expect(read).not.toHaveProperty('short_url');
    expect(read.view_url).toBe(`/draft?flower=${'a'.repeat(8)}`);
  });

  test('is told nothing new: render_flower says what it said', async () => {
    const def = llmTools(registry).find((t) => t.name === 'render_flower');
    expect(JSON.stringify(def)).not.toMatch(/short_url|exploration/);
  });
});

describe('a token in a log', () => {
  test('a failure on a link route answers with the usual error, and logs no token', async () => {
    const { app, stateDir } = setup();
    const b = new Browser(app);
    await b.signIn();
    const made = await b.post('/api/v1/explorations', { question: 'q' });
    const { exploration } = (await made.json()) as Out;
    const link = await b.post(`/api/v1/explorations/${exploration}/links`, { scope: 'read' });
    const token = ((await link.json()) as Out).url.split('/').pop();
    const seen: string[] = [];
    const real = { error: console.error, warn: console.warn, log: console.log };
    console.error =
      console.warn =
      console.log =
        (...args: unknown[]) => {
          seen.push(args.join(' '));
        };
    try {
      const raw = new (process.getBuiltinModule('node:sqlite').DatabaseSync)(
        join(stateDir, 'private.db'),
      );
      raw.exec('DROP TABLE session');
      raw.close();
      const res = await b.get(`/api/v1/explorations/${token}`);
      expect(res.status).toBe(500);
      expect(await res.text()).not.toContain(token);
    } finally {
      Object.assign(console, real);
    }
    expect(seen.join('\n')).not.toContain(token);
  });
});

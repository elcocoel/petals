// A person's agents across their projects (9 Nov, agent-house-test.md): an agent link that only waits for jobs,
// agents named by what they call themselves, a job aimed at one, a wait the bell wakes, nothing taken for a wait
// nobody's holding, and a report taken up at once as a turn in its run. Through petalApp, scripted model.
import { join } from 'node:path';
import { DEFAULT_VIEW } from '@petal/core';
import { fakeRpcFor, testSigner } from '@petal/near/auth/testing';
import { openStore } from '@petal/store';
import { describe, expect, test } from 'vitest';
import { buildPetalApp } from '../src/app.ts';
import { fundPerson, mintInvite } from '../src/invites.ts';
import { fakeRegistry, parseSse, type ScriptTurn, scriptedLlm, tmpRoot } from './helpers.ts';

const SITE = 'https://petals.example';
const COOKIE = '__Host-petal_session';
const alice = testSigner('alice.near');
const ASK = { messages: [{ role: 'user', content: 'map RaidGuild with my agents' }] };

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
  const call = async (
    method: string,
    path: string,
    json?: unknown,
    headers: Record<string, string> = {},
  ) => {
    const res = await app.request(path, {
      method,
      headers: {
        origin: SITE,
        'content-type': 'application/json',
        ...(jar.cookie ? { cookie: jar.cookie } : {}),
        ...headers,
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
  /** Signed in with no credit of their own, chatting on a sponsored invite instead. */
  const signInWithInvite = async () => {
    const c = (await (await call('POST', '/api/v1/auth/challenge', {})).json()) as Out;
    await call('POST', '/api/v1/auth/verify', {
      network: 'mainnet',
      proof: alice.sign(c as never),
    });
    const s = openStore(join(stateDir, 'private.db'));
    let token: string;
    try {
      token = (await mintInvite(s, { usd: 2 })).token;
    } finally {
      await s.close();
    }
    expect((await call('POST', '/api/v1/auth/invite', { token })).status).toBe(200);
  };
  /** An agent's wait, with no session: only the link. */
  const wait = (token: string, as: string, wait_s = 0, signal?: AbortSignal) =>
    app.request('/api/v1/agents/wait', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ as, wait_s }),
      ...(signal ? { signal } : {}),
    });
  /** A wait from one worker of an agent: a window or a sub-agent that joined as `as` (swarm.md step 1). */
  const waitAs = (token: string, as: string, worker: unknown, wait_s = 0) =>
    app.request('/api/v1/agents/wait', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ as, worker, wait_s }),
    });
  return { app, llm, call, signInFunded, signInWithInvite, wait, waitAs };
}

const link = async (w: ReturnType<typeof setup>) =>
  ((await (await w.call('POST', '/api/v1/agents/link', {})).json()) as Out).token as string;

describe('several workers of one agent (swarm.md step 1)', () => {
  const list = async (w: ReturnType<typeof setup>) =>
    ((await (await w.call('GET', '/api/v1/agents')).json()) as Out).agents as Out[];

  test('two Codex windows are workers 1 and 2 ("Codex", "Codex 2"), each holding its own job', async () => {
    const w = setup([
      {
        calls: [
          { name: 'hand_job', args: { title: 'Map the shares', brief: 'who holds shares' } },
          { name: 'hand_job', args: { title: 'Name the members', brief: 'who are they' } },
        ],
      },
      { content: 'Two jobs are out.' },
    ]);
    await w.signInFunded();
    const token = await link(w);
    // each joins, in this order
    expect(((await (await w.waitAs(token, 'Codex', 'w-one')).json()) as Out).job).toBeNull();
    expect(((await (await w.waitAs(token, 'Codex', 'w-two')).json()) as Out).job).toBeNull();
    await (await w.call('POST', '/api/v1/agent/chat', ASK)).text();
    const one = ((await (await w.waitAs(token, 'Codex', 'w-one')).json()) as Out).job;
    const two = ((await (await w.waitAs(token, 'Codex', 'w-two')).json()) as Out).job;
    expect([one?.title, two?.title].sort()).toEqual(['Map the shares', 'Name the members']);
    expect(await list(w)).toMatchObject([
      { name: 'Codex', n: 1, worker: 'w-one', waiting: false, job: { id: one.id } },
      { name: 'Codex', n: 2, worker: 'w-two', waiting: false, job: { id: two.id } },
    ]);
  });

  test('a wait with no worker is one entry, as before; a worker that is not an id is refused', async () => {
    const w = setup([]);
    await w.signInFunded();
    const token = await link(w);
    expect((await w.wait(token, 'Hermes')).status).toBe(200);
    expect(await list(w)).toMatchObject([{ name: 'Hermes', n: 1, worker: null }]);
    for (const bad of ['', 'has space', 'x'.repeat(33), 7]) {
      const res = await w.waitAs(token, 'Hermes', bad);
      expect(res.status, String(bad)).toBe(400);
      expect(JSON.stringify(await res.json())).toMatch(/worker must be/);
    }
  });

  test('disconnecting an agent takes all its workers, and connecting again starts from its first', async () => {
    const w = setup([]);
    await w.signInFunded();
    const token = await link(w);
    for (const id of ['a1', 'a2', 'a3']) await w.waitAs(token, 'Codex', id);
    expect((await list(w)).map((a) => [a.name, a.n])).toEqual([
      ['Codex', 1],
      ['Codex', 2],
      ['Codex', 3],
    ]);
    expect((await w.call('POST', '/api/v1/agents/disconnect', { name: 'Codex' })).status).toBe(200);
    expect(await list(w)).toEqual([]);
    await new Promise((r) => setTimeout(r, 5));
    const fresh = await link(w);
    expect((await w.waitAs(fresh, 'Codex', 'a3')).status).toBe(200);
    expect(await list(w)).toMatchObject([{ n: 1, worker: 'a3' }]);
  });
});

describe('a conversation per job (swarm.md step 2)', () => {
  test("a job's work goes in its own conversation, named by it, which says who's on it; its report lands in both", async () => {
    const w = setup([
      {
        calls: [{ name: 'hand_job', args: { title: 'Map the shares', brief: 'who holds shares' } }],
      },
      { content: 'Sent.' },
      { content: 'Your agent found 42 holders.' },
    ]);
    await w.signInFunded();
    const token = await link(w);
    await w.waitAs(token, 'Codex', 'w-one');
    await w.waitAs(token, 'Codex', 'w-two');
    const events = parseSse(await (await w.call('POST', '/api/v1/agent/chat', ASK)).text());
    const job = (events.find((e) => e.event === 'job') as { data: Out }).data;
    expect(job.conversation).toMatch(/^exp_/);
    expect(job.conversation).not.toBe(job.exploration);
    // the second worker takes it, and works in the job's own conversation
    const got = (await (await w.waitAs(token, 'Codex', 'w-two')).json()) as Out;
    expect(got.job.id).toBe(job.id);
    const ref = (got.project.exploration as string).split('/s/')[1] as string;
    const opened = (await (await w.app.request(`/api/v1/explorations/${ref}`)).json()) as Out;
    expect(opened.exploration).toBe(job.conversation);
    expect(opened.presence).toMatchObject({ client: 'Codex', n: 2, last_tool: 'take_job' });
    // its notes go there as it works, and keep saying who's on it
    const note = await w.app.request(`/api/v1/explorations/${ref}/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Reading 312 proposals' }),
    });
    expect(note.status).toBe(200);
    // it lists with the person's conversations, named by the job
    const listed = (
      ((await (await w.call('GET', '/api/v1/conversations')).json()) as Out).conversations as Out[]
    ).find((c) => c.id === job.conversation);
    expect(listed).toMatchObject({ title: 'Map the shares', status: 'elsewhere', run_id: null });
    // the report, from its own conversation
    const reported = await w.app.request(`/api/v1/explorations/${ref}/jobs/${job.id}/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ result: { summary: '42 holders.' } }),
    });
    expect(reported.status).toBe(200);
    const after = (await (await w.app.request(`/api/v1/explorations/${ref}`)).json()) as Out;
    expect(after.presence).toMatchObject({ client: 'Codex', n: 2, last_tool: 'report_job' });
    expect(JSON.stringify(after)).toContain('Reading 312 proposals');
    expect(JSON.stringify(after)).toContain('42 holders.');
    // and in the conversation that handed it out: the job, where its work is, and who took it
    const jobs = (await (
      await w.call('GET', `/api/v1/explorations/${job.exploration}/jobs`)
    ).json()) as Out;
    expect(jobs.jobs).toMatchObject([
      { id: job.id, status: 'done', conversation: job.conversation, taken_by: 'Codex', n: 2 },
    ]);
    // Petals' agent takes the report up at once, as before
    for (let i = 0; i < 50 && w.llm.requests.length < 3; i++)
      await new Promise((r) => setTimeout(r, 20));
    expect(w.llm.requests[2]?.messages.at(-1)?.content).toMatch(
      /\(Petals\) The job "Map the shares" came back from Codex/,
    );
  });
});

describe('agents across projects', () => {
  test('disconnecting one agent ends its wait, drops it from the list, and keeps it out until it connects again', async () => {
    const w = setup([]);
    await w.signInFunded();
    const token = await link(w);
    expect((await w.wait(token, 'Codex')).status).toBe(200);
    expect((await w.wait(token, 'claude-code')).status).toBe(200);
    const names = async () =>
      (((await (await w.call('GET', '/api/v1/agents')).json()) as Out).agents as Out[]).map(
        (a) => a.name,
      );
    expect((await names()).sort()).toEqual(['Codex', 'claude-code']);
    const open = w.wait(token, 'Codex', 5);
    await new Promise((r) => setTimeout(r, 30));
    const off = await w.call('POST', '/api/v1/agents/disconnect', { name: 'codex' });
    expect(off.status).toBe(200);
    expect(((await off.json()) as Out).disconnected.name).toBe('codex');
    // the wait it had open ends now, refused
    expect((await open).status).toBe(401);
    expect(await names()).toEqual(['claude-code']);
    const again = await w.wait(token, 'Codex');
    expect(again.status).toBe(401);
    expect(JSON.stringify(await again.json())).toMatch(/disconnected in Petals/);
    // another agent on the same link carries on
    expect((await w.wait(token, 'claude-code')).status).toBe(200);
    // the prompt copied into it again: a new link connects it again
    await new Promise((r) => setTimeout(r, 5));
    const fresh = await link(w);
    expect((await w.wait(fresh, 'codex')).status).toBe(200);
    expect((await names()).sort()).toEqual(['claude-code', 'codex']);
    const none = await w.call('POST', '/api/v1/agents/disconnect', { name: 'hermes' });
    expect(none.status).toBe(404);
  });

  test('a link waits only for its person, a second one keeps the first working, and revoke ends them', async () => {
    const w = setup([]);
    expect((await w.call('POST', '/api/v1/agents/link', {})).status).toBe(401);
    await w.signInFunded();
    const first = await link(w);
    const second = await link(w);
    expect(first).toMatch(/^petal_agent_[A-Za-z0-9_-]{43}$/);
    for (const t of [first, second])
      expect(((await (await w.wait(t, 'Claude Code')).json()) as Out).job).toBeNull();
    const links = ((await (await w.call('GET', '/api/v1/agents/link')).json()) as Out).links;
    expect(links).toHaveLength(2);
    await w.call('POST', '/api/v1/agents/link/revoke', {});
    expect((await w.wait(first, 'Claude Code')).status).toBe(401);
    expect((await w.wait('petal_agent_nope', 'x')).status).toBe(401);
  });

  test('a job sent to one agent goes to that one only, with a continue link for its project', async () => {
    const w = setup([
      {
        calls: [
          {
            name: 'hand_job',
            args: { title: 'Map the shares', brief: 'who holds shares', to: 'claude code' },
          },
        ],
      },
      { content: 'Sent.' },
    ]);
    await w.signInFunded();
    const token = await link(w);
    // both introduce themselves, so Petals' agent can name them
    await w.wait(token, 'Claude Code');
    await w.wait(token, 'Hermes');
    const events = parseSse(await (await w.call('POST', '/api/v1/agent/chat', ASK)).text());
    const job = events.find((e) => e.event === 'job')?.data as Out;
    expect(job).toMatchObject({ to: 'Claude Code', taken_by: null, status: 'open' });
    // the system message told it who's connected
    expect(w.llm.requests[0]?.messages[0]?.content).toContain('## Agents connected');
    expect(((await (await w.wait(token, 'Hermes')).json()) as Out).job).toBeNull();
    const got = (await (await w.wait(token, 'claude code')).json()) as Out;
    expect(got.job).toMatchObject({ id: job.id, title: 'Map the shares', to: 'Claude Code' });
    expect(got.project.exploration).toMatch(/\/s\/[A-Za-z0-9_-]{43}$/);
    const agents = ((await (await w.call('GET', '/api/v1/agents')).json()) as Out).agents;
    expect(agents.find((a: Out) => a.name === 'claude code')?.job?.id).toBe(job.id);
  });

  test("a job comes with the person's view, so their own agent draws every flower as they see it", async () => {
    const IDENTITY = {
      ...DEFAULT_VIEW,
      dimensions: { ...DEFAULT_VIEW.dimensions, colour: { data: 'identity' } },
    };
    const w = setup([
      {
        calls: [{ name: 'hand_job', args: { title: 'Map the shares', brief: 'who holds shares' } }],
      },
      { content: 'Sent.' },
    ]);
    await w.signInFunded();
    expect((await w.call('PUT', '/api/v1/me/view', { view: IDENTITY })).status).toBe(200);
    const token = await link(w);
    await (await w.call('POST', '/api/v1/agent/chat', ASK)).text();
    const got = (await (await w.wait(token, 'Claude Code')).json()) as Out;
    expect(got.job).toMatchObject({ title: 'Map the shares' });
    expect(got.view).toEqual(IDENTITY);
  });

  test('a waiting agent wakes when a job is handed out', async () => {
    const w = setup([
      { calls: [{ name: 'hand_job', args: { title: 'Map', brief: 'map it' } }] },
      { content: 'ok' },
    ]);
    await w.signInFunded();
    const token = await link(w);
    const started = Date.now();
    const waiting = w.wait(token, 'Hermes', 5);
    await new Promise((r) => setTimeout(r, 50));
    expect(((await (await w.call('GET', '/api/v1/agents')).json()) as Out).agents[0]).toMatchObject(
      {
        name: 'Hermes',
        waiting: true,
      },
    );
    await (await w.call('POST', '/api/v1/agent/chat', ASK)).text();
    const got = (await (await waiting).json()) as Out;
    expect(got.job?.title).toBe('Map');
    expect(Date.now() - started).toBeLessThan(4000);
  });

  test('nothing is taken for a wait that was closed', async () => {
    const w = setup([
      { calls: [{ name: 'hand_job', args: { title: 'Map', brief: 'map it' } }] },
      { content: 'ok' },
    ]);
    await w.signInFunded();
    const token = await link(w);
    const ac = new AbortController();
    const waiting = Promise.resolve(w.wait(token, 'Codex', 5, ac.signal)).catch(() => null);
    await new Promise((r) => setTimeout(r, 50));
    ac.abort();
    await waiting;
    const events = parseSse(await (await w.call('POST', '/api/v1/agent/chat', ASK)).text());
    const job = events.find((e) => e.event === 'job')?.data as Out;
    await new Promise((r) => setTimeout(r, 50));
    const jobs = (
      (await (await w.call('GET', `/api/v1/explorations/${job.exploration}/jobs`)).json()) as Out
    ).jobs;
    expect(jobs[0]).toMatchObject({ status: 'open', taken_by: null });
  });

  test('a report is taken up at once, as a turn in the run that handed the job out', async () => {
    const w = setup([
      {
        calls: [{ name: 'hand_job', args: { title: 'Map the shares', brief: 'who holds shares' } }],
      },
      { content: 'Sent.' },
      { content: 'Your agent found 42 holders.' },
    ]);
    await w.signInFunded();
    const token = await link(w);
    const first = parseSse(await (await w.call('POST', '/api/v1/agent/chat', ASK)).text());
    const runId = (first[0] as { data: { run_id: string } }).data.run_id;
    const got = (await (await w.wait(token, 'Claude Code')).json()) as Out;
    const ref = (got.project.exploration as string).split('/s/')[1];
    const reported = await w.app.request(`/api/v1/explorations/${ref}/jobs/${got.job.id}/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ result: { summary: '42 holders.' } }),
    });
    expect(reported.status).toBe(200);
    // the turn runs on the server; wait for its model call
    for (let i = 0; i < 50 && w.llm.requests.length < 3; i++)
      await new Promise((r) => setTimeout(r, 20));
    expect(w.llm.requests).toHaveLength(3);
    const turn = w.llm.requests[2];
    expect(turn?.messages.at(-1)?.content).toMatch(
      /\(Petals\) The job "Map the shares" came back from Claude Code/,
    );
    expect(turn?.messages[0]?.content).toContain('report: "42 holders."');
    for (let i = 0; i < 50; i++) {
      const run = (await (await w.call('GET', `/api/v1/agent/runs/${runId}`)).json()) as Out;
      if (run.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 20));
    }
    const run = (await (await w.call('GET', `/api/v1/agent/runs/${runId}`)).json()) as Out;
    expect(JSON.stringify(run.events)).toContain('Your agent found 42 holders.');
  });

  test('with no credit of their own, a report is taken up on the invite they chat on, and charged to it', async () => {
    const w = setup([
      {
        calls: [{ name: 'hand_job', args: { title: 'Map the shares', brief: 'who holds shares' } }],
      },
      { content: 'Sent.' },
      { content: 'Your agent found 42 holders.' },
    ]);
    await w.signInWithInvite();
    const token = await link(w);
    const first = parseSse(await (await w.call('POST', '/api/v1/agent/chat', ASK)).text());
    const runId = (first[0] as { data: { run_id: string } }).data.run_id;
    const spent = async () =>
      ((await (await w.call('GET', '/api/v1/auth/invite')).json()) as Out).invite
        .spent_usd as number;
    const before = await spent();
    expect(before).toBeCloseTo(0.02);
    const got = (await (await w.wait(token, 'Claude Code')).json()) as Out;
    const ref = (got.project.exploration as string).split('/s/')[1];
    const reported = await w.app.request(`/api/v1/explorations/${ref}/jobs/${got.job.id}/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ result: { summary: '42 holders.' } }),
    });
    expect(reported.status).toBe(200);
    for (let i = 0; i < 50; i++) {
      const run = (await (await w.call('GET', `/api/v1/agent/runs/${runId}`)).json()) as Out;
      if (w.llm.requests.length >= 3 && run.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(w.llm.requests).toHaveLength(3);
    expect(w.llm.requests[2]?.messages.at(-1)?.content).toMatch(/came back from Claude Code/);
    const run = (await (await w.call('GET', `/api/v1/agent/runs/${runId}`)).json()) as Out;
    expect(JSON.stringify(run.events)).toContain('Your agent found 42 holders.');
    expect(await spent()).toBeCloseTo(0.03);
  });
});

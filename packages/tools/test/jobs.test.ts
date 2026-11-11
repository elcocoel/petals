// Jobs in a project (Elco, 9 Nov, B with C): Petals' agent hands a job out, the person's own agent
// takes it with the project's continue link, does it on its machine and reports back; the page reads
// the list with any link. Over HTTP, as the pasted file and curl call them.
import { DEFAULT_VIEW } from '@petal/core';
import { Hono } from 'hono';
import { beforeEach, describe, expect, test } from 'vitest';
import { agentKeyHash } from '../src/agent-key.ts';
import { privateStore } from '../src/drafts.ts';
import { isToolError } from '../src/errors.ts';
import { httpApp } from '../src/http/app.ts';
import { registry } from '../src/registry.ts';
import { rig, type TestRig } from './helpers.ts';

// biome-ignore lint/suspicious/noExplicitAny: walking tool outputs
type Out = Record<string, any>;

let r: TestRig;
beforeEach(async () => {
  r = await rig();
});

function door() {
  const app = new Hono();
  app.route(
    '/',
    httpApp(r.ctx, {
      gate: {
        subjectOf: async (c) => c.req.header('x-test-subject') ?? null,
        refuseForeign: () => null,
      },
    }),
  );
  return app;
}
const send = async (app: Hono, method: string, path: string, json?: unknown, subject?: string) =>
  (await (
    await app.request(path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(subject ? { 'x-test-subject': subject } : {}),
      },
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
    })
  ).json()) as Out;

/** A project its owner started, with a continue and a read link, and two jobs handed out. */
async function project() {
  const app = door();
  const started = await send(app, 'POST', '/api/v1/explorations', { question: 'who?' }, 'prs_a');
  const id = started.exploration;
  const token = async (scope: string) =>
    (
      (await send(app, 'POST', `/api/v1/explorations/${id}/links`, { scope }, 'prs_a'))
        .url as string
    )
      .split('/')
      .pop() as string;
  const store = privateStore(r.ctx.config);
  for (const [n, title] of ['Map RaidGuild', 'Map MetaCartel'].entries()) {
    await store.job.add({
      id: `job_${n}`,
      exploration: id,
      run: null,
      kind: 'map',
      title,
      brief: `${title}: who holds the shares?`,
      inputs: { n },
      at: `2026-11-09T12:0${n}:00.000Z`,
    });
  }
  return { app, id: id as string, cont: await token('continue'), read: await token('read') };
}

describe('jobs over HTTP', () => {
  test("the person's agent takes the jobs in order with the continue link, then there are none", async () => {
    const { app, id, cont } = await project();
    const take = () => send(app, 'POST', `/api/v1/explorations/${cont}/jobs/take`, {});
    expect(await take()).toMatchObject({
      exploration: id,
      job: { id: 'job_0', kind: 'map', title: 'Map RaidGuild', inputs: { n: 0 } },
    });
    expect((await take()).job.id).toBe('job_1');
    const none = await take();
    expect(none.job).toBeNull();
    expect(none.next).toContain('No job');
  });

  test('it reports a taken job once, done or failed, and the page reads it with any link', async () => {
    const { app, cont, read } = await project();
    await send(app, 'POST', `/api/v1/explorations/${cont}/jobs/take`, {});
    await send(app, 'POST', `/api/v1/explorations/${cont}/jobs/take`, {});
    const result = { summary: 'Three members hold most of the shares.', steps: [0] };
    const report = (job: string, body: unknown) =>
      send(app, 'POST', `/api/v1/explorations/${cont}/jobs/${job}/report`, body);
    expect(await report('job_0', { result })).toMatchObject({
      job: { id: 'job_0', status: 'done' },
    });
    expect(await report('job_1', { failed: 'No members found' })).toMatchObject({
      job: { status: 'failed' },
    });
    expect((await report('job_0', { result })).error.code).toBe('not_found');
    expect((await report('job_1', { result, failed: 'x' })).error.code).toBe('bad_input');
    expect((await report('job_1', {})).error.code).toBe('bad_input');

    const list = await send(app, 'GET', `/api/v1/explorations/${read}/jobs`);
    expect(list.jobs.map((j: Out) => [j.id, j.status])).toEqual([
      ['job_0', 'done'],
      ['job_1', 'failed'],
    ]);
    expect(list.jobs[0]).toMatchObject({ result, failed: null });
    expect(list.jobs[0]).not.toHaveProperty('run');
  });

  test('a read link can list but not take or report; a stranger gets nothing at all', async () => {
    const { app, read } = await project();
    expect((await send(app, 'POST', `/api/v1/explorations/${read}/jobs/take`, {})).error.code).toBe(
      'unauthorised',
    );
    expect(
      (await send(app, 'POST', `/api/v1/explorations/${read}/jobs/job_0/report`, { failed: 'x' }))
        .error.code,
    ).toBe('unauthorised');
    const stranger = 'A'.repeat(43);
    expect((await send(app, 'GET', `/api/v1/explorations/${stranger}/jobs`)).error.code).toBe(
      'not_found',
    );
    expect(
      (await send(app, 'POST', `/api/v1/explorations/${stranger}/jobs/take`, {})).error.code,
    ).toBe('not_found');
  });
});

describe("a job's own conversation (swarm.md step 2)", () => {
  test('taken with the project link, its work goes in its own conversation, and its report lands there too', async () => {
    const { app, id, cont, read } = await project();
    const store = privateStore(r.ctx.config);
    const own = await send(
      app,
      'POST',
      '/api/v1/explorations',
      { question: 'Map Moloch' },
      'prs_a',
    );
    await store.job.add({
      id: 'job_own',
      exploration: id,
      run: null,
      kind: 'map',
      title: 'Map Moloch',
      brief: 'who holds the shares?',
      inputs: {},
      at: '2026-11-09T11:00:00.000Z',
      conversation: own.exploration,
    });
    const take = () => send(app, 'POST', `/api/v1/explorations/${cont}/jobs/take`, {});
    // the older jobs come first, in the order handed out; with no conversation, their work is in the project
    expect(await take()).toMatchObject({ exploration: id, job: { id: 'job_0' } });
    expect((await take()).job.id).toBe('job_1');
    const took = await take();
    expect(took).toMatchObject({ exploration: own.exploration, job: { id: 'job_own' } });
    expect(took.link).toMatch(/\/s\//);
    expect(took.next).toContain('passing link as exploration');
    const there = (took.link as string).split('/').pop() as string;
    const reported = await send(app, 'POST', `/api/v1/explorations/${there}/jobs/job_own/report`, {
      result: { summary: 'Three members hold most of the shares.' },
    });
    expect(reported.job).toMatchObject({ id: 'job_own', status: 'done' });
    const opened = await send(app, 'GET', `/api/v1/explorations/${there}`);
    expect(opened.notes.map((n: Out) => n.text)).toEqual([
      'Three members hold most of the shares.',
    ]);
    // the project that handed it out lists it, with where its work is; it took no worker, so it's the first
    const listed = await send(app, 'GET', `/api/v1/explorations/${read}/jobs`);
    expect(listed.jobs.find((j: Out) => j.id === 'job_own')).toMatchObject({
      status: 'done',
      conversation: own.exploration,
    });
  });
});

describe('the link the page hands the person’s agent', () => {
  test('opens the open jobs and how to take them; a read link only shows them', async () => {
    const { app, cont, read } = await project();
    const packet = async (token: string) => (await app.request(`/s/${token}`)).text();
    const withContinue = await packet(cont);
    expect(withContinue).toContain('## Open jobs (2)');
    expect(withContinue).toContain('"title":"Map RaidGuild"');
    expect(withContinue).toContain('To take the open jobs: take_job with this link');
    expect(withContinue).toContain(`/api/v1/explorations/${cont}/jobs/take`);
    const withRead = await packet(read);
    expect(withRead).toContain('## Open jobs (2)');
    expect(withRead).not.toContain('To take the open jobs');
    await send(app, 'POST', `/api/v1/explorations/${cont}/jobs/take`, {});
    expect(await packet(cont)).toContain('## Open jobs (1)');
  });
});

// 10 Nov (research/cloud-agent-permissions-2026-11-10.md): an app at /mcp can't hold a wait open, so it takes
// the person's jobs with their agent key when they ask, from any of their projects, and works in the link.
describe('take_job with the agent key', () => {
  const KEY = `petal_agent_${'k'.repeat(43)}`;
  async function keyed() {
    const p = await project();
    const store = privateStore(r.ctx.config);
    await store.agentLink.create({
      id: 'agl_1',
      owner: 'prs_a',
      token_hash: agentKeyHash(KEY),
      created_at: '2026-11-10T00:00:00.000Z',
    });
    const take = (input: Record<string, unknown>) =>
      registry
        .find((t) => t.name === 'take_job')
        ?.run(input, { ...r.ctx, caller: { door: 'mcp' } });
    return { ...p, store, take };
  }

  test('takes their jobs in order with a continue link, counts the agent as seen, then none', async () => {
    const { id, store, take } = await keyed();
    const first = (await take({ agent_key: KEY, as: 'claude-app' })) as Out;
    expect(first).toMatchObject({ exploration: id, job: { id: 'job_0', title: 'Map RaidGuild' } });
    expect(first.link).toMatch(/\/s\//);
    // with the person's view (theirs, or the default), to draw every flower as they see it
    expect(first.view).toEqual(DEFAULT_VIEW);
    // the link works the project: report the job with it
    const reported = (await registry
      .find((t) => t.name === 'report_job')
      ?.run(
        { exploration: first.link, job: 'job_0', result: { summary: 'Three hold most.' } },
        { ...r.ctx, caller: { door: 'mcp' } },
      )) as Out;
    expect(reported.job).toMatchObject({ id: 'job_0', status: 'done' });
    expect(((await take({ agent_key: KEY, as: 'claude-app' })) as Out).job.id).toBe('job_1');
    expect(((await take({ agent_key: KEY, as: 'claude-app' })) as Out).job).toBeNull();
    expect((await store.agent.list('prs_a')).map((a) => a.name)).toEqual(['claude-app']);
    expect((await store.job.list(id)).find((j) => j.id === 'job_1')?.taken_by).toBe('claude-app');
  });

  test('a job sent to another agent stays for that one', async () => {
    const { id, store, take } = await keyed();
    await store.job.take(id, '2026-11-10T00:00:01.000Z');
    await store.job.take(id, '2026-11-10T00:00:01.000Z');
    await store.job.add({
      id: 'job_x',
      exploration: id,
      run: null,
      kind: 'map',
      title: 'For Codex',
      brief: 'only codex',
      inputs: {},
      to: 'codex',
      at: '2026-11-10T00:00:02.000Z',
    });
    expect(((await take({ agent_key: KEY, as: 'claude-app' })) as Out).job).toBeNull();
    expect(((await take({ agent_key: KEY, as: 'Codex' })) as Out).job.id).toBe('job_x');
  });

  test('an agent the person disconnected is refused, until a key made after connects it again', async () => {
    const { id, store, take } = await keyed();
    await store.agent.seen({
      owner: 'prs_a',
      name: 'claude-app',
      last_seen: '2026-11-10T00:30:00.000Z',
    });
    await store.agent.setDisconnected('prs_a', 'Claude-App', '2026-11-10T01:00:00.000Z');
    const refused = (await take({ agent_key: KEY, as: 'claude-app' })) as Out;
    expect(isToolError(refused) && refused.error.code).toBe('unauthorised');
    expect((await store.job.list(id)).every((j) => j.status === 'open')).toBe(true);
    const LATER = `petal_agent_${'n'.repeat(43)}`;
    await store.agentLink.create({
      id: 'agl_2',
      owner: 'prs_a',
      token_hash: agentKeyHash(LATER),
      created_at: '2026-11-10T02:00:00.000Z',
    });
    expect(((await take({ agent_key: LATER, as: 'claude-app' })) as Out).job.id).toBe('job_0');
    expect((await store.agent.get('prs_a', 'claude-app'))?.disconnected_at).toBeNull();
  });

  test('a bad or revoked key, or no name, is refused and takes nothing', async () => {
    const { id, store, take } = await keyed();
    const code = async (input: Record<string, unknown>) => {
      const out = await take(input);
      return isToolError(out) ? out.error.code : 'none';
    };
    expect(await code({ agent_key: `petal_agent_${'z'.repeat(43)}`, as: 'claude-app' })).toBe(
      'unauthorised',
    );
    expect(await code({ agent_key: 'nonsense', as: 'claude-app' })).toBe('unauthorised');
    expect(await code({ agent_key: KEY })).toBe('bad_input');
    expect(await code({})).toBe('bad_input');
    await store.agentLink.revoke('prs_a', '2026-11-10T00:00:03.000Z');
    expect(await code({ agent_key: KEY, as: 'claude-app' })).toBe('unauthorised');
    expect((await store.job.list(id)).every((j) => j.status === 'open')).toBe(true);
  });
});

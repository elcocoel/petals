// One prompt, several agents (Elco, 9 Nov): an agent joins with the person's agent key, then waits
// for its next job, asking the site again and again and coming back before its app's own limit.
// A stand-in site and a stand-in clock; a throwaway PETALS_HOME.
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { agentFile, joinAgent, waitForJob, workerFile } from '../src/agents.ts';

const KEY = `petal_agent_${'A'.repeat(43)}`;
const SITE = 'https://petals.example';
const LINK = `${SITE}/s/${'b'.repeat(43)}`;
const home = () => ({ PETALS_HOME: mkdtempSync(join(tmpdir(), 'petal-agent-')) });

interface Ask {
  url: string;
  auth: string;
  body: { as: string; worker?: string; wait_s: number };
}

/** A site that answers each ask from a list, advancing the clock by what it was asked to hold. */
function site(answers: { status?: number; body: unknown }[], clock: { t: number }) {
  const asks: Ask[] = [];
  const fetch = async (url: string, init: RequestInit = {}) => {
    const body = JSON.parse(init.body as string) as Ask['body'];
    asks.push({ url, auth: (init.headers as Record<string, string>).authorization ?? '', body });
    const a = answers.shift() ?? { body: { job: null } };
    if (!(a.body as { job?: unknown }).job) clock.t += body.wait_s * 1000;
    return new Response(JSON.stringify(a.body), {
      status: a.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { asks, fetch };
}

describe('join', () => {
  test('keeps the key and a lowercase name as a new worker, readable only by the person', () => {
    const env = home();
    const out = joinAgent(env, KEY, 'Claude-Code');
    expect(out).toMatchObject({ joined: true, as: 'claude-code' });
    const worker = out.worker as string;
    expect(worker).toMatch(/^[a-z0-9]{6}$/);
    expect(out.next).toContain(`jobs wait --worker ${worker}`);
    expect(JSON.parse(readFileSync(workerFile(env, worker), 'utf8'))).toEqual({
      key: KEY,
      as: 'claude-code',
    });
    expect(statSync(workerFile(env, worker)).mode & 0o777).toBe(0o600);
  });

  test('each join is a worker of its own: two windows, or two sub-agents, on one computer', () => {
    const env = home();
    const a = joinAgent(env, KEY, 'codex').worker;
    const b = joinAgent(env, KEY, 'codex').worker;
    expect(a).not.toBe(b);
  });

  test('refuses what isn’t an agent key, and a name that isn’t short and plain', () => {
    expect(joinAgent(home(), 'sk-123', 'codex')).toMatchObject({ error: { code: 'bad_input' } });
    expect(joinAgent(home(), KEY, 'my agent!')).toMatchObject({ error: { code: 'bad_input' } });
  });
});

describe('jobs wait', () => {
  test('waits as its own worker, and says so in what to run again', async () => {
    const env = home();
    const worker = joinAgent(env, KEY, 'codex').worker as string;
    joinAgent(env, KEY, 'codex');
    const clock = { t: 0 };
    const s = site([], clock);
    const out = await waitForJob({
      env,
      site: SITE,
      fetch: s.fetch,
      now: () => clock.t,
      forS: 60,
      worker,
    });
    expect(s.asks[0]?.body).toMatchObject({ as: 'codex', worker });
    expect(out.next).toContain(`jobs wait --worker ${worker}`);
  });

  test('with several workers here and none named, it asks for one; an unknown one is refused', async () => {
    const env = home();
    joinAgent(env, KEY, 'codex');
    joinAgent(env, KEY, 'codex');
    const s = site([], { t: 0 });
    const which = await waitForJob({ env, site: SITE, fetch: s.fetch, forS: 60 });
    expect(which).toMatchObject({
      error: { code: 'bad_input', message: expect.stringContaining('--worker') },
    });
    const unknown = await waitForJob({
      env,
      site: SITE,
      fetch: s.fetch,
      forS: 60,
      worker: 'zzzzzz',
    });
    expect(unknown).toMatchObject({
      error: { message: expect.stringContaining('No worker zzzzzz') },
    });
    expect(s.asks).toHaveLength(0);
  });

  test('an agent joined before workers keeps waiting as itself after newer joins on the same computer', async () => {
    const env = home();
    mkdirSync(env.PETALS_HOME, { recursive: true });
    const OLD = `petal_agent_${'B'.repeat(43)}`;
    writeFileSync(agentFile(env), JSON.stringify({ key: OLD, as: 'codex' }));
    // Claude Code joins later, with the new file; then a second one
    const newer = joinAgent(env, KEY, 'claude-code').worker as string;
    const s = site([], { t: 0 });
    const clock = { t: 0 };
    const s1 = site([], clock);
    await waitForJob({ env, site: SITE, fetch: s1.fetch, now: () => clock.t, forS: 60 });
    expect(s1.asks[0]).toMatchObject({ auth: `Bearer ${OLD}`, body: { as: 'codex' } });
    expect(s1.asks[0]?.body.worker).toBeUndefined();
    joinAgent(env, KEY, 'claude-code');
    const clock2 = { t: 0 };
    const s2 = site([], clock2);
    await waitForJob({ env, site: SITE, fetch: s2.fetch, now: () => clock2.t, forS: 60 });
    expect(s2.asks[0]).toMatchObject({ auth: `Bearer ${OLD}`, body: { as: 'codex' } });
    // and the newer one, named, waits as itself
    const clock3 = { t: 0 };
    const s3 = site([], clock3);
    await waitForJob({
      env,
      site: SITE,
      fetch: s3.fetch,
      now: () => clock3.t,
      forS: 60,
      worker: newer,
    });
    expect(s3.asks[0]).toMatchObject({
      auth: `Bearer ${KEY}`,
      body: { as: 'claude-code', worker: newer },
    });
    expect(s.asks).toHaveLength(0);
  });

  test('an agent joined before workers keeps waiting as it did, with no worker sent', async () => {
    const env = home();
    mkdirSync(env.PETALS_HOME, { recursive: true });
    writeFileSync(agentFile(env), JSON.stringify({ key: KEY, as: 'hermes' }));
    const clock = { t: 0 };
    const s = site([], clock);
    const out = await waitForJob({ env, site: SITE, fetch: s.fetch, now: () => clock.t, forS: 60 });
    expect(s.asks[0]?.body.worker).toBeUndefined();
    expect(out.next).toContain('Run node ~/.petals/petal.mjs jobs wait again');
  });

  test('asks again until a job comes, then sets the job’s project as the current one', async () => {
    const env = home();
    joinAgent(env, KEY, 'hermes');
    const clock = { t: 0 };
    const job = {
      id: 'job_1',
      kind: 'map',
      title: 'Map RaidGuild',
      brief: 'Who holds the shares?',
      inputs: {},
      to: 'hermes',
    };
    const s = site(
      [
        { body: { job: null } },
        { body: { job: null } },
        { body: { job, project: { exploration: LINK, question: 'q' } } },
      ],
      clock,
    );
    const current = join(env.PETALS_HOME, 'state', 'current.json');
    const out = await waitForJob({
      env,
      site: SITE,
      fetch: s.fetch,
      now: () => clock.t,
      currentFile: current,
    });
    expect(out).toMatchObject({ job: { id: 'job_1' }, project: { exploration: LINK } });
    expect(out.next).toContain('report_job');
    expect(s.asks).toHaveLength(3);
    for (const a of s.asks) {
      expect(a.url).toBe(`${SITE}/api/v1/agents/wait`);
      expect(a.auth).toBe(`Bearer ${KEY}`);
      expect(a.body.as).toBe('hermes');
      expect(a.body.wait_s).toBeLessThanOrEqual(85);
    }
    expect(JSON.parse(readFileSync(current, 'utf8'))).toEqual({
      link: LINK,
      as: 'hermes',
      worker: expect.stringMatching(/^[a-z0-9]{6}$/),
    });
  });

  test("the job's view is kept with its project, so the flowers drawn for it go through it", async () => {
    const env = home();
    joinAgent(env, KEY, 'codex');
    const clock = { t: 0 };
    const view = { petal: 'view/v1', color: { data: 'kind' } };
    const job = {
      id: 'job_3',
      kind: 'map',
      title: 'Map NEAR',
      brief: 'Who?',
      inputs: {},
      to: null,
    };
    const s = site([{ body: { job, project: { exploration: LINK, question: 'q' }, view } }], clock);
    const current = join(env.PETALS_HOME, 'state', 'current.json');
    const out = await waitForJob({
      env,
      site: SITE,
      fetch: s.fetch,
      now: () => clock.t,
      currentFile: current,
    });
    expect(out.next).toContain('drawn as the person sees it');
    expect(out.next).toContain('add_annotation');
    expect(out.next).toContain('annotations: the ids add_annotation gave');
    expect(JSON.parse(readFileSync(current, 'utf8'))).toMatchObject({
      link: LINK,
      view,
      as: 'codex',
    });
  });

  test('with no job, it comes back just before its time is up, so the agent runs it again', async () => {
    const env = home();
    joinAgent(env, KEY, 'claude-code');
    const clock = { t: 0 };
    const s = site([], clock);
    const out = await waitForJob({
      env,
      site: SITE,
      fetch: s.fetch,
      now: () => clock.t,
      forS: 200,
    });
    expect(out).toMatchObject({
      job: null,
      next: expect.stringMatching(/jobs wait --worker [a-z0-9]+ again/),
    });
    expect(s.asks.map((a) => a.body.wait_s)).toEqual([85, 85, 28]);
    expect(clock.t).toBeLessThanOrEqual(200_000);
  });

  test('a revoked key, a site that fails, and an agent that never joined each say so', async () => {
    const env = home();
    expect(await waitForJob({ env, site: SITE })).toMatchObject({ error: { code: 'bad_input' } });
    joinAgent(env, KEY, 'codex');
    const clock = { t: 0 };
    const revoked = site(
      [{ status: 401, body: { error: { code: 'unauthorised', message: 'no' } } }],
      clock,
    );
    expect(
      await waitForJob({ env, site: SITE, fetch: revoked.fetch, now: () => clock.t }),
    ).toMatchObject({
      error: {
        code: 'unauthorised',
        message: expect.stringContaining('Ask the person for a new one'),
      },
    });
    const down = async () => {
      throw new Error('connect ECONNREFUSED');
    };
    expect(await waitForJob({ env, site: SITE, fetch: down, now: () => clock.t })).toMatchObject({
      error: { code: 'source_failed' },
    });
  });
});

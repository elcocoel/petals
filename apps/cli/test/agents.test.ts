// One prompt, several agents (Elco, 9 Nov): an agent joins with the person's agent key, then waits
// for its next job, asking the site again and again and coming back before its app's own limit.
// A stand-in site and a stand-in clock; a throwaway PETALS_HOME.
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { agentFile, joinAgent, waitForJob } from '../src/agents.ts';

const KEY = `petal_agent_${'A'.repeat(43)}`;
const SITE = 'https://petals.example';
const LINK = `${SITE}/s/${'b'.repeat(43)}`;
const home = () => ({ PETALS_HOME: mkdtempSync(join(tmpdir(), 'petal-agent-')) });

interface Ask {
  url: string;
  auth: string;
  body: { as: string; wait_s: number };
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
  test('keeps the key and a lowercase name, readable only by the person', () => {
    const env = home();
    expect(joinAgent(env, KEY, 'Claude-Code')).toMatchObject({ joined: true, as: 'claude-code' });
    expect(JSON.parse(readFileSync(agentFile(env), 'utf8'))).toEqual({
      key: KEY,
      as: 'claude-code',
    });
    expect(statSync(agentFile(env)).mode & 0o777).toBe(0o600);
  });

  test('refuses what isn’t an agent key, and a name that isn’t short and plain', () => {
    expect(joinAgent(home(), 'sk-123', 'codex')).toMatchObject({ error: { code: 'bad_input' } });
    expect(joinAgent(home(), KEY, 'my agent!')).toMatchObject({ error: { code: 'bad_input' } });
  });
});

describe('jobs wait', () => {
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
    expect(JSON.parse(readFileSync(current, 'utf8'))).toEqual({ link: LINK });
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
    expect(out).toMatchObject({ job: null, next: expect.stringContaining('jobs wait again') });
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

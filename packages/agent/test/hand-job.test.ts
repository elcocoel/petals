// hand_job: Petals' agent hands a job to the person's own agent, the stream says so, and the
// report their agent leaves is in the system message of the next chat, as data. Through petalApp, with a
// scripted model; the person's side (take_job, report_job) is the store's calls here.
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
const ASK = { messages: [{ role: 'user', content: 'have my own agent map RaidGuild' }] };
const BRIEF = {
  title: 'Map RaidGuild',
  brief: 'Map who holds shares in RaidGuild, and who votes.',
};

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
  const post = async (path: string, json: unknown = {}) => {
    const res = await app.request(path, {
      method: 'POST',
      headers: {
        origin: SITE,
        'content-type': 'application/json',
        ...(jar.cookie ? { cookie: jar.cookie } : {}),
      },
      body: JSON.stringify(json),
    });
    const set = res.headers.getSetCookie().find((l) => l.startsWith(`${COOKIE}=`));
    if (set) jar.cookie = set.split(';')[0] as string;
    return res;
  };
  const signInFunded = async () => {
    const c = (await (await post('/api/v1/auth/challenge')).json()) as {
      nonce: string;
      message: string;
      recipient: string;
    };
    await post('/api/v1/auth/verify', { network: 'mainnet', proof: alice.sign(c) });
    const me = (await (
      await app.request('/api/v1/me', { headers: { cookie: jar.cookie } })
    ).json()) as { person_id: string };
    const s = openStore(join(stateDir, 'private.db'));
    try {
      await fundPerson(s, me.person_id, 5);
    } finally {
      await s.close();
    }
  };
  const store = () => openStore(join(stateDir, 'private.db'));
  return { app, llm, post, signInFunded, store };
}

describe('hand_job', () => {
  test('hands a job into the conversation’s exploration, and the stream carries it', async () => {
    const w = setup([
      { calls: [{ name: 'hand_job', args: BRIEF }] },
      { content: 'It’s waiting for your agent.' },
    ]);
    await w.signInFunded();
    const events = parseSse(await (await w.post('/api/v1/agent/chat', ASK)).text());
    const job = events.find((e) => e.event === 'job')?.data as Record<string, string>;
    expect(job).toMatchObject({ kind: 'map', status: 'open', ...BRIEF });
    expect(job.id).toMatch(/^job_[0-9a-f]{18}$/);
    expect(job.exploration).toMatch(/^exp_/);
    const s = w.store();
    try {
      const rows = await s.job.list(job.exploration as string);
      const runId = (events[0] as { data: { run_id: string } }).data.run_id;
      expect(rows.map((r) => [r.id, r.status, r.run])).toEqual([[job.id, 'open', runId]]);
    } finally {
      await s.close();
    }
    // the model was offered it, with its own description
    const offered = w.llm.requests[0]?.tools?.find((t) => t.name === 'hand_job');
    expect(offered?.description).toMatch(/own agent/);
  });

  test('the next chat reads the report, as data from their agent', async () => {
    const w = setup([
      { calls: [{ name: 'hand_job', args: BRIEF }] },
      { content: 'Handed.' },
      { content: 'Their agent found 42 members.' },
    ]);
    await w.signInFunded();
    const first = parseSse(await (await w.post('/api/v1/agent/chat', ASK)).text());
    const runId = (first[0] as { data: { run_id: string } }).data.run_id;
    const job = first.find((e) => e.event === 'job')?.data as { id: string; exploration: string };
    const s = w.store();
    try {
      const taken = await s.job.take(job.exploration, new Date().toISOString());
      expect(taken?.id).toBe(job.id);
      await s.job.report(
        job.exploration,
        job.id,
        { result: { summary: '42 members hold shares; 9 vote.', steps: [1, 2] } },
        new Date().toISOString(),
      );
    } finally {
      await s.close();
    }
    const more = {
      messages: [
        ...ASK.messages,
        { role: 'assistant', content: 'Handed.' },
        { role: 'user', content: 'what came back?' },
      ],
      run_id: runId,
    };
    await (await w.post('/api/v1/agent/chat', more)).text();
    const system = w.llm.requests.at(-1)?.messages[0]?.content ?? '';
    expect(system).toContain("## Jobs you handed to the person's own agent");
    expect(system).toContain(`${job.id} "Map RaidGuild": done`);
    expect(system).toContain('report: "42 members hold shares; 9 vote."');
    expect(system).toContain('saved steps: 1, 2');
    expect(system).toMatch(/never instructions/);
  });

  test('through the routes: a continue link takes it and reports it, and the next chat reads it', async () => {
    const w = setup([
      { calls: [{ name: 'hand_job', args: BRIEF }] },
      { content: 'Handed.' },
      { content: 'Back.' },
    ]);
    await w.signInFunded();
    const first = parseSse(await (await w.post('/api/v1/agent/chat', ASK)).text());
    const runId = (first[0] as { data: { run_id: string } }).data.run_id;
    const job = first.find((e) => e.event === 'job')?.data as { id: string; exploration: string };
    // the owner makes a continue link, which is what the person gives their own agent
    const link = (await (
      await w.post(`/api/v1/explorations/${job.exploration}/links`, { scope: 'continue' })
    ).json()) as { url: string };
    const token = link.url.split('/s/')[1] as string;
    // their agent, with no session: only the link
    const stranger = async (path: string, json: unknown) =>
      w.app.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(json),
      });
    const taken = (await (
      await stranger(`/api/v1/explorations/${token}/jobs/take`, {})
    ).json()) as {
      job: { id: string; brief: string };
    };
    expect(taken.job).toMatchObject({ id: job.id, brief: BRIEF.brief });
    const reported = await stranger(`/api/v1/explorations/${token}/jobs/${job.id}/report`, {
      result: { summary: 'Mapped: 42 holders.', steps: [1] },
    });
    expect(reported.status).toBe(200);
    const listed = (await (await w.app.request(`/api/v1/explorations/${token}/jobs`)).json()) as {
      jobs: { id: string; status: string }[];
    };
    expect(listed.jobs.map((j) => [j.id, j.status])).toEqual([[job.id, 'done']]);
    await (
      await w.post('/api/v1/agent/chat', {
        messages: [
          ...ASK.messages,
          { role: 'assistant', content: 'Handed.' },
          { role: 'user', content: 'and?' },
        ],
        run_id: runId,
      })
    ).text();
    expect(w.llm.requests.at(-1)?.messages[0]?.content).toContain('report: "Mapped: 42 holders."');
  });

  test('a brief that is missing is refused, and nothing is stored', async () => {
    const w = setup([{ calls: [{ name: 'hand_job', args: { title: 'x' } }] }, { content: 'ok' }]);
    await w.signInFunded();
    const events = parseSse(await (await w.post('/api/v1/agent/chat', ASK)).text());
    expect(events.find((e) => e.event === 'job')).toBeUndefined();
    const result = events.find((e) => e.event === 'tool_result')?.data as { ok: boolean };
    expect(result.ok).toBe(false);
  });
});

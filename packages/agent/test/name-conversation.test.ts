// Conversations are named: Petals' agent names each conversation with name_conversation in
// the same message as its first answer, and renames it when the subject changes, at no model call of its
// own. The person's own agents send a title with add_note. Through petalApp, with a scripted model: no
// NEAR AI is called.
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
const ASK = { messages: [{ role: 'user', content: 'can you map raidguild for me please' }] };

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
  const post = (path: string, json: unknown = {}) => request(path, 'POST', json);
  const signInFunded = async () => {
    const c = (await (await post('/api/v1/auth/challenge')).json()) as {
      nonce: string;
      message: string;
      recipient: string;
    };
    await post('/api/v1/auth/verify', { network: 'mainnet', proof: alice.sign(c) });
    const me = (await (await request('/api/v1/me')).json()) as { person_id: string };
    const s = openStore(join(stateDir, 'private.db'));
    try {
      await fundPerson(s, me.person_id, 5);
    } finally {
      await s.close();
    }
  };
  const titles = async () =>
    (
      (await (await request('/api/v1/conversations')).json()) as {
        conversations: { id: string; title: string }[];
      }
    ).conversations;
  const runOf = async (id: string) => {
    const s = openStore(join(stateDir, 'private.db'));
    try {
      return await s.run.get(id);
    } finally {
      await s.close();
    }
  };
  return { llm, request, post, signInFunded, titles, runOf };
}

const runIdOf = (events: { event: string; data: unknown }[]) =>
  (events[0] as { data: { run_id: string } }).data.run_id;

describe('Petals’ agent names its conversations', () => {
  test('with its first answer: one model call, the name is kept, and the stream says so', async () => {
    const w = setup([
      {
        content: 'RaidGuild has 42 members.',
        calls: [{ name: 'name_conversation', args: { title: 'RaidGuild’s members' } }],
      },
    ]);
    await w.signInFunded();
    const events = parseSse(await (await w.post('/api/v1/agent/chat', ASK)).text());
    // no call bought for the name: the one answer stands
    expect(w.llm.requests).toHaveLength(1);
    expect(events.find((e) => e.event === 'message')?.data).toEqual({
      text: 'RaidGuild has 42 members.',
    });
    expect(events.find((e) => e.event === 'title')?.data).toEqual({
      title: 'RaidGuild’s members',
    });
    expect(events.at(-1)?.event).toBe('done');
    // the model was told it has no name yet, and offered the tool
    const first = w.llm.requests[0];
    expect(first?.messages[0]?.content).toContain('It has no name yet.');
    expect(first?.tools?.some((t) => t.name === 'name_conversation')).toBe(true);
    const runId = runIdOf(events);
    expect((await w.runOf(runId))?.named_at).toBeTruthy();
    expect(await w.titles()).toEqual([
      expect.objectContaining({ id: runId, title: 'RaidGuild’s members' }),
    ]);
  });

  test('the next chat knows the name, and a new subject renames it', async () => {
    const w = setup([
      {
        content: 'RaidGuild has 42 members.',
        calls: [{ name: 'name_conversation', args: { title: 'RaidGuild’s members' } }],
      },
      {
        content: 'Moloch DAO has 80 members.',
        calls: [{ name: 'name_conversation', args: { title: 'Moloch DAO’s members' } }],
      },
    ]);
    await w.signInFunded();
    const runId = runIdOf(parseSse(await (await w.post('/api/v1/agent/chat', ASK)).text()));
    const more = {
      messages: [
        ...ASK.messages,
        { role: 'assistant', content: 'RaidGuild has 42 members.' },
        { role: 'user', content: 'now moloch dao instead' },
      ],
      run_id: runId,
    };
    const events = parseSse(await (await w.post('/api/v1/agent/chat', more)).text());
    expect(w.llm.requests).toHaveLength(2);
    expect(w.llm.requests[1]?.messages[0]?.content).toContain(
      'It\'s called "RaidGuild’s members".',
    );
    expect(events.find((e) => e.event === 'title')?.data).toEqual({
      title: 'Moloch DAO’s members',
    });
    expect((await w.titles())[0]?.title).toBe('Moloch DAO’s members');
  });

  test('a name it gets wrong is refused, the answer still stands, and nothing more is bought', async () => {
    const w = setup([
      {
        content: 'RaidGuild has 42 members.',
        calls: [{ name: 'name_conversation', args: { title: 'x'.repeat(81) } }],
      },
    ]);
    await w.signInFunded();
    const events = parseSse(await (await w.post('/api/v1/agent/chat', ASK)).text());
    expect(w.llm.requests).toHaveLength(1);
    expect(events.find((e) => e.event === 'title')).toBeUndefined();
    const result = events.find((e) => e.event === 'tool_result')?.data as { ok: boolean };
    expect(result.ok).toBe(false);
    // still the first question, so the next chat is told it has no name yet
    const run = await w.runOf(runIdOf(events));
    expect(run?.named_at).toBeNull();
    expect(run?.title).toBe(ASK.messages[0]?.content);
  });

  test('a name with other calls costs nothing extra: the round goes on as it would', async () => {
    const w = setup([
      {
        calls: [
          { name: 'list_networks', args: {} },
          { name: 'name_conversation', args: { title: 'RaidGuild’s members' } },
        ],
      },
      { content: 'RaidGuild has 42 members.' },
    ]);
    await w.signInFunded();
    const events = parseSse(await (await w.post('/api/v1/agent/chat', ASK)).text());
    expect(w.llm.requests).toHaveLength(2);
    expect(events.find((e) => e.event === 'title')?.data).toEqual({
      title: 'RaidGuild’s members',
    });
    expect(events.find((e) => e.event === 'message')?.data).toEqual({
      text: 'RaidGuild has 42 members.',
    });
  });
});

describe("the person's own agents send a title with a note", () => {
  test('add_note names their work in the list, and Petals’ agent carries the name on', async () => {
    const w = setup([{ content: 'Carrying on.' }]);
    await w.signInFunded();
    const started = (await (
      await w.post('/api/v1/explorations', { question: 'A conversation about who holds power' })
    ).json()) as { exploration: string };
    const id = started.exploration;
    expect((await w.titles()).find((c) => c.id === id)?.title).toBe(
      'A conversation about who holds power',
    );
    const noted = await w.post(`/api/v1/explorations/${id}/notes`, {
      text: 'the person asked about RaidGuild; I mapped its members',
      title: 'RaidGuild’s members',
    });
    expect(noted.status).toBe(200);
    expect(((await noted.json()) as { title?: string }).title).toBe('RaidGuild’s members');
    expect((await w.titles()).find((c) => c.id === id)?.title).toBe('RaidGuild’s members');
    // a later note without a title leaves the name alone
    await w.post(`/api/v1/explorations/${id}/notes`, { text: 'and their votes' });
    expect((await w.titles()).find((c) => c.id === id)?.title).toBe('RaidGuild’s members');
    // continued in Petals' chat: the run starts with that name, and the model is told it
    const runId = runIdOf(
      parseSse(
        await (
          await w.post('/api/v1/agent/chat', {
            messages: [{ role: 'user', content: 'go on' }],
            exploration: id,
          })
        ).text(),
      ),
    );
    expect((await w.runOf(runId))?.title).toBe('RaidGuild’s members');
    expect(w.llm.requests[0]?.messages[0]?.content).toContain(
      'It\'s called "RaidGuild’s members".',
    );
  });

  test('a title past 80 characters is refused, and the note is not kept', async () => {
    const w = setup([]);
    await w.signInFunded();
    const { exploration: id } = (await (
      await w.post('/api/v1/explorations', { question: 'Who holds the DAO?' })
    ).json()) as { exploration: string };
    const res = await w.post(`/api/v1/explorations/${id}/notes`, {
      text: 'x',
      title: 'x'.repeat(81),
    });
    expect(res.status).toBe(400);
    expect((await w.titles()).find((c) => c.id === id)?.title).toBe('Who holds the DAO?');
  });
});

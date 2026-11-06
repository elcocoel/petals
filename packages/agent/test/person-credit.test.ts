// T374, T375: a person's own credit, through petalApp. tests/e2e/test1.test.ts does this on the stub, with
// the real client; this is the part of it scripts/check.sh runs.
import { join } from 'node:path';
import { fakeRpcFor, testSigner } from '@petal/near/auth/testing';
import { openStore, type Store } from '@petal/store';
import { describe, expect, test } from 'vitest';
import { buildPetalApp } from '../src/app.ts';
import { DEFAULT_BUDGET } from '../src/index.ts';
import { fundPerson, mintInvite, personCredit } from '../src/invites.ts';
import type { BudgetLedger } from '../src/llm.ts';
import { startRun } from '../src/run.ts';
import { fakeRegistry, parseSse, scriptedLlm, tmpRoot } from './helpers.ts';

const SITE = 'https://petals.example';
const COOKIE = '__Host-petal_session';
const QUESTION = { messages: [{ role: 'user', content: 'who holds the power here?' }] };
const alice = testSigner('alice.near');
const answers = (n: number) => Array.from({ length: n }, () => ({ content: 'an answer' }));

function setup(
  o: {
    costUsd?: number;
    env?: Record<string, string>;
    chatsPerHour?: number;
    followUpsPerHour?: number;
  } = {},
) {
  const root = tmpRoot();
  const stateDir = join(root, 'state');
  const llm = scriptedLlm(answers(30), { costUsd: o.costUsd ?? 0.01 });
  /** What a server does at its start, on the same folder. */
  const build = () =>
    buildPetalApp(
      { root, stateDir, apiBase: SITE, llmDailyUsd: 5 },
      {
        llm,
        rpcFor: () => fakeRpcFor([alice]),
        registry: fakeRegistry().registry,
        ...(o.chatsPerHour ? { chatsPerHour: o.chatsPerHour } : {}),
        ...(o.followUpsPerHour ? { followUpsPerHour: o.followUpsPerHour } : {}),
        env: {
          PETAL_AGENT_ACCESS: 'gated',
          PETAL_WALLET_KEY: 'ab'.repeat(32),
          NODE_ENV: 'test',
          ...o.env,
        },
      },
    );
  const app = build();
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
  const signIn = async () => {
    const c = (await (await post('/api/v1/auth/challenge')).json()) as {
      nonce: string;
      message: string;
      recipient: string;
    };
    await post('/api/v1/auth/verify', { network: 'mainnet', proof: alice.sign(c) });
    const me = (await (
      await app.request('/api/v1/me', { headers: { cookie: jar.cookie } })
    ).json()) as { person_id: string; credit: unknown };
    return me;
  };
  const store = () => openStore(join(stateDir, 'private.db'));
  return { app, llm, post, signIn, store, build };
}

const withStore = <T>(s: Store, f: (s: Store) => T): T => {
  try {
    return f(s);
  } finally {
    s.close();
  }
};

describe('a person’s own credit', () => {
  test('admits them with no invite, and each call spends it', async () => {
    const w = setup();
    const { person_id: person, credit } = await w.signIn();
    expect(credit).toBeNull();
    expect((await w.post('/api/v1/agent/chat', QUESTION)).status).toBe(403);

    withStore(w.store(), (s) => fundPerson(s, person, 5));
    const res = await w.post('/api/v1/agent/chat', QUESTION);
    expect(res.status).toBe(200);
    await res.text();
    const left = withStore(w.store(), (s) => personCredit(s, person));
    expect(left?.funded_usd).toBe(5);
    expect(left?.spent_usd).toBeCloseTo(0.01, 9);
    expect(left?.left_usd).toBeCloseTo(4.99, 9);
  });

  test('stops at its end, with no model call, and says so', async () => {
    const w = setup({ costUsd: 0.02 });
    const { person_id: person } = await w.signIn();
    withStore(w.store(), (s) => fundPerson(s, person, 0.01));
    await (await w.post('/api/v1/agent/chat', QUESTION)).text();
    const calls = w.llm.requests.length;
    expect(calls).toBe(1);
    const res = await w.post('/api/v1/agent/chat', QUESTION);
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('budget_exhausted');
    expect(body.error.message).toMatch(/credit is used up/);
    expect(w.llm.requests.length).toBe(calls);
  });

  test('comes before an invite the session holds, and an invite still pays once it ends', async () => {
    const w = setup({ costUsd: 0.02 });
    const { person_id: person } = await w.signIn();
    const invite = withStore(w.store(), (s) => {
      fundPerson(s, person, 0.01);
      return mintInvite(s, { usd: 1, days: 1 });
    });
    await w.post('/api/v1/auth/invite', { token: invite.token });
    await (await w.post('/api/v1/agent/chat', QUESTION)).text();
    withStore(w.store(), (s) => {
      expect(s.invite.get(invite.id)?.spent_usd).toBe(0);
      expect(personCredit(s, person)?.left_usd).toBe(0);
    });
    await (await w.post('/api/v1/agent/chat', QUESTION)).text();
    withStore(w.store(), (s) => {
      expect(s.invite.get(invite.id)?.spent_usd).toBeCloseTo(0.02, 9);
    });
  });

  describe('the limit on new chats', () => {
    /** A chat, to its end, when it's let in. */
    const chat = async (w: ReturnType<typeof setup>, json: unknown = QUESTION) => {
      const res = await w.post('/api/v1/agent/chat', json);
      const body = await res.text();
      return { status: res.status, body };
    };

    test('doesn’t hold a person on their own credit, and uses up nothing of it', async () => {
      const w = setup({ chatsPerHour: 2 });
      const { person_id: person } = await w.signIn();
      withStore(w.store(), (s) => fundPerson(s, person, 5));
      for (let i = 0; i < 5; i++) expect((await chat(w)).status).toBe(200);
    });

    test('holds an invite, and holds the same person again once their credit ends', async () => {
      const w = setup({ chatsPerHour: 2, costUsd: 0.02 });
      const { person_id: person } = await w.signIn();
      const invite = withStore(w.store(), (s) => {
        fundPerson(s, person, 0.01);
        return mintInvite(s, { usd: 1, days: 1 });
      });
      await w.post('/api/v1/auth/invite', { token: invite.token });
      // On their own credit, which this one call ends: not counted.
      expect((await chat(w)).status).toBe(200);
      // On the invite: the whole allowance is still there, and then it's gone.
      expect((await chat(w)).status).toBe(200);
      expect((await chat(w)).status).toBe(200);
      const third = await chat(w);
      expect(third.status).toBe(429);
      expect(third.body).toContain('rate_limited');
    });

    test('a stranger is refused for want of an invite, as before, and a follow-up on credit still counts', async () => {
      const w = setup({ chatsPerHour: 1, followUpsPerHour: 1 });
      expect((await chat(w)).status).toBe(403);
      const { person_id: person } = await w.signIn();
      withStore(w.store(), (s) => fundPerson(s, person, 5));
      const first = parseSse((await chat(w)).body)[0]?.data as { run_id: string };
      const more = { ...QUESTION, run_id: first.run_id };
      expect((await chat(w, more)).status).toBe(200);
      const over = await chat(w, more);
      expect(over.status).toBe(429);
      expect(over.body).toContain('follow-ups');
    });
  });

  test('a restart counts what was held, as it does for an invite', async () => {
    const w = setup();
    const { person_id: person } = await w.signIn();
    withStore(w.store(), (s) => {
      fundPerson(s, person, 5);
      expect(s.credit.reserve(`person:${person}`, 0.05)).toBe(0.05);
    });
    w.build();
    withStore(w.store(), (s) => {
      expect(s.credit.get(`person:${person}`)?.reserved_usd).toBe(0);
      expect(personCredit(s, person)?.spent_usd).toBeCloseTo(0.05, 9);
      expect(personCredit(s, person)?.left_usd).toBeCloseTo(4.95, 9);
    });
  });
});

describe('what a call holds (T375)', () => {
  /** A ledger that says what it was asked to hold, and never refuses. */
  function spy() {
    const held: number[] = [];
    const ledger: BudgetLedger = {
      spentToday: async () => 0,
      add: async () => {},
      async reserve(usd) {
        held.push(usd);
        return { day: 'today', usd };
      },
      async settle() {},
    };
    return { held, ledger };
  }
  const holdFor = async (usdPerChat: number, model: string) => {
    const { held, ledger } = spy();
    const events = startRun(
      { messages: QUESTION.messages as never },
      {
        tools: {} as never,
        llm: scriptedLlm(answers(1), { model: 'server-default' }),
        budget: { ...DEFAULT_BUDGET, usdPerChat, ledger },
      },
      { registry: [], pick: { model, effort: null } },
    );
    for await (const _ of events) {
      // to the end
    }
    return held[0];
  };

  test('is what a chat on the model is listed at, never the whole of a higher cap', async () => {
    // A call cut off counts at its full hold, so a 50¢ cap mustn't make every Stop cost 50¢.
    expect(await holdFor(0.5, 'z-ai/glm-5.3-flash')).toBe(0.05);
    expect(await holdFor(0.5, 'anthropic/claude-sonnet-5-5')).toBe(0.3);
  });

  test('and an invite’s cap stays what it was, on every model', async () => {
    expect(await holdFor(0.05, 'anthropic/claude-sonnet-5-5')).toBe(0.05);
    expect(await holdFor(0.05, 'z-ai/glm-5.3-flash')).toBe(0.05);
  });

  test('the environment sets the cap, and a typo means the default', async () => {
    const { personUsdPerChat } = await import('../src/llm.ts');
    expect(personUsdPerChat({})).toBe(0.5);
    expect(personUsdPerChat({ PETAL_PERSON_USD_PER_CHAT: '1.25' })).toBe(1.25);
    expect(personUsdPerChat({ PETAL_PERSON_USD_PER_CHAT: 'lots' })).toBe(0.5);
    expect(personUsdPerChat({ PETAL_PERSON_USD_PER_CHAT: '-1' })).toBe(0.5);
    expect(personUsdPerChat({ PETAL_PERSON_USD_PER_CHAT: '0' })).toBe(0.5);
  });
});

// T300, finding 4: spending can't be understated. What a stopped, timed-out or unreported call really
// cost can't be known, so it counts at its full hold, on the invite and on the day's ledger both. A
// restart counts the holds it finds as spent, for the same reason.
import type { AgentEvent } from '@petal/core/types';
import { openStore, type Store } from '@petal/store';
import { describe, expect, test } from 'vitest';
import { storeLedger } from '../../src/budget.ts';
import { inviteLedger, mintInvite } from '../../src/invites.ts';
import { DEFAULT_BUDGET, type LlmClient, type LlmCompletion } from '../../src/llm.ts';
import { createNearAiClient, LlmCallError } from '../../src/near-ai.ts';
import { startRun } from '../../src/run.ts';
import { interruptRuns, sqliteRunStore } from '../../src/runs.ts';
import {
  collect,
  fakeContext,
  fakeNearAi,
  fakeRegistry,
  scriptedLlm,
  tmpRoot,
} from '../helpers.ts';

const QUESTION = [{ role: 'user' as const, content: 'who stands behind it?' }];
const HOLD = DEFAULT_BUDGET.usdPerChat;
const DAY = new Date().toISOString().slice(0, 10);

function invited() {
  const store = openStore(':memory:');
  const { id } = mintInvite(store, { usd: 1 });
  return { store, id, ledger: inviteLedger(store, id, storeLedger(store)) };
}

function chat(
  llm: LlmClient,
  ledger: ReturnType<typeof invited>['ledger'],
  o: { signal?: AbortSignal; wallSeconds?: number } = {},
) {
  return collect(
    startRun(
      { messages: QUESTION },
      {
        tools: fakeContext(),
        llm,
        budget: {
          ...DEFAULT_BUDGET,
          ledger,
          ...(o.wallSeconds ? { wallSeconds: o.wallSeconds } : {}),
        },
      },
      {
        registry: fakeRegistry().registry,
        runId: 'run_harden_1',
        ...(o.signal ? { signal: o.signal } : {}),
      },
    ),
  );
}

function expectFullHold(store: Store, id: string, usd = HOLD) {
  expect(store.ledger.get(DAY).usd).toBeCloseTo(usd, 9);
  expect(store.ledger.get(DAY).reserved_usd).toBe(0);
  const credit = store.credit.get(`invite:${id}`);
  expect(credit?.balance_usd).toBeCloseTo(1 - usd, 9);
  expect(credit?.reserved_usd).toBe(0);
  expect(store.invite.get(id)?.spent_usd).toBeCloseTo(usd, 9);
}

const doneOf = (es: AgentEvent[]) => es.flatMap((e) => (e.event === 'done' ? [e.data] : []))[0];

const until = async (f: () => boolean) => {
  while (!f()) await new Promise((r) => setTimeout(r, 2));
};

describe('a call whose cost is not known counts at its full hold', () => {
  test('Stop: a client that honours the signal and says it cost nothing', async () => {
    const { store, id, ledger } = invited();
    const stop = new AbortController();
    const llm: LlmClient = {
      kind: 'near-ai-cloud',
      model: 'm',
      complete: (_req, o) =>
        new Promise((_ok, no) => {
          const stopped = () => no(new LlmCallError('source_failed', 'stopped'));
          if (o?.signal?.aborted) stopped();
          o?.signal?.addEventListener('abort', stopped);
        }),
    };
    const running = chat(llm, ledger, { signal: stop.signal });
    await until(() => store.ledger.get(DAY).reserved_usd > 0);
    stop.abort();
    const es = await running;
    expectFullHold(store, id);
    expect(doneOf(es)?.cost_usd).toBeCloseTo(HOLD, 9);
  });

  test('a timeout: the chat ends, the hold stands, and the late answer settles at the full hold', async () => {
    const { store, id, ledger } = invited();
    let answer: (c: LlmCompletion) => void = () => {};
    const llm: LlmClient = {
      kind: 'near-ai-cloud',
      model: 'm',
      complete: () =>
        new Promise((ok) => {
          answer = ok;
        }),
    };
    const es = await chat(llm, ledger, { wallSeconds: 0.01 });
    expect(doneOf(es)?.cost_usd).toBeCloseTo(HOLD, 9);
    expect(store.ledger.get(DAY).reserved_usd + store.ledger.get(DAY).usd).toBeCloseTo(HOLD, 9);
    answer({
      model: 'm',
      completion_id: 'late',
      message: { role: 'assistant', content: 'late' },
      usage: { in: 1, out: 1 },
      cost_usd: 0.001,
      fallback_used: false,
      signature: null,
    });
    await until(() => store.ledger.get(DAY).reserved_usd === 0);
    expectFullHold(store, id);
  });

  test('a late answer that cost more than the hold counts at what it cost', async () => {
    const { store, id, ledger } = invited();
    let answer: (c: LlmCompletion) => void = () => {};
    const llm: LlmClient = {
      kind: 'near-ai-cloud',
      model: 'm',
      complete: () =>
        new Promise((ok) => {
          answer = ok;
        }),
    };
    await chat(llm, ledger, { wallSeconds: 0.01 });
    answer({
      model: 'm',
      completion_id: 'late',
      message: { role: 'assistant', content: 'late' },
      usage: { in: 1, out: 1 },
      cost_usd: 0.07,
      fallback_used: false,
      signature: null,
    });
    await until(() => store.ledger.get(DAY).reserved_usd === 0);
    expectFullHold(store, id, 0.07);
  });

  test('a call that says its cost isn’t known', async () => {
    const { store, id, ledger } = invited();
    const inner = scriptedLlm([{ content: 'the answer' }], { costUsd: 0 });
    const llm: LlmClient = {
      kind: 'near-ai-cloud',
      model: 'm',
      complete: async (r) => ({ ...(await inner.complete(r)), cost_unknown: true }),
    };
    await chat(llm, ledger);
    expectFullHold(store, id);
  });

  test('a failure that can’t say what it cost', async () => {
    for (const thrown of [
      new Error('some transport trouble'),
      new LlmCallError('source_failed', 'cut off', { costUnknown: true }),
    ]) {
      const { store, id, ledger } = invited();
      await chat(
        { kind: 'near-ai-cloud', model: 'm', complete: () => Promise.reject(thrown) },
        ledger,
      );
      expectFullHold(store, id);
    }
  });

  test('a failure that does say what it cost still pays only that', async () => {
    const { store, id, ledger } = invited();
    const known = new LlmCallError('source_failed', 'the model broke', { costUsd: 0.002 });
    await chat(
      { kind: 'near-ai-cloud', model: 'm', complete: () => Promise.reject(known) },
      ledger,
    );
    expectFullHold(store, id, 0.002);
  });
});

describe('the NEAR AI client says when it can’t know', () => {
  const client = (f: typeof fetch) =>
    createNearAiClient(
      { apiKeyEnv: 'NEAR_AI_API_KEY', model: 'z-ai/glm-5.3-flash', fallbacks: [] },
      {
        apiKey: 'test',
        fetch: f,
        attestationsDir: tmpRoot(),
        signatureDelaysMs: [],
        stickyFallbackMs: 0,
      },
    );
  const req = { messages: [{ role: 'user' as const, content: 'hi' }] };

  const reshaped = (change: (body: Record<string, unknown>) => void): typeof fetch => {
    const fake = fakeNearAi();
    return async (input, init) => {
      const res = await fake.fetch(input, init);
      const url = String(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      );
      if (!url.endsWith('/chat/completions')) return res;
      const body = (await res.json()) as Record<string, unknown>;
      change(body);
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
  };

  test('usage missing, or half of it, or zero: the answer stands and its cost is unknown', async () => {
    for (const change of [
      (b: Record<string, unknown>) => {
        delete b.usage;
      },
      (b: Record<string, unknown>) => {
        b.usage = { prompt_tokens: 10 };
      },
      (b: Record<string, unknown>) => {
        b.usage = { prompt_tokens: 0, completion_tokens: 0 };
      },
    ]) {
      const c = await client(reshaped(change)).complete(req);
      expect(c.completion_id).toBeTruthy();
      expect(c.cost_unknown).toBe(true);
    }
  });

  test('a real answer with real usage is known', async () => {
    const c = await client(fakeNearAi().fetch).complete(req);
    expect(c.cost_unknown ?? false).toBe(false);
    expect(c.cost_usd).toBeGreaterThan(0);
  });

  test('a transport failure or a timeout has an unknown cost; a refusal by status is known', async () => {
    const drop: typeof fetch = async (input, init) => {
      const url = String(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.endsWith('/chat/completions')) throw new TypeError('socket hang up');
      return fakeNearAi().fetch(input, init);
    };
    await expect(client(drop).complete(req)).rejects.toMatchObject({ costUnknown: true });

    const refuse = fakeNearAi({ fail: { 'z-ai/glm-5.3-flash': 429 } });
    await expect(client(refuse.fetch).complete(req)).rejects.toMatchObject({ costUnknown: false });
    const gateway = fakeNearAi({ fail: { 'z-ai/glm-5.3-flash': 504 } });
    await expect(client(gateway.fetch).complete(req)).rejects.toMatchObject({ costUnknown: true });
  });

  test('Stop mid call: its cost is unknown', async () => {
    const stop = new AbortController();
    const hang: typeof fetch = (input, init) => {
      const url = String(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      );
      if (!url.endsWith('/chat/completions')) return fakeNearAi().fetch(input, init);
      return new Promise((_ok, no) => {
        (init?.signal as AbortSignal | undefined)?.addEventListener('abort', () =>
          no(new DOMException('aborted', 'AbortError')),
        );
      });
    };
    const running = client(hang).complete(req, { signal: stop.signal });
    setTimeout(() => stop.abort(), 20);
    await expect(running).rejects.toMatchObject({ costUnknown: true });
  });
});

describe('a restart', () => {
  test('counts the holds it finds as spent, on the day and on the invite', async () => {
    const store = openStore(':memory:');
    const { id } = mintInvite(store, { usd: 1 });
    const ledger = inviteLedger(store, id, storeLedger(store));
    const hold = await ledger.reserve(0.05, 3);
    expect(hold).not.toBeNull();
    const runs = sqliteRunStore(store);
    await runs.create({ messages: QUESTION });
    const out = interruptRuns(store, () => {});
    expect(out.interrupted).toBe(1);
    expect(out.spentUsd).toBeCloseTo(0.05, 9);
    expectFullHold(store, id);
    expect(store.credit.entries(`invite:${id}`).at(-1)).toMatchObject({ delta_usd: -0.05 });
  });
});

describe('tool calls in one round', () => {
  test('past the cap they aren’t run, but each still gets an answer in the thread', async () => {
    const tools = fakeRegistry();
    const calls = Array.from({ length: 30 }, () => ({
      name: 'get_snapshot',
      args: { network: 'x' },
    }));
    const llm = scriptedLlm([{ calls }, { content: 'done' }]);
    const es = await collect(
      startRun(
        { messages: QUESTION },
        { tools: fakeContext(), llm, budget: DEFAULT_BUDGET },
        { registry: tools.registry, runId: 'run_harden_2' },
      ),
    );
    expect(tools.calls.filter((c) => c.name === 'get_snapshot')).toHaveLength(8);
    const next = llm.requests[1]?.messages.filter((m) => m.role === 'tool') ?? [];
    expect(next).toHaveLength(30);
    expect(next.at(-1)?.content).toMatch(/rate_limited/);
    expect(es.some((e) => e.event === 'done')).toBe(true);
  });
});

describe('an invite', () => {
  test('minted without days has a default expiry of 14 days', () => {
    const store = openStore(':memory:');
    const now = new Date('2026-11-06T00:00:00.000Z');
    const made = mintInvite(store, { usd: 1, now });
    expect(made.expires_at).toBe('2026-11-20T00:00:00.000Z');
    expect(store.invite.get(made.id)?.expires_at).toBe('2026-11-20T00:00:00.000Z');
  });
});

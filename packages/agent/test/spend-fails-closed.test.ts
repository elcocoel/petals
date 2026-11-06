// T189, SYS-004: a failure to read or write the spend ledger stops spending. The cap is the ledger;
// a chat that can't reach it buys no more model calls, and says so in plain words.
import { join } from 'node:path';
import type { AgentEvent } from '@petal/core/types';
import { openStore } from '@petal/store';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { memoryLedger, storeLedger } from '../src/budget.ts';
import { type Budget, DEFAULT_BUDGET, type LlmClient, type LlmCompletion } from '../src/llm.ts';
import { LlmCallError } from '../src/near-ai.ts';
import { HAND_TRANSCRIPT, recordedClient } from '../src/recorded.ts';
import { createAgentRoutes } from '../src/routes.ts';
import { LEDGER_DOWN, SKILL_HINT, startRun } from '../src/run.ts';
import { fileRunStore } from '../src/runs.ts';
import {
  collect,
  fakeContext,
  fakeRegistry,
  parseSse,
  scriptedLlm,
  slowRecorded,
  tmpRoot,
} from './helpers.ts';

const QUESTION = [{ role: 'user' as const, content: 'who stands behind NEAR’s validators?' }];
const boom = () => Promise.reject(new Error('disk I/O error'));
type Ledger = NonNullable<Budget['ledger']>;

/** A store that is down: nothing can be read or written. */
const downLedger: Ledger = { spentToday: boom, add: boom, reserve: boom, settle: boom };

function chat(llm: LlmClient, ledger: Ledger, budget: Partial<Budget> = {}) {
  return collect(
    startRun(
      { messages: QUESTION },
      { tools: fakeContext(), llm, budget: { ...DEFAULT_BUDGET, ledger, ...budget } },
      { registry: fakeRegistry().registry, runId: 'run_test_1' },
    ),
  );
}

const errors = (es: AgentEvent[]) => es.flatMap((e) => (e.event === 'error' ? [e.data] : []));
const names = (es: AgentEvent[]) => es.map((e) => e.event);

/** A tool round, so a healthy chat would go on to buy a second answer. */
const twoRounds = (o: { delayMs?: number } = {}) =>
  scriptedLlm([{ calls: [{ name: 'list_networks', args: {} }] }, { content: 'second answer' }], {
    costUsd: 0.01,
    ...o,
  });

describe('the ledger fails closed', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('down when a chat starts: no model call, one plain error, then done', async () => {
    const llm = twoRounds();
    const es = await chat(llm, downLedger);
    expect(llm.requests).toHaveLength(0);
    // the operator gets the cause; the person gets the plain words
    expect(vi.mocked(console.error).mock.calls.flat().join()).toMatch(/disk I\/O error/);
    expect(names(es)).toEqual(['run', 'stage', 'error', 'done']);
    expect(errors(es)).toEqual([{ code: 'internal', message: LEDGER_DOWN, hint: SKILL_HINT }]);
    expect(JSON.stringify(es)).not.toMatch(/disk I\/O/);
    expect(es.at(-1)).toMatchObject({ event: 'done', data: { turns: 0, cost_usd: 0 } });
  });

  test('a real store, really closed: the same', async () => {
    const store = openStore(join(tmpRoot(), 'private.db'));
    store.close();
    const llm = twoRounds();
    const es = await chat(llm, storeLedger(store));
    expect(llm.requests).toHaveLength(0);
    expect(errors(es)[0]?.message).toBe(LEDGER_DOWN);
  });

  test('the store dies during a model call: that answer is shown, and nothing more is bought', async () => {
    const store = openStore(join(tmpRoot(), 'private.db'));
    const inner = scriptedLlm(
      [
        { content: 'first answer', calls: [{ name: 'list_networks', args: {} }] },
        { content: 'second answer' },
      ],
      { costUsd: 0.01 },
    );
    const llm: LlmClient = {
      kind: inner.kind,
      model: inner.model,
      async complete(req): Promise<LlmCompletion> {
        const out = await inner.complete(req);
        store.close();
        return out;
      },
    };
    const es = await chat(llm, storeLedger(store));
    expect(inner.requests).toHaveLength(1);
    expect(es.filter((e) => e.event === 'message')).toEqual([
      { event: 'message', data: { text: 'first answer' } },
    ]);
    expect(names(es)).not.toContain('tool_call');
    expect(errors(es).map((e) => e.message)).toEqual([LEDGER_DOWN]);
    expect(es.at(-1)?.event).toBe('done');
  });

  test('settling fails once, then the store is back: the chat still stops, and the hold stands', async () => {
    const real = memoryLedger();
    let failures = 1;
    const ledger: Ledger = {
      ...real,
      settle: (hold, usd) => (failures-- > 0 ? boom() : real.settle(hold, usd)),
    };
    const llm = twoRounds();
    const es = await chat(llm, ledger);
    expect(llm.requests).toHaveLength(1);
    expect(errors(es).map((e) => e.message)).toEqual([LEDGER_DOWN]);
    // what the call cost was never written, so the hold keeps counting against the cap
    expect(await real.spentToday()).toBeCloseTo(DEFAULT_BUDGET.usdPerChat, 9);
  });

  test('the ledger fails on the second round: one model call, no second', async () => {
    const real = memoryLedger();
    let calls = 0;
    const ledger: Ledger = {
      ...real,
      reserve: (usd, cap) => (calls++ === 0 ? real.reserve(usd, cap) : boom()),
    };
    const llm = twoRounds();
    const es = await chat(llm, ledger);
    expect(llm.requests).toHaveLength(1);
    expect(errors(es).map((e) => e.message)).toEqual([LEDGER_DOWN]);
    expect(await real.spentToday()).toBeCloseTo(0.01, 9);
  });

  test('a recorded run spends nothing, so a ledger that is down does not touch it', async () => {
    const es = await chat(recordedClient(HAND_TRANSCRIPT), downLedger);
    expect(errors(es)).toEqual([]);
    expect(names(es)).toContain('flower');
  });
});

describe('reserve then settle', () => {
  test('a chat ends with nothing held, and the total is what it cost', async () => {
    const ledger = memoryLedger();
    const es = await chat(twoRounds(), ledger);
    expect(errors(es)).toEqual([]);
    expect(await ledger.spentToday()).toBeCloseTo(0.02, 9);
  });

  test('chats at once can not buy past the cap, which a check before each call could', async () => {
    const ledger = memoryLedger();
    const llm = scriptedLlm(
      Array.from({ length: 5 }, () => ({ content: 'an answer' })),
      { costUsd: 0.05, delayMs: 5 },
    );
    const all = await Promise.all(
      Array.from({ length: 5 }, () => chat(llm, ledger, { usdPerDay: 0.05 })),
    );
    expect(llm.requests).toHaveLength(1);
    const codes = all.flatMap(errors).map((e) => e.code);
    expect(codes).toEqual(Array(4).fill('budget_exhausted'));
    expect(await ledger.spentToday()).toBeCloseTo(0.05, 9);
  });

  test('a failed call gives its hold back, and pays only what it cost', async () => {
    const ledger = memoryLedger();
    const paid: LlmClient = {
      kind: 'near-ai-cloud',
      model: 'm',
      complete: () =>
        Promise.reject(new LlmCallError('source_failed', 'the model broke', { costUsd: 0.002 })),
    };
    await chat(paid, ledger);
    expect(await ledger.spentToday()).toBeCloseTo(0.002, 9);

    const free = memoryLedger();
    const throws: LlmClient = {
      kind: 'near-ai-cloud',
      model: 'm',
      complete: () => {
        throw new Error('not even a promise');
      },
    };
    const es = await chat(throws, free);
    expect(errors(es)[0]?.code).toBe('source_failed');
    expect(await free.spentToday()).toBe(0);
  });

  test('a call that runs out of time keeps its hold, and a late answer settles at that hold', async () => {
    const ledger = memoryLedger();
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
    expect(errors(es)[0]?.message).toMatch(/ran past/);
    expect(await ledger.spentToday()).toBeCloseTo(DEFAULT_BUDGET.usdPerChat, 9);
    answer({
      model: 'm',
      completion_id: 'late',
      message: { role: 'assistant', content: 'late' },
      usage: { in: 1, out: 1 },
      cost_usd: 0.003,
      fallback_used: false,
      signature: null,
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(await ledger.spentToday()).toBeCloseTo(DEFAULT_BUDGET.usdPerChat, 9);
  });

  test('a viewer who stops reading does not leave a hold behind', async () => {
    const ledger = memoryLedger();
    const inner = slowRecorded(5);
    const llm: LlmClient = {
      ...inner,
      kind: 'near-ai-cloud',
      complete: inner.complete.bind(inner),
    };
    const events = startRun(
      { messages: QUESTION },
      { tools: fakeContext(), llm, budget: { ...DEFAULT_BUDGET, ledger } },
      { registry: fakeRegistry().registry, runId: 'run_test_1' },
    );
    for await (const e of events) if (e.event === 'stage') break;
    await new Promise((r) => setTimeout(r, 30));
    expect(await ledger.spentToday()).toBe(0);
  });
});

test('an exhausted cap, through the routes: one error, not a crash on top of it', async () => {
  const root = tmpRoot();
  const exhausted = memoryLedger();
  await exhausted.add(3);
  const llm = twoRounds();
  const app = createAgentRoutes(
    {
      tools: fakeContext(root),
      llm,
      budget: { ...DEFAULT_BUDGET, ledger: exhausted },
      runs: fileRunStore(join(root, 'runs')),
    },
    { registry: fakeRegistry().registry },
  );
  const res = await app.request('/api/v1/agent/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: QUESTION }),
  });
  const es = parseSse(await res.text());
  expect(llm.requests).toHaveLength(0);
  expect(
    es.filter((e) => e.event === 'error').map((e) => (e.data as { code: string }).code),
  ).toEqual(['budget_exhausted']);
});

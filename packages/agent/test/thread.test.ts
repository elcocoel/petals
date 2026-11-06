// T166: what the model receives on a follow-up. It must keep the tool calls and results of the
// earlier chats of the run, not only their prose.
import { join } from 'node:path';
import type { Run } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { DEFAULT_BUDGET, type LlmClient, type LlmMessage } from '../src/llm.ts';
import { contextWindow, DEFAULT_MODEL } from '../src/near-ai.ts';
import { HAND_TRANSCRIPT, recordedClient } from '../src/recorded.ts';
import { createAgentRoutes } from '../src/routes.ts';
import { startRun } from '../src/run.ts';
import { fileRunStore } from '../src/runs.ts';
import {
  COMPACT_AT,
  COMPACT_TO,
  closeThread,
  compactionChars,
  compactThread,
} from '../src/thread.ts';
import {
  collect,
  fakeContext,
  fakeRegistry,
  INTERPRETATION,
  parseSse,
  runIdOf,
  SHA,
  SPEC_SHA,
  type SseEvent,
  scriptedLlm,
  tmpRoot,
  tool,
  VIEW_URL,
} from './helpers.ts';

function setup(llm: LlmClient) {
  const root = tmpRoot();
  const tools = fakeRegistry();
  const runs = fileRunStore(join(root, '.petal', 'runs'));
  const app = createAgentRoutes(
    { tools: fakeContext(root), llm, budget: DEFAULT_BUDGET, runs },
    { registry: tools.registry },
  );
  return { app, tools, runs };
}

async function say(app: ReturnType<typeof setup>['app'], content: string, run_id?: string) {
  const res = await app.request('/api/v1/agent/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9' },
    body: JSON.stringify({
      messages: [{ role: 'user', content }],
      ...(run_id ? { run_id } : {}),
    }),
  });
  const events = parseSse(await res.text());
  return { events, runId: runIdOf(events) };
}

const named = (es: SseEvent[], name: string) => es.filter((e) => e.event === name);
const first = <T>(es: SseEvent[], name: string) => named(es, name)[0]?.data as T;
/** On a real model a flower takes a question, the agent asking about it, and a yes (approval.ts). */
const ASKING = { content: 'I can read that. Shall I draw it? Yes or no.' };
async function agreeAndDraw(app: ReturnType<typeof setup>['app'], content: string) {
  const one = await say(app, content);
  await say(app, 'yes', one.runId);
  return one;
}
const FLOWER_TURNS = [
  { content: 'Looking.', calls: [{ name: 'get_snapshot', args: { network: 'near-validators' } }] },
  { calls: [{ name: 'describe_snapshot', args: { sha256: SHA } }] },
  { calls: [{ name: 'propose_spec', args: { network: 'near-validators', sha256: SHA } }] },
  { calls: [{ name: 'validate_spec', args: { spec: SPEC_SHA, interpretation: INTERPRETATION } }] },
  { calls: [{ name: 'render_flower', args: { spec: SPEC_SHA } }] },
  { content: `**Flower**: /draft?flower=${SPEC_SHA.slice(0, 8)}` },
];

describe('a follow-up keeps the thread', () => {
  test('the model receives the earlier tool calls and results, then the new question', async () => {
    const llm = scriptedLlm([ASKING, ...FLOWER_TURNS, { content: 'A is the largest.' }]);
    const { app } = setup(llm);
    const one = await agreeAndDraw(app, 'who stands behind the validators?');
    const two = await say(app, 'who is the largest one?', one.runId);
    expect(two.runId).toBe(one.runId);

    const asked = llm.requests.at(-1)?.messages as LlmMessage[];
    expect(asked.map((m) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
      ...Array.from({ length: 5 }, () => ['assistant', 'tool']).flat(),
      'assistant',
      'user',
    ]);
    // the tool result that holds the answer
    const described = asked.find(
      (m) => m.role === 'tool' && m.content.includes('a.poolv1.near'),
    ) as LlmMessage;
    expect(described).toBeDefined();
    expect(asked.at(-1)).toEqual({ role: 'user', content: 'who is the largest one?' });
    // the model's own short link, not 2 KB of base64 on every later call
    expect(asked.at(-2)?.content).toBe(`**Flower**: /draft?flower=${SPEC_SHA.slice(0, 8)}`);
    expect(asked[0]?.content).toContain('This is a follow-up');
    expect(asked[0]?.content).toContain(`spec_sha256 ${SPEC_SHA}`);
    expect(asked[0]?.content).toContain(`link /draft?flower=${SPEC_SHA.slice(0, 8)}`);
    // a first chat is not told it is a follow-up
    expect(llm.requests[0]?.messages[0]?.content).not.toContain('This is a follow-up');
    expect(named(two.events, 'tool_call')).toHaveLength(0);
  });

  test('a change goes straight to propose_spec, and the earlier spec can still be named', async () => {
    const llm = scriptedLlm([
      ASKING,
      ...FLOWER_TURNS,
      {
        calls: [
          {
            name: 'propose_spec',
            args: {
              network: 'near-validators',
              sha256: SHA,
              variation_of: SPEC_SHA,
              choices: { petals: 10 },
            },
          },
        ],
      },
      {
        calls: [
          { name: 'validate_spec', args: { spec: SPEC_SHA, interpretation: INTERPRETATION } },
        ],
      },
      { calls: [{ name: 'render_flower', args: { spec: SPEC_SHA } }] },
      { content: `Top ten: /draft?flower=${SPEC_SHA.slice(0, 8)}` },
    ]);
    const { app, tools } = setup(llm);
    const one = await agreeAndDraw(app, 'who stands behind the validators?');
    const before = tools.calls.length;
    const two = await say(app, 'what about the top ten only?', one.runId);
    expect(tools.calls.slice(before).map((c) => c.name)).toEqual([
      'propose_spec',
      'validate_spec',
      'render_flower',
    ]);
    // the model names the parent; the loop hands the tool the spec it stands for
    expect(tools.calls[before]?.args).toMatchObject({
      choices: { petals: 10 },
      variation_of: SPEC_SHA,
      parent: expect.objectContaining({ petal: 'spec/v1' }),
    });
    expect(named(two.events, 'error')).toHaveLength(0);
    expect(named(two.events, 'flower')).toHaveLength(1);
    expect(JSON.stringify(named(two.events, 'message'))).toContain(VIEW_URL);
  });

  test('redrawing an earlier flower needs no second validate_spec', async () => {
    const llm = scriptedLlm([
      ASKING,
      ...FLOWER_TURNS,
      { calls: [{ name: 'render_flower', args: { spec: SPEC_SHA } }] },
      { content: 'Here it is again.' },
    ]);
    const { app } = setup(llm);
    const one = await agreeAndDraw(app, 'a flower');
    const two = await say(app, 'show it again', one.runId);
    expect(named(two.events, 'error')).toHaveLength(0);
    expect(named(two.events, 'flower')).toHaveLength(1);
  });

  test('the stored run stays what the API promised: no thread in its JSON', async () => {
    const llm = scriptedLlm([ASKING, ...FLOWER_TURNS, { content: 'A.' }]);
    const { app, runs } = setup(llm);
    const one = await agreeAndDraw(app, 'a flower');
    await say(app, 'which one?', one.runId);
    const res = await app.request(`/api/v1/agent/runs/${one.runId}`);
    const run = (await res.json()) as Run;
    expect(run).not.toHaveProperty('thread');
    expect(run.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
      'assistant',
      'user',
      'assistant',
    ]);
    expect((await runs.thread?.(one.runId))?.some((m) => m.role === 'tool')).toBe(true);
  });

  test('a run from before threads continues from its prose', async () => {
    const llm = scriptedLlm([{ content: 'first' }, { content: 'second' }]);
    const { app, runs } = setup(llm);
    const one = await say(app, 'q1');
    (runs as { thread?: unknown }).thread = async () => null;
    await say(app, 'q2', one.runId);
    expect(llm.requests[1]?.messages.slice(1)).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'first' },
      { role: 'user', content: 'q2' },
    ]);
  });

  test('a recorded run does not crash on a follow-up: it replays, and says so', async () => {
    const { app } = setup(recordedClient(HAND_TRANSCRIPT));
    const one = await say(app, 'q1');
    const two = await say(app, 'q2', one.runId);
    expect(named(two.events, 'error')).toHaveLength(0);
    expect(named(two.events, 'flower')).toHaveLength(1);
    expect(first<{ stage: string }>(two.events, 'stage').stage).toBe('recorded');
    expect(first<{ model: string }>(two.events, 'done').model).toBe('recorded');
  });

  test('follow-ups have their own wider limit: a conversation is many messages', async () => {
    const llm = scriptedLlm(Array.from({ length: 30 }, () => ({ content: 'hi' })));
    const { app } = setup(llm);
    const { runId } = await say(app, 'q');
    for (let i = 0; i < 12; i++) {
      expect((await say(app, `more ${i}`, runId)).runId).toBe(runId);
    }
  });
});

describe('closeThread', () => {
  test('a call left open gets an answer, or the model API would refuse the next chat', () => {
    const open: LlmMessage[] = [
      { role: 'user', content: 'q' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'a', name: 'x', arguments: '{}' },
          { id: 'b', name: 'y', arguments: '{}' },
        ],
      },
      { role: 'tool', tool_call_id: 'a', content: '{}' },
    ];
    const closed = closeThread(open);
    expect(closed.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'tool']);
    expect(closed[3]).toMatchObject({ tool_call_id: 'b' });
    expect(closed[3]?.content).toContain('did not finish');
  });
});

describe('compactThread', () => {
  const exchange = (q: string, size: number): LlmMessage[] => [
    { role: 'user', content: q },
    {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: `${q}1`, name: 'describe_snapshot', arguments: '{}' }],
    },
    { role: 'tool', tool_call_id: `${q}1`, content: 'x'.repeat(size) },
    { role: 'assistant', content: `answer ${q}` },
  ];
  const size = (t: LlmMessage[]) => t.reduce((n, m) => n + JSON.stringify(m).length, 0);
  const tools = (t: LlmMessage[]) => t.filter((m) => m.role === 'tool').length;

  test('under the limit it is the same thread, so the prefix a cache holds stays put', () => {
    const t = exchange('a', 100);
    expect(compactThread(t, 1000)).toBe(t);
  });

  test('over it, the oldest lose their tool detail, never the question or the answer', () => {
    const t = [
      ...exchange('a', 1000),
      ...exchange('b', 100),
      ...exchange('c', 100),
      { role: 'user' as const, content: 'now?' },
    ];
    const out = compactThread(t, 1300);
    expect(out.slice(0, 2)).toEqual([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'answer a' },
    ]);
    // what fits is left alone, and the last two exchanges always are
    expect(tools(out)).toBe(2);
    expect(out.at(-1)).toEqual({ role: 'user', content: 'now?' });
  });

  test('it goes well below where it started, so it stays a rare event', () => {
    const t = [...Array(10).keys()].flatMap((i) => exchange(`q${i}`, 1000));
    const max = size(t) - 10;
    const out = compactThread(t, max);
    expect(size(out)).toBeLessThanOrEqual(max * (COMPACT_TO / COMPACT_AT));
    expect(compactThread(out, max)).toBe(out);
  });

  test('the last two keep their tools, even when they alone are too long', () => {
    const t = [...exchange('a', 5000), { role: 'user' as const, content: 'now?' }];
    expect(compactThread(t, 100)).toEqual(t);
  });

  test('the limit is 80% of the window in characters, less what the system and tools take', () => {
    expect(compactionChars(1_000_000)).toBe(2_800_000);
    expect(compactionChars(1_000_000, 40_000)).toBe(2_760_000);
    expect(compactionChars(10, 1000)).toBe(0);
  });

  test('a five-flower conversation is nowhere near a million tokens, so nothing is cut', () => {
    const t = [...Array(40).keys()].flatMap((i) => exchange(`q${i}`, 30_000));
    expect(compactThread(t, compactionChars(contextWindow(DEFAULT_MODEL)))).toBe(t);
  });

  test.each([
    [DEFAULT_MODEL, 1_000_000],
    ['z-ai/glm-5.3-flash', 1_000_000],
    ['Qwen/Qwen3.8-27B', 262_000],
    ['anthropic/claude-sonnet-5-5', 1_000_000],
    ['someone/unlisted', 128_000],
  ])('the window of %s is %d', (model, tokens) => {
    expect(contextWindow(model)).toBe(tokens);
  });
});

describe('in a run', () => {
  const READ = { name: 'list_flowers', args: {} };
  const long = 'x'.repeat(20_000);
  const big = fakeRegistry();
  big.registry.unshift(tool('list_flowers', () => ({ flowers: [], note: long })));

  /** One chat: what the model was sent, and what is saved for the next. */
  async function chat(thread: LlmMessage[], said: string, windowTokens: number) {
    const llm = scriptedLlm([{ calls: [READ] }, { content: `answered ${said}` }]);
    let kept: LlmMessage[] = [];
    await collect(
      startRun(
        { messages: [], thread: [...thread, { role: 'user', content: said }] },
        { tools: fakeContext(), llm, budget: DEFAULT_BUDGET },
        {
          registry: big.registry,
          windowTokens,
          onThread: (t) => {
            kept = t;
          },
        },
      ),
    );
    return { llm, kept };
  }
  const toolsIn = (ms: LlmMessage[] | undefined) =>
    (ms ?? []).filter((m) => m.role === 'tool').length;

  test('a wide window keeps every tool result of every chat', async () => {
    let t: LlmMessage[] = [];
    for (const said of ['a', 'b', 'c', 'd', 'e', 'f']) t = (await chat(t, said, 1_000_000)).kept;
    expect(toolsIn(t)).toBe(6);
  });

  test('near the window the oldest lose theirs, words stay, and what is saved is what was sent', async () => {
    // about 45 KB of system and tools, then 20 KB a chat: this window holds about 5 of them
    const windowTokens = 50_000;
    let t: LlmMessage[] = [];
    let last: Awaited<ReturnType<typeof chat>> | undefined;
    const seen: number[] = [];
    for (const said of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']) {
      last = await chat(t, said, windowTokens);
      t = last.kept;
      seen.push(toolsIn(t));
    }
    expect(Math.max(...seen)).toBeGreaterThan(Math.min(...seen.slice(-3)));
    expect(toolsIn(t)).toBeGreaterThanOrEqual(2);
    expect(toolsIn(t)).toBeLessThan(10);
    // every question and every answer is still there
    for (const said of ['a', 'e', 'j']) {
      expect(t.some((m) => m.role === 'user' && m.content === said)).toBe(true);
      expect(t.some((m) => m.role === 'assistant' && m.content === `answered ${said}`)).toBe(true);
    }
    // nothing left open for a model's API to refuse
    expect(closeThread(t)).toEqual(t);
    expect(toolsIn(last?.llm.requests.at(-1)?.messages)).toBe(toolsIn(t));
  });

  test('a recorded run is never compacted: it reads no thread', async () => {
    const said = 'who stands behind the validators?';
    const llm = recordedClient(HAND_TRANSCRIPT);
    const es = await collect(
      startRun(
        { messages: [{ role: 'user', content: said }] },
        { tools: fakeContext(), llm, budget: DEFAULT_BUDGET },
        { registry: fakeRegistry().registry, windowTokens: 1 },
      ),
    );
    expect(es.at(-1)?.event).toBe('done');
  });
});

describe('the chat cap, unchanged (5¢)', () => {
  const TO_FLOWER = [
    { calls: [{ name: 'get_snapshot', args: { network: 'near-validators' } }] },
    { calls: [{ name: 'describe_snapshot', args: { sha256: SHA } }] },
    { calls: [{ name: 'propose_spec', args: { network: 'near-validators', sha256: SHA } }] },
    {
      calls: [{ name: 'validate_spec', args: { spec: SPEC_SHA, interpretation: INTERPRETATION } }],
    },
    { calls: [{ name: 'render_flower', args: { spec: SPEC_SHA } }] },
    { content: 'Here it is.' },
  ];

  test('mid-flower: it stops after the round, says why, and the next message picks it up', async () => {
    // each call costs 2¢: the third goes past the 5¢, before it gets to draw
    const tools = fakeRegistry();
    let thread: LlmMessage[] = [];
    const first = scriptedLlm(TO_FLOWER, { costUsd: 0.02 });
    const said = "Draw me a flower of NEAR's validators.";
    const es = await collect(
      startRun(
        { messages: [{ role: 'user', content: said }] },
        { tools: fakeContext(), llm: first, budget: DEFAULT_BUDGET },
        {
          registry: tools.registry,
          onThread: (t) => {
            thread = t;
          },
        },
      ),
    );
    expect(first.requests).toHaveLength(3);
    expect(es.filter((e) => e.event === 'flower')).toEqual([]);
    expect(es.find((e) => e.event === 'error')?.data).toMatchObject({
      code: 'budget_exhausted',
      message: 'The chat used its $0.05 budget.',
      hint: expect.stringMatching(/Bring your own agent/),
    });
    expect(es.at(-1)?.event).toBe('done');
    expect(es.filter((e) => e.event === 'message')).toEqual([]);
    // the work so far is kept, and nothing is left open
    expect(closeThread(thread)).toEqual(thread);
    expect(tools.calls.map((c) => c.name)).toEqual([
      'get_snapshot',
      'describe_snapshot',
      'propose_spec',
    ]);

    // the next message is a new chat with its own 5¢, on the same thread
    const next = scriptedLlm(TO_FLOWER.slice(3), { costUsd: 0.01 });
    const more = await collect(
      startRun(
        {
          messages: [{ role: 'user', content: 'go on' }],
          thread: [...thread, { role: 'user', content: 'go on' }],
        },
        { tools: fakeContext(), llm: next, budget: DEFAULT_BUDGET },
        { registry: tools.registry },
      ),
    );
    expect(more.some((e) => e.event === 'flower')).toBe(true);
    expect(more.some((e) => e.event === 'error')).toBe(false);
  });

  test('no message reaches the person until then: only the stop', async () => {
    const llm = scriptedLlm(
      [
        { content: 'Reading it.', calls: [{ name: 'list_flowers', args: {} }] },
        { content: 'Answered.' },
      ],
      { costUsd: 0.06 },
    );
    const es = await collect(
      startRun(
        { messages: [{ role: 'user', content: 'which one?' }] },
        { tools: fakeContext(), llm, budget: DEFAULT_BUDGET },
        { registry: fakeRegistry().registry },
      ),
    );
    expect(llm.requests).toHaveLength(1);
    expect(es.filter((e) => e.event === 'message').map((e) => e.data)).toEqual([
      { text: 'Reading it.' },
    ]);
    expect(es.find((e) => e.event === 'error')?.data).toMatchObject({ code: 'budget_exhausted' });
  });
});

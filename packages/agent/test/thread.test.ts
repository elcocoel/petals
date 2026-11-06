// T166: what the model receives on a follow-up. It must keep the tool calls and results of the
// earlier chats of the run, not only their prose.
import { join } from 'node:path';
import type { Run } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { DEFAULT_BUDGET, type LlmClient, type LlmMessage } from '../src/llm.ts';
import { HAND_TRANSCRIPT, recordedClient } from '../src/recorded.ts';
import { createAgentRoutes } from '../src/routes.ts';
import { fileRunStore } from '../src/runs.ts';
import { closeThread, THREAD_MAX_CHARS, trimThread } from '../src/thread.ts';
import {
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
    const llm = scriptedLlm([...FLOWER_TURNS, { content: 'A is the largest.' }]);
    const { app } = setup(llm);
    const one = await say(app, 'who stands behind the validators?');
    const two = await say(app, 'who is the largest one?', one.runId);
    expect(two.runId).toBe(one.runId);

    const asked = llm.requests.at(-1)?.messages as LlmMessage[];
    expect(asked.map((m) => m.role)).toEqual([
      'system',
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
    const one = await say(app, 'who stands behind the validators?');
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
      ...FLOWER_TURNS,
      { calls: [{ name: 'render_flower', args: { spec: SPEC_SHA } }] },
      { content: 'Here it is again.' },
    ]);
    const { app } = setup(llm);
    const one = await say(app, 'a flower');
    const two = await say(app, 'show it again', one.runId);
    expect(named(two.events, 'error')).toHaveLength(0);
    expect(named(two.events, 'flower')).toHaveLength(1);
  });

  test('the stored run stays what the API promised: no thread in its JSON', async () => {
    const llm = scriptedLlm([...FLOWER_TURNS, { content: 'A.' }]);
    const { app, runs } = setup(llm);
    const one = await say(app, 'a flower');
    await say(app, 'which one?', one.runId);
    const res = await app.request(`/api/v1/agent/runs/${one.runId}`);
    const run = (await res.json()) as Run;
    expect(run).not.toHaveProperty('thread');
    expect(run.messages.map((m) => m.role)).toEqual([
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

describe('trimThread', () => {
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

  test('under the limit nothing changes', () => {
    const t = exchange('a', 100);
    expect(trimThread(t)).toEqual(t);
  });

  test('over it, the oldest lose their tool detail, never the question or the answer', () => {
    const t = [
      ...exchange('a', THREAD_MAX_CHARS),
      ...exchange('b', 100),
      ...exchange('c', 100),
      { role: 'user' as const, content: 'now?' },
    ];
    const out = trimThread(t);
    expect(out.slice(0, 2)).toEqual([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'answer a' },
    ]);
    // what fits is left alone, and the last two exchanges always are
    expect(out.filter((m) => m.role === 'tool')).toHaveLength(2);
    expect(out.at(-1)).toEqual({ role: 'user', content: 'now?' });
  });

  test('the last exchange keeps its tools even when it alone is too long', () => {
    const t = [...exchange('a', THREAD_MAX_CHARS * 2), { role: 'user' as const, content: 'now?' }];
    expect(trimThread(t)).toEqual(t);
  });
});

// T166: a reload shows the same conversation a live chat showed.
import type { AgentEvent, FlowerResult, ModelSignature } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { blocksOf, fold, type Item, threadFromRun } from '../lib/thread.ts';

const run: AgentEvent = { event: 'run', data: { run_id: 'r1', resume_url: '/make?run=r1' } };
const say = (text: string): AgentEvent => ({ event: 'message', data: { text } });
const done = (signature?: ModelSignature | null): AgentEvent => ({
  event: 'done',
  data: {
    turns: 1,
    model: 'm',
    fallback_used: false,
    tokens: { in: 1, out: 1 },
    cost_usd: 0,
    ...(signature === undefined ? {} : { signature }),
  },
});
const flower = { spec_sha256: 'a'.repeat(64), view_url: '/draft?spec=x' } as FlowerResult;
const sig = { model: 'm', signature_kind: 'provider_tee' } as ModelSignature;
const user = (content: string) => ({ role: 'user' as const, content });
const assistant = (content: string) => ({ role: 'assistant' as const, content });
const said = (items: Item[]) =>
  items.flatMap((x) => (x.kind === 'user' || x.kind === 'message' ? [`${x.kind}:${x.text}`] : []));

describe('threadFromRun', () => {
  test('each question sits before its own answers, in a run of two chats', () => {
    const items = threadFromRun({
      messages: [user('q1'), assistant('working'), assistant('a1'), user('q2'), assistant('a2')],
      events: [run, say('working'), say('a1'), done(), run, say('a2'), done()],
    });
    expect(said(items)).toEqual([
      'user:q1',
      'message:working',
      'message:a1',
      'user:q2',
      'message:a2',
    ]);
  });

  test('a chat that failed without an answer keeps its question in place', () => {
    const items = threadFromRun({
      messages: [user('q1'), user('q2'), assistant('a2')],
      events: [
        run,
        { event: 'error', data: { code: 'source_failed', message: 'down' } },
        done(),
        run,
        say('a2'),
        done(),
      ],
    });
    expect(items.filter((x) => x.kind === 'user' || x.kind === 'error').map((x) => x.kind)).toEqual(
      ['user', 'error', 'user'],
    );
    expect(said(items)).toEqual(['user:q1', 'user:q2', 'message:a2']);
  });

  test('history a client sent itself stays in order', () => {
    const items = threadFromRun({
      messages: [user('q0'), assistant('a0'), user('q1'), assistant('a1')],
      events: [run, say('a1'), done()],
    });
    expect(said(items)).toEqual(['user:q0', 'message:a0', 'user:q1', 'message:a1']);
  });

  test('the flower stays in the turn that made it, with its signature', () => {
    const items = threadFromRun({
      messages: [user('q1'), assistant('a1'), user('q2'), assistant('a2')],
      events: [
        run,
        { event: 'flower', data: flower },
        { event: 'signature', data: sig },
        say('a1'),
        done(sig),
        run,
        say('a2'),
        done(null),
      ],
    });
    expect(items.map((x) => x.kind)).toEqual([
      'user',
      'flower',
      'message',
      'done',
      'user',
      'message',
      'done',
    ]);
    expect(items[1]).toMatchObject({ kind: 'flower', signature: sig });
    expect(items[3]).toMatchObject({ kind: 'done', signature: sig });
    expect(items[6]).toMatchObject({ kind: 'done', signature: null });
  });
});

describe('fold', () => {
  test('a run stored before done.signature falls back to the flower of its own turn', () => {
    let items: Item[] = [{ kind: 'user', text: 'q' }];
    for (const e of [
      { event: 'flower', data: flower },
      { event: 'signature', data: sig },
      done(),
    ] as AgentEvent[]) {
      items = fold(items, e);
    }
    expect(items.at(-1)).toMatchObject({ kind: 'done', signature: sig });
  });

  test('a recorded run says so as a note, not hidden among the steps', () => {
    const items = fold([], {
      event: 'stage',
      data: { stage: 'recorded', message: 'Recorded run: your question was not read.' },
    });
    expect(items).toEqual([{ kind: 'note', text: 'Recorded run: your question was not read.' }]);
  });
});

describe('blocksOf', () => {
  test('steps in a row collapse into one block between the answers', () => {
    const blocks = blocksOf([
      { kind: 'user', text: 'q' },
      { kind: 'stage', stage: 'thinking', message: 'Thinking' },
      { kind: 'tool', id: '1', name: 'list_networks', args: {} },
      { kind: 'message', text: 'looking' },
      { kind: 'tool', id: '2', name: 'get_snapshot', args: {} },
      { kind: 'message', text: 'done' },
    ]);
    expect(blocks.map((b) => b.kind)).toEqual(['user', 'steps', 'message', 'steps', 'message']);
  });
});

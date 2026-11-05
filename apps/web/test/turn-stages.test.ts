// T178: a turn has witnessed stages. The person should know their words landed and what is
// happening, because calls aren't streamed and a chat can run 120 seconds.
import type { AgentEvent, Run } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import {
  chatReducer,
  initialChat,
  joinQuestion,
  questionBackup,
  type TurnStage,
  turnOfRun,
  type Witness,
  witness,
} from '../lib/thread.ts';

const run: AgentEvent = { event: 'run', data: { run_id: 'r1', resume_url: '/make?run=r1' } };
const stage: AgentEvent = { event: 'stage', data: { stage: 'thinking', message: 'Reading' } };
const tool: AgentEvent = {
  event: 'tool_call',
  data: { id: 'c1', name: 'list_networks', args: {} },
};
const message: AgentEvent = { event: 'message', data: { text: 'hello' } };
const failure: AgentEvent = { event: 'error', data: { code: 'source_failed', message: 'down' } };
const heartbeat: AgentEvent = { event: 'heartbeat', data: {} };
const done: AgentEvent = {
  event: 'done',
  data: { turns: 1, model: 'm', fallback_used: false, tokens: { in: 1, out: 1 }, cost_usd: 0 },
};
const walk = (from: TurnStage, ws: Witness[]) => ws.reduce(witness, from);

describe('witness', () => {
  test('each stage is set only by the event that witnesses it', () => {
    expect(witness('idle', { event: 'sent' })).toBe('sending');
    expect(witness('sending', run)).toBe('accepted');
    expect(witness('accepted', stage)).toBe('working');
    expect(witness('accepted', tool)).toBe('working');
    expect(witness('working', done)).toBe('done');
    expect(witness('working', failure)).toBe('error');
    expect(witness('working', { event: 'ended' })).toBe('lost');
  });

  test('nothing but `run` says the server accepted', () => {
    for (const e of [stage, tool, message, heartbeat]) {
      expect(witness('sending', e)).toBe('sending');
    }
  });

  test('a message or a heartbeat is not work starting', () => {
    expect(witness('accepted', message)).toBe('accepted');
    expect(witness('accepted', heartbeat)).toBe('accepted');
  });

  test('a stream that ends without done: lost once accepted, an error before', () => {
    expect(witness('sending', { event: 'ended' })).toBe('error');
    expect(witness('accepted', { event: 'ended' })).toBe('lost');
    expect(witness('working', { event: 'ended' })).toBe('lost');
  });

  test('the stream ending after done or error changes nothing', () => {
    expect(walk('working', [done, { event: 'ended' }])).toBe('done');
    expect(walk('working', [failure, { event: 'ended' }])).toBe('error');
  });

  test('the done that follows an error does not hide the error', () => {
    expect(walk('working', [failure, done])).toBe('error');
  });

  test('the next question starts a new turn, from any stage', () => {
    for (const s of ['done', 'error', 'lost'] as const) {
      expect(walk(s, [{ event: 'sent' }, run, stage])).toBe('working');
    }
  });
});

describe('turnOfRun: a stored run says where its last turn stands', () => {
  const stored = (status: Run['status'], events: AgentEvent[]) => ({ status, events });

  test('finished', () => {
    expect(turnOfRun(stored('done', [run, stage, done]))).toBe('done');
    expect(turnOfRun(stored('failed', [run, failure, done]))).toBe('error');
  });

  test('still going', () => {
    expect(turnOfRun(stored('running', [run]))).toBe('accepted');
    expect(turnOfRun(stored('running', [run, stage]))).toBe('working');
  });

  test('only the last chat counts', () => {
    expect(turnOfRun(stored('done', [run, failure, done, run, stage, done]))).toBe('done');
  });

  test('reopened, its next `run` event not stored yet: the status witnesses acceptance', () => {
    expect(turnOfRun(stored('running', [run, stage, done]))).toBe('accepted');
    expect(turnOfRun(stored('running', []))).toBe('accepted');
  });
});

const memory = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

describe('questionBackup', () => {
  test('keeps, reads and clears', () => {
    const b = questionBackup(memory(), null);
    expect(b.read()).toBeNull();
    b.keep('who holds power?');
    expect(b.read()).toBe('who holds power?');
    b.clear();
    expect(b.read()).toBeNull();
  });

  test('a question belongs to its conversation', () => {
    const store = memory();
    questionBackup(store, 'run-a').keep('a follow-up');
    expect(questionBackup(store, 'run-b').read()).toBeNull();
    expect(questionBackup(store, null).read()).toBeNull();
    expect(questionBackup(store, 'run-a').read()).toBe('a follow-up');
  });

  test('no storage, or storage that throws, never stops a question', () => {
    const nothing = questionBackup(null, null);
    nothing.keep('x');
    expect(nothing.read()).toBeNull();
    nothing.clear();
    const refuse = () => {
      throw new Error('private mode');
    };
    const broken = questionBackup({ getItem: refuse, setItem: refuse, removeItem: refuse }, null);
    broken.keep('x');
    expect(broken.read()).toBeNull();
    broken.clear();
  });
});

describe('joinQuestion', () => {
  test('an empty box takes the words back', () => {
    expect(joinQuestion('q', '')).toBe('q');
    expect(joinQuestion('q', '   ')).toBe('q');
  });
  test('what was typed meanwhile is kept too', () => {
    expect(joinQuestion('q', 'next thought')).toBe('q\nnext thought');
  });
  test('restoring twice is restoring once', () => {
    expect(joinQuestion('q', 'q')).toBe('q');
  });
});

describe('chatReducer', () => {
  const start = () => initialChat({});

  test('a new chat shows the greeting; opening a run waits for it', () => {
    expect(initialChat({ greeting: 'hi' }).items).toEqual([{ kind: 'message', text: 'hi' }]);
    expect(initialChat({ greeting: 'hi' }).busy).toBe(false);
    expect(initialChat({ initialRun: 'r1' })).toMatchObject({ busy: true, runId: 'r1', items: [] });
  });

  test('sending clears the box and shows the words; `run` gives the id', () => {
    let s = { ...start(), question: 'q' };
    s = chatReducer(s, { type: 'sent', text: 'q', startOver: false });
    expect(s).toMatchObject({ question: '', busy: true, turn: 'sending' });
    expect(s.items).toEqual([{ kind: 'user', text: 'q' }]);
    s = chatReducer(s, { type: 'event', event: run });
    expect(s).toMatchObject({ runId: 'r1', turn: 'accepted', busy: true });
  });

  test('a recorded play starts over', () => {
    const s = { ...start(), items: [{ kind: 'note', text: 'old' } as const] };
    expect(chatReducer(s, { type: 'sent', text: 'q', startOver: true }).items).toEqual([
      { kind: 'user', text: 'q' },
    ]);
  });

  test('a refused question comes back to the box, marked as restored, with the reason', () => {
    let s = chatReducer(start(), { type: 'sent', text: 'q', startOver: false });
    s = chatReducer(s, { type: 'refused', text: 'q', message: 'HTTP 500' });
    expect(s).toMatchObject({ question: 'q', restored: true, busy: false, turn: 'error' });
    expect(s.items.at(-1)).toEqual({ kind: 'error', code: 'client', message: 'HTTP 500' });
  });

  test('a recorded refusal has nothing to give back', () => {
    let s = chatReducer(start(), { type: 'sent', text: 'q', startOver: true });
    s = chatReducer(s, { type: 'refused', text: null, message: 'HTTP 500' });
    expect(s).toMatchObject({ question: '', restored: false, turn: 'error' });
  });

  test('a follow-up refused during a lost turn leaves the lost turn on offer', () => {
    let s: ReturnType<typeof start> = { ...start(), runId: 'r1', turn: 'lost' };
    s = chatReducer(s, { type: 'sent', text: 'q', startOver: false });
    s = chatReducer(s, { type: 'refused', text: 'q', message: 'bad_input: run r1 is still going' });
    expect(s.turn).toBe('lost');
  });

  test('typing into an emptied box ends the restored question', () => {
    let s = { ...start(), question: 'q', restored: true };
    s = chatReducer(s, { type: 'typed', text: 'q2' });
    expect(s.restored).toBe(true);
    s = chatReducer(s, { type: 'typed', text: '' });
    expect(s.restored).toBe(false);
  });

  test('the stream ending goes idle, and says if it was the second time', () => {
    let s = chatReducer(start(), { type: 'sent', text: 'q', startOver: false });
    s = chatReducer(s, { type: 'event', event: run });
    s = chatReducer(s, { type: 'ended', again: false });
    expect(s).toMatchObject({ busy: false, turn: 'lost', lostAgain: false });
    s = chatReducer(s, { type: 'opening' });
    expect(s).toMatchObject({ busy: true, turn: 'lost' });
    s = chatReducer(s, { type: 'ended', again: true });
    expect(s).toMatchObject({ busy: false, turn: 'lost', lostAgain: true });
  });

  test('a stored run replaces the thread and sets the stage', () => {
    let s = chatReducer(start(), { type: 'opening' });
    s = chatReducer(s, {
      type: 'opened',
      run: {
        status: 'running',
        messages: [{ role: 'user', content: 'q' }],
        events: [run, stage],
      },
    });
    expect(s.turn).toBe('working');
    expect(s.items[0]).toEqual({ kind: 'user', text: 'q' });
    expect(s.busy).toBe(true);
  });

  test('a run that cannot be read: the only thing on a fresh page', () => {
    let s = chatReducer(initialChat({ initialRun: 'r1' }), { type: 'opening' });
    s = chatReducer(s, { type: 'unreadable', code: 'not_found', message: 'no run r1' });
    expect(s).toMatchObject({ busy: false, turn: 'error' });
    expect(s.items).toEqual([{ kind: 'error', code: 'not_found', message: 'no run r1' }]);
  });

  test('a lost run the server no longer has: the thread stays, and it says the run is gone', () => {
    const seen = { kind: 'message', text: 'what arrived' } as const;
    let s: ReturnType<typeof start> = { ...start(), runId: 'r1', turn: 'lost', items: [seen] };
    s = chatReducer(s, { type: 'opening' });
    s = chatReducer(s, { type: 'unreadable', code: 'not_found', message: 'no run r1' });
    expect(s).toMatchObject({ busy: false, turn: 'error' });
    expect(s.items[0]).toEqual(seen);
    expect(s.items.at(-1)).toMatchObject({ kind: 'error', code: 'not_found' });
    expect((s.items.at(-1) as { message: string }).message).toMatch(/no longer has this run/);
  });

  test('a lost run the server could not be asked about: still lost, and it says why', () => {
    const seen = { kind: 'message', text: 'what arrived' } as const;
    let s: ReturnType<typeof start> = { ...start(), runId: 'r1', turn: 'lost', items: [seen] };
    s = chatReducer(s, { type: 'opening' });
    s = chatReducer(s, { type: 'unreadable', code: 'client', message: 'Failed to fetch' });
    expect(s).toMatchObject({ busy: false, turn: 'lost' });
    expect(s.items).toEqual([seen, { kind: 'error', code: 'client', message: 'Failed to fetch' }]);
  });

  test('it is pure: the state it was given stays as it was', () => {
    const s = Object.freeze({ ...start(), items: Object.freeze([]) as never });
    expect(() => chatReducer(s, { type: 'sent', text: 'q', startOver: false })).not.toThrow();
    expect(s.items).toEqual([]);
  });
});

// T178: the chat's flows with a fake adapter and an in-memory store: the words survive anything short
// of acceptance, the stages are witnessed, and a dropped stream is lost rather than idle.
import type { AgentEvent, Run } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import type { AgentClient, RunRead } from '../lib/agent-client.ts';
import {
  type ChatAction,
  chatReducer,
  initialChat,
  type QuestionStore,
  type TurnStage,
} from '../lib/thread.ts';
import {
  type ChatDeps,
  openRun,
  restoreQuestion,
  sendQuestion,
  typeQuestion,
} from '../viewmodels/useMakeChat.ts';

const QUESTION = 'who stands behind NEAR?';
const run: AgentEvent = { event: 'run', data: { run_id: 'r1', resume_url: '/make?run=r1' } };
const stage: AgentEvent = { event: 'stage', data: { stage: 'thinking', message: 'Reading' } };
const say: AgentEvent = { event: 'message', data: { text: 'an answer' } };
const done: AgentEvent = {
  event: 'done',
  data: { turns: 1, model: 'm', fallback_used: false, tokens: { in: 1, out: 1 }, cost_usd: 0 },
};

const memory = (): QuestionStore & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
};

/** The events, then the way the stream ends: quietly, or by breaking. */
async function* stream(events: AgentEvent[], breaks?: string) {
  for (const e of events) yield e;
  if (breaks) throw new TypeError(breaks);
}

const unused = () => {
  throw new Error('this test did not expect that call');
};

function fake(o: Partial<AgentClient>): ChatDeps['client'] {
  return { chat: unused, readRun: unused, followRun: unused, ...o };
}

/** Runs the real reducer over a flow, keeping every stage it passes through. */
function harness(client: ChatDeps['client'], store = memory(), init = initialChat({})) {
  let state = init;
  const stages: TurnStage[] = [state.turn];
  const urls: string[] = [];
  const deps: ChatDeps = {
    client,
    store,
    onRun: (id) => urls.push(id),
    dispatch: (a: ChatAction) => {
      state = chatReducer(state, a);
      if (stages.at(-1) !== state.turn) stages.push(state.turn);
    },
  };
  return {
    deps,
    store,
    stages,
    urls,
    get state() {
      return state;
    },
    send: (o: { greeting?: string; recorded?: boolean } = {}) =>
      sendQuestion(deps, {
        text: QUESTION,
        recorded: o.recorded ?? false,
        greeting: o.greeting,
        runId: state.runId,
      }),
  };
}

const kept = (store: { m: Map<string, string> }) => [...store.m.values()];
const stored = (status: Run['status'], events: AgentEvent[]): RunRead => ({
  ok: true,
  run: {
    run_id: 'r1',
    status,
    messages: [{ role: 'user', content: QUESTION }],
    events,
    created_at: '2026-11-05T00:00:00Z',
    updated_at: '2026-11-05T00:00:00Z',
  },
});

describe('defect 1: a question is not lost until accepted', () => {
  test('a network error at send puts the words back (it used to lose them)', async () => {
    const h = harness(fake({ chat: () => stream([], 'Failed to fetch') }));
    await h.send();
    expect(h.state.question).toBe(QUESTION);
    expect(h.state.items.at(-1)).toEqual({
      kind: 'error',
      code: 'client',
      message: 'Failed to fetch',
    });
    expect(h.state.turn).toBe('error');
    expect(h.state.busy).toBe(false);
  });

  test('a refusal from the server puts the words back', async () => {
    const h = harness(fake({ chat: () => stream([], 'rate_limited: At most 10 chats an hour') }));
    await h.send();
    expect(h.state.question).toBe(QUESTION);
    expect(h.state.items.at(-1)).toMatchObject({
      message: 'rate_limited: At most 10 chats an hour',
    });
  });

  test('a stream that closes before `run` puts the words back and says so', async () => {
    const h = harness(fake({ chat: () => stream([]) }));
    await h.send();
    expect(h.state.question).toBe(QUESTION);
    expect(h.state.turn).toBe('error');
    expect(h.state.items.at(-1)).toMatchObject({ kind: 'error', code: 'client' });
    expect((h.state.items.at(-1) as { message: string }).message).toMatch(/closed before/);
  });

  test('the box clears on send, and the backup is there the whole time before acceptance', async () => {
    const seen: { box: string; backup: string[] }[] = [];
    const h = harness(
      fake({
        async *chat() {
          seen.push({ box: h.state.question, backup: kept(h.store) });
          yield run;
          seen.push({ box: h.state.question, backup: kept(h.store) });
          yield done;
        },
      }),
    );
    await h.send();
    expect(seen).toEqual([
      { box: '', backup: [QUESTION] },
      { box: '', backup: [] },
    ]);
  });

  test('a failure keeps the backup: a reload after it still finds the words', async () => {
    const h = harness(fake({ chat: () => stream([], 'Failed to fetch') }));
    await h.send();
    expect(kept(h.store)).toEqual([QUESTION]);
    const again = harness(fake({}), h.store);
    restoreQuestion(again.deps, null);
    expect(again.state.question).toBe(QUESTION);
  });

  test('a reload before acceptance finds the words', async () => {
    // the POST never answers, and the page goes away
    const h = harness(
      fake({
        async *chat() {
          await new Promise(() => {});
        },
      }),
    );
    void h.send();
    const reloaded = harness(fake({}), h.store);
    restoreQuestion(reloaded.deps, null);
    expect(reloaded.state).toMatchObject({ question: QUESTION, restored: true });
  });

  test('a reload after acceptance finds nothing to restore', async () => {
    const h = harness(fake({ chat: () => stream([run, stage, done]) }));
    await h.send();
    expect(kept(h.store)).toEqual([]);
    const reloaded = harness(fake({}), h.store);
    restoreQuestion(reloaded.deps, null);
    expect(reloaded.state.question).toBe('');
  });

  test('accepted is what counts: a drop after `run` restores nothing, the question landed', async () => {
    const h = harness(fake({ chat: () => stream([run], 'network error') }));
    await h.send();
    expect(h.state.question).toBe('');
    expect(kept(h.store)).toEqual([]);
  });

  test('a follow-up keeps its own backup, under its own run', async () => {
    const h = harness(
      fake({ chat: () => stream([], 'Failed to fetch') }),
      memory(),
      initialChat({ initialRun: 'r1' }),
    );
    await h.send();
    const elsewhere = harness(fake({}), h.store);
    restoreQuestion(elsewhere.deps, null);
    expect(elsewhere.state.question).toBe('');
    const same = harness(fake({}), h.store, initialChat({ initialRun: 'r1' }));
    restoreQuestion(same.deps, 'r1');
    expect(same.state.question).toBe(QUESTION);
  });

  test('editing a restored question moves the backup with it; emptying the box withdraws it', async () => {
    const h = harness(fake({ chat: () => stream([], 'Failed to fetch') }));
    await h.send();
    typeQuestion(h.deps, h.state, `${QUESTION}, really?`);
    expect(kept(h.store)).toEqual([`${QUESTION}, really?`]);
    typeQuestion(h.deps, h.state, '');
    expect(kept(h.store)).toEqual([]);
    expect(h.state.question).toBe('');
  });

  test('typing a new question that was never sent stores nothing', () => {
    const h = harness(fake({}));
    typeQuestion(h.deps, h.state, 'just thinking');
    expect(h.state.question).toBe('just thinking');
    expect(kept(h.store)).toEqual([]);
  });

  test('what was typed while the send was failing is kept with the restored words', async () => {
    const h = harness(
      fake({
        chat: () => {
          typeQuestion(h.deps, h.state, 'next thought');
          return stream([], 'Failed to fetch');
        },
      }),
    );
    await h.send();
    expect(h.state.question).toBe(`${QUESTION}\nnext thought`);
  });

  test('a store that throws does not stop the question', async () => {
    const refuse = () => {
      throw new Error('private mode');
    };
    const broken = { m: new Map(), getItem: refuse, setItem: refuse, removeItem: refuse };
    const h = harness(fake({ chat: () => stream([run, done]) }), broken);
    await h.send();
    expect(h.state.turn).toBe('done');
  });

  test('a recorded play has no words of its own to keep', async () => {
    const h = harness(fake({ chat: () => stream([], 'Failed to fetch') }));
    await h.send({ recorded: true });
    expect(kept(h.store)).toEqual([]);
    expect(h.state.question).toBe('');
  });
});

describe('defect 2: a turn has witnessed stages', () => {
  test('a whole turn: sending, accepted, working, done', async () => {
    const h = harness(fake({ chat: () => stream([run, stage, say, done]) }));
    await h.send();
    expect(h.stages).toEqual(['idle', 'sending', 'accepted', 'working', 'done']);
    expect(h.urls).toEqual(['r1']);
    expect(h.state.busy).toBe(false);
  });

  test('a failed turn: the error event is the witness', async () => {
    const failure: AgentEvent = {
      event: 'error',
      data: { code: 'source_failed', message: 'down' },
    };
    const h = harness(fake({ chat: () => stream([run, stage, failure, done]) }));
    await h.send();
    expect(h.stages).toEqual(['idle', 'sending', 'accepted', 'working', 'error']);
    expect(h.state.question).toBe('');
  });

  test('sends what is new, the greeting with the first question, the run id on a follow-up', async () => {
    const bodies: unknown[] = [];
    const client = fake({
      async *chat(body) {
        bodies.push(body);
        yield run;
        yield done;
      },
    });
    const h = harness(client);
    await h.send({ greeting: 'hello there' });
    await h.send({ greeting: 'hello there' });
    expect(bodies).toEqual([
      {
        messages: [
          { role: 'assistant', content: 'hello there' },
          { role: 'user', content: QUESTION },
        ],
      },
      { messages: [{ role: 'user', content: QUESTION }], run_id: 'r1' },
    ]);
  });

  test('a recorded play starts over and never continues a run', async () => {
    const bodies: unknown[] = [];
    const h = harness(
      fake({
        async *chat(body) {
          bodies.push(body);
          yield run;
          yield done;
        },
      }),
    );
    await h.send({ recorded: true });
    await h.send({ recorded: true });
    expect(bodies[1]).toEqual({ messages: [{ role: 'user', content: QUESTION }] });
    expect(h.state.items.filter((x) => x.kind === 'user')).toHaveLength(1);
  });
});

describe('defect 3: a stream that ends without done is lost', () => {
  test('it closes quietly: lost, not idle, and no error row', async () => {
    const h = harness(fake({ chat: () => stream([run, stage, say]) }));
    await h.send();
    expect(h.stages).toEqual(['idle', 'sending', 'accepted', 'working', 'lost']);
    expect(h.state.items.some((x) => x.kind === 'error')).toBe(false);
    expect(h.state.busy).toBe(false);
  });

  test('it breaks: the same', async () => {
    const h = harness(fake({ chat: () => stream([run, stage], 'network error') }));
    await h.send();
    expect(h.state.turn).toBe('lost');
    expect(h.state.items.some((x) => x.kind === 'error')).toBe(false);
  });

  test('following it again, run still going: replays nothing twice, and finishes', async () => {
    const asked: [string, number][] = [];
    const h = harness(
      fake({
        chat: () => stream([run, stage]),
        readRun: async () => stored('running', [run, stage]),
        followRun: (id, skip) => {
          asked.push([id, skip]);
          return stream([say, done]);
        },
      }),
    );
    await h.send();
    expect(h.state.turn).toBe('lost');
    await openRun(h.deps, 'r1', { again: true });
    expect(asked).toEqual([['r1', 2]]);
    expect(h.state).toMatchObject({ turn: 'done', busy: false, lostAgain: false });
    expect(h.state.items.filter((x) => x.kind === 'message')).toEqual([
      { kind: 'message', text: 'an answer' },
    ]);
    expect(h.stages.slice(-3)).toEqual(['lost', 'working', 'done']);
  });

  test('following it again, run finished meanwhile: the stored run is the whole answer', async () => {
    const h = harness(
      fake({
        chat: () => stream([run, stage]),
        readRun: async () => ({
          ok: true,
          run: {
            ...(stored('done', [run, stage, say, done]) as { run: Run }).run,
            messages: [
              { role: 'user', content: QUESTION },
              { role: 'assistant', content: 'an answer' },
            ],
          },
        }),
      }),
    );
    await h.send();
    await openRun(h.deps, 'r1', { again: true });
    expect(h.state.turn).toBe('done');
    expect(h.state.items.map((x) => x.kind)).toEqual(['user', 'stage', 'message', 'done']);
  });

  test('following it again ends without done too: lost again, and it can say so', async () => {
    const h = harness(
      fake({
        chat: () => stream([run, stage]),
        readRun: async () => stored('running', [run, stage]),
        followRun: () => stream([]),
      }),
    );
    await h.send();
    await openRun(h.deps, 'r1', { again: true });
    expect(h.state).toMatchObject({ turn: 'lost', lostAgain: true, busy: false });
  });

  test('following it again, server unreachable: still lost, and the reason is on the page', async () => {
    const h = harness(
      fake({
        chat: () => stream([run, stage]),
        readRun: async () => {
          throw new TypeError('Failed to fetch');
        },
      }),
    );
    await h.send();
    await openRun(h.deps, 'r1', { again: true });
    expect(h.state).toMatchObject({ turn: 'lost', busy: false });
    expect(h.state.items.at(-1)).toEqual({
      kind: 'error',
      code: 'client',
      message: 'Failed to fetch',
    });
  });

  test('following it again, run gone from the server: says so plainly, no more offers', async () => {
    const h = harness(
      fake({
        chat: () => stream([run, stage]),
        readRun: async () => ({ ok: false, code: 'not_found', message: 'no run r1' }),
      }),
    );
    await h.send();
    await openRun(h.deps, 'r1', { again: true });
    expect(h.state).toMatchObject({ turn: 'error', busy: false });
    expect((h.state.items.at(-1) as { message: string }).message).toMatch(/no longer has this run/);
  });
});

describe('opening a run by its link', () => {
  const opening = () => initialChat({ initialRun: 'r1' });

  test('a finished run: the thread, at rest', async () => {
    const h = harness(
      fake({ readRun: async () => stored('done', [run, stage, done]) }),
      memory(),
      opening(),
    );
    await openRun(h.deps, 'r1');
    expect(h.state).toMatchObject({ turn: 'done', busy: false });
    expect(h.state.items[0]).toEqual({ kind: 'user', text: QUESTION });
  });

  test('a run that went quiet while nobody followed it: lost, by the same rule', async () => {
    const h = harness(
      fake({
        readRun: async () => stored('running', [run, stage]),
        followRun: () => stream([]),
      }),
      memory(),
      opening(),
    );
    await openRun(h.deps, 'r1');
    expect(h.state).toMatchObject({ turn: 'lost', busy: false, lostAgain: false });
  });

  test('no such run: the one thing on the page', async () => {
    const h = harness(
      fake({ readRun: async () => ({ ok: false, code: 'not_found', message: 'no run r1' }) }),
      memory(),
      opening(),
    );
    await openRun(h.deps, 'r1');
    expect(h.state.items).toEqual([{ kind: 'error', code: 'not_found', message: 'no run r1' }]);
    expect(h.state).toMatchObject({ turn: 'error', busy: false });
  });

  test('the page left: nothing more happens', async () => {
    let gone = false;
    const h = harness(
      fake({
        readRun: async () => {
          gone = true;
          return stored('done', [run]);
        },
      }),
      memory(),
      opening(),
    );
    await openRun(h.deps, 'r1', { gone: () => gone });
    expect(h.state.items).toEqual([]);
    expect(h.state.busy).toBe(true);
  });

  test('a later event names the run for the address bar', async () => {
    const h = harness(
      fake({
        readRun: async () => stored('running', []),
        followRun: () => stream([run, done]),
      }),
      memory(),
      opening(),
    );
    await openRun(h.deps, 'r1');
    expect(h.urls).toEqual(['r1']);
  });
});

describe("the conversation's name", () => {
  const ev = (event: AgentEvent) => ({ type: 'event' as const, event });
  test('a title event names this run, and another run starts unnamed', () => {
    let s = initialChat({});
    s = chatReducer(s, ev({ event: 'run', data: { run_id: 'run_1' } } as AgentEvent));
    expect(s.named).toBeNull();
    s = chatReducer(s, ev({ event: 'title', data: { title: 'NEAR stake concentration' } }));
    expect(s.named).toBe('NEAR stake concentration');
    s = chatReducer(s, ev({ event: 'run', data: { run_id: 'run_1' } } as AgentEvent));
    expect(s.named).toBe('NEAR stake concentration');
    s = chatReducer(s, ev({ event: 'run', data: { run_id: 'run_2' } } as AgentEvent));
    expect(s.named).toBeNull();
  });
});

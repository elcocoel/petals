// T178, defect 3, against the real server: the real routes and run store, the real adapter, and a
// stub model the test holds, so nothing leaves this machine. The stream is cut the way a network cuts
// it. The server keeps the run going (routes.ts), and GET /api/v1/agent/runs/:id replays it, so a lost
// turn can be followed again, except when the process that held the run has stopped.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentRoutes, DEFAULT_BUDGET, fileRunStore, type LlmClient } from '@petal/agent';
import type { AgentEvent } from '@petal/core/types';
import { createContext } from '@petal/tools';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { agentClient } from '../lib/agent-client.ts';
import { repoRoot } from '../lib/config.ts';
import { type ChatState, chatReducer, initialChat } from '../lib/thread.ts';
import { type ChatDeps, openRun, sendQuestion } from '../viewmodels/useMakeChat.ts';

let state: string;
beforeEach(() => {
  state = mkdtempSync(join(tmpdir(), 'petal-refollow-'));
});
afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(state, { recursive: true, force: true });
});

/** A model that answers when the test says so. */
function heldModel(): LlmClient & { answer: () => void } {
  let answer = () => {};
  const held = new Promise<void>((r) => {
    answer = r;
  });
  return {
    kind: 'near-ai-cloud',
    model: 'stub/held',
    answer: () => answer(),
    async complete() {
      await held;
      return {
        model: 'stub/held',
        completion_id: 'c1',
        message: { role: 'assistant', content: 'the answer' },
        usage: { in: 1, out: 1 },
        cost_usd: 0,
        fallback_used: false,
        signature: null,
      };
    },
  };
}

/** Passes `blocks` SSE events, then ends the way a dropped connection does. The run goes on. */
function cut(res: Response, blocks: number, how: 'close' | 'error'): Response {
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  let passed = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      async pull(c) {
        // the cut comes as soon as the events are through, not when the next one arrives
        if (passed >= blocks) {
          await reader.cancel();
          if (how === 'error') c.error(new TypeError('network error'));
          else c.close();
          return;
        }
        for (;;) {
          const at = buffer.indexOf('\n\n');
          if (at !== -1) {
            c.enqueue(encoder.encode(buffer.slice(0, at + 2)));
            buffer = buffer.slice(at + 2);
            passed++;
            return;
          }
          const { done, value } = await reader.read();
          if (done) {
            c.close();
            return;
          }
          buffer += decoder.decode(value, { stream: true });
        }
      },
    }),
    { status: res.status, headers: res.headers },
  );
}

/** The browser's fetch, answered by the real routes. The next chat is cut after `cutAfter` events. */
function server(o: { llm: LlmClient; cutAfter?: number; how?: 'close' | 'error' }) {
  const runsDir = join(state, 'runs');
  const app = agentRoutes({
    tools: createContext({ root: repoRoot(), fake: true, stateDir: state }),
    llm: o.llm,
    budget: DEFAULT_BUDGET,
    runs: fileRunStore(runsDir),
  });
  let cutNext = o.cutAfter;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const res = await app.request(url, init);
    if (url.endsWith('/agent/chat') && cutNext !== undefined) {
      const after = cutNext;
      cutNext = undefined;
      return cut(res, after, o.how ?? 'close');
    }
    return res;
  });
  return { runsDir };
}

function chat(init: ChatState = initialChat({})) {
  let current = init;
  const stages = [current.turn];
  const deps: ChatDeps = {
    client: agentClient,
    store: null,
    onRun: () => {},
    dispatch: (a) => {
      current = chatReducer(current, a);
      if (stages.at(-1) !== current.turn) stages.push(current.turn);
    },
  };
  return {
    deps,
    stages,
    get state() {
      return current;
    },
    ask: (text = 'who holds power?') =>
      sendQuestion(deps, { text, recorded: false, runId: current.runId }),
    refollow: () => openRun(deps, current.runId as string, { again: true }),
  };
}

const until = async (f: () => boolean | Promise<boolean>, what: string) => {
  for (let i = 0; i < 300; i++) {
    if (await f()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`timed out: ${what}`);
};

const isDone = async (runId: string) => {
  const res = await fetch(`/api/v1/agent/runs/${runId}`);
  return ((await res.json()) as { status: string }).status === 'done';
};

// what the server sends before the model's first call: `run`, then the first `stage`
const UP_TO_WORKING = 2;

describe('a dropped stream, against the real routes', () => {
  test.each(['close', 'error'] as const)(
    'it %ss after `run` and a stage: the turn is lost, and the question is safe',
    async (how) => {
      const llm = heldModel();
      server({ llm, cutAfter: UP_TO_WORKING, how });
      const c = chat();
      await c.ask();
      expect(c.stages).toEqual(['idle', 'sending', 'accepted', 'working', 'lost']);
      expect(c.state.busy).toBe(false);
      expect(c.state.question).toBe('');
      expect(c.state.items.some((x) => x.kind === 'error')).toBe(false);
      llm.answer();
      await until(() => isDone(c.state.runId as string), 'the run finishes');
    },
  );

  test('re-follow, run still going: it picks up, gets the rest once, and finishes', async () => {
    const llm = heldModel();
    server({ llm, cutAfter: UP_TO_WORKING });
    const c = chat();
    await c.ask();
    expect(c.state.turn).toBe('lost');

    const following = c.refollow();
    await until(() => c.state.turn === 'working', 'the stored run is read');
    llm.answer();
    await following;

    expect(c.state).toMatchObject({ turn: 'done', busy: false, lostAgain: false });
    const said = c.state.items.flatMap((x) =>
      x.kind === 'user' || x.kind === 'message' ? [`${x.kind}:${x.text}`] : [],
    );
    expect(said).toEqual(['user:who holds power?', 'message:the answer']);
    expect(c.state.items.filter((x) => x.kind === 'done')).toHaveLength(1);
  });

  test('re-follow, run finished meanwhile: the stored run is the whole answer', async () => {
    const llm = heldModel();
    server({ llm, cutAfter: UP_TO_WORKING });
    const c = chat();
    await c.ask();
    llm.answer();
    await until(() => isDone(c.state.runId as string), 'the run finishes');

    await c.refollow();
    expect(c.state).toMatchObject({ turn: 'done', busy: false });
    expect(c.state.items.at(-1)?.kind).toBe('done');
    expect(c.state.items.some((x) => x.kind === 'message' && x.text === 'the answer')).toBe(true);
  });

  test('a follow-up while the lost run is still going: refused, the words come back, the offer stays', async () => {
    const llm = heldModel();
    server({ llm, cutAfter: UP_TO_WORKING });
    const c = chat();
    await c.ask();
    await c.ask('and then?');
    expect(c.state.turn).toBe('lost');
    expect(c.state.question).toBe('and then?');
    expect(c.state.items.at(-1)).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('still going'),
    });
    llm.answer();
    await until(() => isDone(c.state.runId as string), 'the run finishes');
  });

  test('a run nobody holds any more (the process stopped): the server closes without done, so it stays lost', async () => {
    const { runsDir } = server({ llm: heldModel() });
    const runId = 'stoppedrun1';
    const events: AgentEvent[] = [
      { event: 'run', data: { run_id: runId, resume_url: `/make?run=${runId}` } },
      { event: 'stage', data: { stage: 'thinking', message: 'Reading the question' } },
    ];
    await mkdir(runsDir, { recursive: true });
    writeFileSync(
      join(runsDir, `${runId}.json`),
      JSON.stringify({
        run_id: runId,
        status: 'running',
        messages: [{ role: 'user', content: 'who holds power?' }],
        events,
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-01T00:00:00.000Z',
      }),
    );

    const c = chat(initialChat({ initialRun: runId }));
    await openRun(c.deps, runId);
    expect(c.state).toMatchObject({ turn: 'lost', busy: false, lostAgain: false });
    await c.refollow();
    expect(c.state).toMatchObject({ turn: 'lost', busy: false, lostAgain: true });
  });

  test('a run the server no longer has: says so plainly, and keeps what arrived', async () => {
    const llm = heldModel();
    server({ llm, cutAfter: UP_TO_WORKING });
    const c = chat();
    await c.ask();
    llm.answer();
    await until(() => isDone(c.state.runId as string), 'the run finishes');
    // a host without lasting disk: the next request lands on an instance that never saw this run
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify({ error: { code: 'not_found', message: 'no run' } }), {
          status: 404,
        }),
    );
    await c.refollow();
    expect(c.state).toMatchObject({ turn: 'error', busy: false });
    expect(c.state.items[0]).toEqual({ kind: 'user', text: 'who holds power?' });
    expect(c.state.items.at(-1)).toMatchObject({
      code: 'not_found',
      message: expect.stringContaining('no longer has this run'),
    });
  });

  test('cut before `run`: nothing was accepted, so the words come back', async () => {
    const llm = heldModel();
    server({ llm, cutAfter: 0, how: 'error' });
    const c = chat();
    await c.ask();
    expect(c.state).toMatchObject({ turn: 'error', question: 'who holds power?', busy: false });
    llm.answer();
    await new Promise((r) => setTimeout(r, 20));
  });
});

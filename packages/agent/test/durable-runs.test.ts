// T190: a run doesn't depend on who watches it. Real routes and the real SQLite store; the model is
// a double the test holds, which answers one call at a time.
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSignal } from '@petal/core';
import type { ChatInput, Run } from '@petal/core/types';
import { openStore, type Store } from '@petal/store';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { buildPetalApp } from '../src/app.ts';
import { storeLedger } from '../src/budget.ts';
import {
  type Budget,
  DEFAULT_BUDGET,
  type LlmClient,
  type LlmCompletion,
  type LlmRequest,
} from '../src/llm.ts';
import { LlmCallError } from '../src/near-ai.ts';
import { type AgentRouteOptions, createAgentRoutes } from '../src/routes.ts';
import { STOPPED } from '../src/run.ts';
import { INTERRUPTED, interruptRuns, type RunStore, sqliteRunStore } from '../src/runs.ts';
import { fakeContext, fakeRegistry, parseSse, runIdOf, type SseEvent, tmpRoot } from './helpers.ts';

const QUESTION = { messages: [{ role: 'user', content: 'who holds power?' }] };
const COST = 0.01;
const DAY = new Date().toISOString().slice(0, 10);

const answer = (o: { content?: string; tool?: string; id?: string } = {}): LlmCompletion => ({
  model: 'stub/held',
  completion_id: `c-${o.tool ?? 'end'}`,
  message: o.tool
    ? {
        role: 'assistant',
        content: o.content ?? null,
        tool_calls: [{ id: o.id ?? 'call_1', name: o.tool, arguments: '{}' }],
      }
    : { role: 'assistant', content: o.content ?? 'the answer' },
  usage: { in: 10, out: 10 },
  cost_usd: COST,
  fallback_used: false,
  signature: null,
});

/** A model the test answers one call at a time. A call honours Stop, or not, as told. */
function heldModel(o: { ignoreStop?: boolean } = {}) {
  const calls: { req: LlmRequest; signal?: AbortSignal; give: (c: LlmCompletion) => void }[] = [];
  const llm: LlmClient = {
    kind: 'near-ai-cloud',
    model: 'stub/held',
    complete: (req, opts) =>
      new Promise((resolve, reject) => {
        const signal = opts?.signal;
        calls.push({ req: structuredClone(req), signal, give: resolve });
        if (o.ignoreStop) return;
        signal?.addEventListener('abort', () => {
          reject(new LlmCallError('source_failed', 'aborted', { costUsd: 0.002 }));
        });
      }),
  };
  return {
    llm,
    calls,
    /** the nth model call, once it has come in */
    call: async (n: number) => {
      await until(() => calls.length > n, `model call ${n}`);
      return calls[n] as (typeof calls)[number];
    },
  };
}

async function until(f: () => boolean | Promise<boolean>, what: string, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await f()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`timed out: ${what}`);
}

function setup(
  llm: LlmClient,
  o: { budget?: Partial<Budget>; opts?: AgentRouteOptions; store?: Store; runs?: RunStore } = {},
) {
  const store = o.store ?? openStore(':memory:');
  const runs = o.runs ?? sqliteRunStore(store);
  const app = createAgentRoutes(
    {
      tools: fakeContext(),
      llm,
      budget: { ...DEFAULT_BUDGET, ledger: storeLedger(store), ...o.budget },
      runs,
    },
    { registry: fakeRegistry().registry, ...o.opts },
  );
  return { app, runs, store };
}
type App = ReturnType<typeof setup>['app'];

const post = (app: App, body: unknown = QUESTION, accept = 'text/event-stream') =>
  app.request('/api/v1/agent/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept },
    body: JSON.stringify(body),
  });
const startRun = async (app: App, body?: unknown) => {
  const res = await post(app, body, 'application/json');
  expect(res.status).toBe(202);
  return ((await res.json()) as { run_id: string }).run_id;
};
const watch = (app: App, id: string, o: { from?: number; last?: number } = {}) =>
  app.request(`/api/v1/agent/runs/${id}${o.from === undefined ? '' : `?from=${o.from}`}`, {
    headers: {
      accept: 'text/event-stream',
      ...(o.last === undefined ? {} : { 'last-event-id': String(o.last) }),
    },
  });
const read = async (app: App, id: string) =>
  (await (await app.request(`/api/v1/agent/runs/${id}`)).json()) as Run;
const stop = async (app: App, id: string) => {
  const res = await app.request(`/api/v1/agent/runs/${id}/stop`, { method: 'POST' });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

/** A viewer reading one event at a time, who can leave whenever. */
function viewer(res: Response) {
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  const seen: SseEvent[] = [];
  let buffer = '';
  const pump = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      const at = buffer.lastIndexOf('\n\n');
      if (at === -1) continue;
      seen.push(...parseSse(buffer.slice(0, at + 2)));
      buffer = buffer.slice(at + 2);
    }
  })();
  return {
    seen,
    ended: pump,
    has: (n: number) => until(() => seen.length >= n, `${n} events`),
    leave: () => reader.cancel(),
  };
}

const ids = (es: SseEvent[]) => es.map((e) => e.id);
const names = (es: SseEvent[]) => es.map((e) => e.event);
const noBeats = (es: SseEvent[]) => es.filter((e) => e.event !== 'heartbeat');
const range = (from: number, n: number) => Array.from({ length: n }, (_, i) => String(from + i));

describe('the loop leaves the request', () => {
  test('asked for JSON, the chat answers with the run id at once and finishes unwatched', async () => {
    const m = heldModel();
    const { app } = setup(m.llm);
    const id = await startRun(app);
    expect((await read(app, id)).status).toBe('running');
    (await m.call(0)).give(answer());
    await until(async () => (await read(app, id)).status === 'done', 'the run ends');
    expect((await read(app, id)).messages.at(-1)?.content).toBe('the answer');
  });

  test('a run still going refuses a second chat, however it was started', async () => {
    const m = heldModel();
    const { app } = setup(m.llm);
    const id = await startRun(app);
    const busy = await post(app, { messages: [{ role: 'user', content: 'x' }], run_id: id });
    expect(busy.status).toBe(400);
    (await m.call(0)).give(answer());
  });
});

describe('reconnect by cursor', () => {
  test('`id` is the event’s seq in the log, across the chats of a run', async () => {
    const m = heldModel();
    const { app, runs } = setup(m.llm);
    const first = post(app);
    (await m.call(0)).give(answer());
    const one = parseSse(await (await first).text());
    expect(ids(one)).toEqual(range(0, one.length));
    const id = runIdOf(one);
    const next = post(app, { messages: [{ role: 'user', content: 'and now?' }], run_id: id });
    (await m.call(1)).give(answer({ content: 'second' }));
    const two = parseSse(await (await next).text());
    expect(ids(two)).toEqual(range(one.length, two.length));
    expect(names(two)[0]).toBe('run');
    const log = await runs.eventsFrom(id);
    expect(log.map((e) => String(e.seq))).toEqual(range(0, one.length + two.length));
    expect(log.slice(one.length).map((e) => e.event.event)).toEqual(names(two));
  });

  test('two viewers: one stays, one leaves and returns; each event once, and the run never notices', async () => {
    const m = heldModel();
    const { app } = setup(m.llm);
    const id = await startRun(app);
    const stayer = viewer(await watch(app, id));
    const leaver = viewer(await watch(app, id));
    (await m.call(0)).give(answer({ tool: 'list_networks' }));
    await m.call(1);
    await stayer.has(5);
    await leaver.has(5);
    await leaver.leave();
    const gotBeforeLeaving = leaver.seen.length;
    const last = Number(leaver.seen.at(-1)?.id);
    expect(ids(leaver.seen)).toEqual(range(0, gotBeforeLeaving));

    // the work goes on with one viewer less, and comes back to one that says where it was
    m.calls[1]?.give(answer({ tool: 'list_flowers', id: 'call_2' }));
    await m.call(2);
    const back = viewer(await watch(app, id, { last }));
    const fresh = viewer(await watch(app, id, { from: 3 }));
    m.calls[2]?.give(answer());
    await Promise.all([stayer.ended, back.ended, fresh.ended]);

    const all = await read(app, id);
    expect(all.status).toBe('done');
    const log = all.events.map((e) => e.event);
    expect(names(noBeats(stayer.seen))).toEqual(log);
    expect(ids(noBeats(stayer.seen))).toEqual(range(0, log.length));
    expect(ids(noBeats(back.seen))).toEqual(range(last + 1, log.length - last - 1));
    expect(names(noBeats(fresh.seen))).toEqual(log.slice(3));
  });

  test('a finished run replays from the cursor and ends; a cursor past the end just ends', async () => {
    const m = heldModel();
    const { app } = setup(m.llm);
    const id = await startRun(app);
    (await m.call(0)).give(answer());
    await until(async () => (await read(app, id)).status === 'done', 'the run ends');
    const n = (await read(app, id)).events.length;
    expect(ids(parseSse(await (await watch(app, id, { from: 2 })).text()))).toEqual(
      range(2, n - 2),
    );
    expect(parseSse(await (await watch(app, id, { last: n - 1 })).text())).toEqual([]);
  });

  test('a cursor that isn’t a number is bad_input', async () => {
    const { app } = setup(heldModel().llm);
    const id = await startRun(app);
    const res = await app.request(`/api/v1/agent/runs/${id}?from=x`, {
      headers: { accept: 'text/event-stream' },
    });
    expect(res.status).toBe(400);
    await stop(app, id);
  });

  test('a heartbeat wakes viewers from the one job, and carries no id', async () => {
    const m = heldModel();
    const { app } = setup(m.llm, { opts: { heartbeatMs: 10 } });
    const id = await startRun(app);
    const v = viewer(await watch(app, id));
    await until(() => v.seen.some((e) => e.event === 'heartbeat'), 'a heartbeat');
    expect(v.seen.find((e) => e.event === 'heartbeat')?.id).toBeUndefined();
    await stop(app, id);
    await v.ended;
    expect(ids(noBeats(v.seen))).toEqual(range(0, noBeats(v.seen).length));
  });

  test('a store that refuses events: the viewer still gets them, and no `done` is made up', async () => {
    const m = heldModel();
    const store = openStore(':memory:');
    const real = sqliteRunStore(store);
    let refuse = false;
    const runs: RunStore = {
      ...real,
      append: (id, e) => (refuse ? Promise.reject(new Error('disk full')) : real.append(id, e)),
    };
    const { app } = setup(m.llm, { store, runs });
    const res = await post(app);
    const v = viewer(res);
    await v.has(2);
    refuse = true;
    (await m.call(0)).give(answer());
    await v.ended;
    expect(names(v.seen)).toEqual(['run', 'stage', 'message', 'done']);
    expect(v.seen[2]?.id).toBeUndefined();
    expect((await real.get(runIdOf(v.seen)))?.status).toBe('running');
  });
});

describe('the thread saves as it grows', () => {
  test('after the model’s answer and after each tool, before the chat ends', async () => {
    const m = heldModel();
    const { app, runs } = setup(m.llm);
    const id = await startRun(app);
    (await m.call(0)).give(answer({ content: 'looking', tool: 'list_networks' }));
    await m.call(1);
    const thread = await runs.thread?.(id);
    expect(thread?.map((t) => t.role)).toEqual(['user', 'assistant', 'tool']);
    expect(thread?.[2]).toMatchObject({ tool_call_id: 'call_1' });
    expect(thread?.[2]?.content).toContain('near-validators');
    await stop(app, id);
  });
});

describe('Stop', () => {
  test('mid model call: the call is aborted, the run says stopped, and the spend is settled', async () => {
    const m = heldModel();
    const { app, store } = setup(m.llm);
    const id = await startRun(app);
    (await m.call(0)).give(answer({ tool: 'list_networks' }));
    const second = await m.call(1);
    expect(store.ledger.get(DAY).reserved_usd).toBeGreaterThan(0);

    const said = await stop(app, id);
    expect(said).toMatchObject({
      status: 200,
      body: { run_id: id, status: 'stopped', stopped: true, already_finished: false },
    });
    expect(second.signal?.aborted).toBe(true);
    const run = await read(app, id);
    expect(run.status).toBe('stopped');
    expect(run.events.slice(-2).map((e) => e.event)).toEqual(['error', 'done']);
    expect(run.events.at(-2)).toEqual({
      event: 'error',
      data: { code: 'stopped', message: STOPPED },
    });
    // what was used, what the aborted call said it cost, and nothing still held
    const done = run.events.at(-1);
    expect(done?.event === 'done' && done.data.cost_usd).toBeCloseTo(COST + 0.002, 9);
    expect(store.ledger.get(DAY).reserved_usd).toBe(0);
    expect(store.ledger.get(DAY).usd).toBeCloseTo(COST + 0.002, 9);
    expect(m.calls).toHaveLength(2);
  });

  test('mid tool: the tool’s own fetch is aborted, and the thread stays whole', async () => {
    let sawClose = () => {};
    const closed = new Promise<void>((r) => {
      sawClose = r;
    });
    const server: Server = createServer((req) => {
      req.socket.on('close', sawClose);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    const registry = fakeRegistry().registry.map((t) =>
      t.name === 'list_networks'
        ? {
            ...t,
            run: async () => {
              await fetch(url, { signal: runSignal(AbortSignal.timeout(5000)) });
              return {};
            },
          }
        : t,
    );
    const m = heldModel();
    const { app, runs } = setup(m.llm, { opts: { registry } });
    const id = await startRun(app);
    (await m.call(0)).give(answer({ tool: 'list_networks' }));
    await until(
      async () => (await read(app, id)).events.some((e) => e.event === 'tool_call'),
      'tool',
    );
    await new Promise((r) => setTimeout(r, 30));

    expect((await stop(app, id)).body).toMatchObject({ status: 'stopped', stopped: true });
    await closed;
    server.close();
    const run = await read(app, id);
    expect(run.events.find((e) => e.event === 'tool_result')?.data).toMatchObject({ ok: false });
    expect(m.calls).toHaveLength(1);
    // every call answered, so a follow-up's model call is valid
    expect((await runs.thread?.(id))?.map((t) => t.role)).toEqual(['user', 'assistant', 'tool']);
  });

  test('a client that ignores the signal: Stop doesn’t hang, and the hold stands until it answers', async () => {
    const m = heldModel({ ignoreStop: true });
    const { app, store } = setup(m.llm);
    const id = await startRun(app);
    const call = await m.call(0);
    expect((await stop(app, id)).body).toMatchObject({ status: 'stopped', stopped: true });
    expect(store.ledger.get(DAY).reserved_usd).toBeGreaterThan(0);
    call.give(answer());
    await until(() => store.ledger.get(DAY).reserved_usd === 0, 'the hold settles');
    expect(store.ledger.get(DAY).usd).toBeCloseTo(COST, 9);
  });

  test('after the end it says it had already finished; a second Stop says the same', async () => {
    const m = heldModel();
    const { app } = setup(m.llm);
    const id = await startRun(app);
    (await m.call(0)).give(answer());
    await until(async () => (await read(app, id)).status === 'done', 'the run ends');
    expect((await stop(app, id)).body).toMatchObject({
      status: 'done',
      stopped: false,
      already_finished: true,
    });

    const other = await startRun(app);
    await m.call(1);
    expect((await stop(app, other)).body).toMatchObject({ stopped: true });
    expect((await stop(app, other)).body).toMatchObject({
      status: 'stopped',
      stopped: false,
      already_finished: true,
    });
  });

  test('Stop crossing the last answer: it reports how the run really ended, either way', async () => {
    const m = heldModel({ ignoreStop: true });
    const { app } = setup(m.llm);
    const id = await startRun(app);
    (await m.call(0)).give(answer());
    const said = await stop(app, id);
    expect(['done', 'stopped']).toContain(said.body.status);
    expect(said.body.stopped).toBe(said.body.status === 'stopped');
    expect(said.body.already_finished).toBe(said.body.status === 'done');
  });

  test('unknown and malformed ids', async () => {
    const { app } = setup(heldModel().llm);
    expect((await stop(app, 'nosuchrun1')).status).toBe(404);
    expect((await stop(app, 'a.b')).status).toBe(400);
  });

  test('a stopped run takes a follow-up, with the work so far', async () => {
    const m = heldModel();
    const { app } = setup(m.llm);
    const id = await startRun(app);
    (await m.call(0)).give(answer({ tool: 'list_networks' }));
    await m.call(1);
    await stop(app, id);
    const next = post(app, { messages: [{ role: 'user', content: 'go on' }], run_id: id });
    const asked = await m.call(2);
    asked.give(answer({ content: 'went on' }));
    expect(names(parseSse(await (await next).text())).at(-1)).toBe('done');
    expect(asked.req.messages.map((x) => x.role).slice(1)).toEqual([
      'user',
      'assistant',
      'tool',
      'user',
    ]);
    expect((await read(app, id)).status).toBe('done');
  });
});

describe('the boot scan', () => {
  const REPO = fileURLToPath(new URL('../../../', import.meta.url));
  afterEach(() => vi.unstubAllEnvs());

  test('a restart: `interrupted`, a plain error, no hold left, and a follow-up has the work so far', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const stateDir = join(tmpRoot(), '.petal');
    const m = heldModel();
    const dead = buildPetalApp({ root: REPO, fake: true, stateDir }, { llm: m.llm });
    const id = await startRun(dead);
    (await m.call(0)).give(answer({ content: 'looking', tool: 'list_networks' }));
    const inFlight = await m.call(1);
    const db = openStore(join(stateDir, 'private.db'));
    expect(db.ledger.get(DAY).reserved_usd).toBeGreaterThan(0);

    // the process is gone: its app never hears another thing
    const again = heldModel();
    const app = buildPetalApp({ root: REPO, fake: true, stateDir }, { llm: again.llm });
    expect(inFlight.signal?.aborted).toBe(false);
    const run = await read(app, id);
    expect(run.status).toBe('interrupted');
    expect(run.events.at(-1)).toEqual({
      event: 'error',
      data: { code: 'interrupted', message: INTERRUPTED },
    });
    expect(names(parseSse(await (await watch(app, id)).text())).at(-1)).toBe('error');
    expect(db.ledger.get(DAY)).toMatchObject({ reserved_usd: 0 });
    expect(db.ledger.get(DAY).usd).toBeCloseTo(COST, 9);
    expect(again.calls).toHaveLength(0); // nothing was resumed

    const before = run.events.length;
    const next = post(app, { messages: [{ role: 'user', content: 'carry on' }], run_id: id });
    const asked = await again.call(0);
    expect(asked.req.messages.map((x) => x.role).slice(1)).toEqual([
      'user',
      'assistant',
      'tool',
      'user',
    ]);
    expect(asked.req.messages[3]?.content).toContain('networks');
    asked.give(answer({ content: 'carried on' }));
    const two = parseSse(await (await next).text());
    expect(ids(two)).toEqual(range(before, two.length));
    expect((await read(app, id)).status).toBe('done');
    log.mockRestore();
  });

  test('a process that is only building the app leaves a live server’s runs alone', async () => {
    const live = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)']);
    const store = openStore(join(tmpRoot(), 'private.db'));
    const runs = sqliteRunStore(store);
    const id = await runs.create(QUESTION as ChatInput);
    store.ledger.reserve(DAY, 0.05, 3);
    store.meta.set('runs_pid', String(live.pid));
    const log = vi.fn();
    expect(interruptRuns(store, log)).toEqual({ interrupted: 0, releasedUsd: 0 });
    expect(log.mock.calls.flat().join()).toContain(String(live.pid));
    expect((await runs.get(id))?.status).toBe('running');
    expect(store.ledger.get(DAY).reserved_usd).toBe(0.05);

    // once that process is gone, the next boot does scan
    await new Promise((r) => {
      live.once('exit', r);
      live.kill('SIGKILL');
    });
    expect(interruptRuns(store, log)).toEqual({ interrupted: 1, releasedUsd: 0.05 });
    expect((await runs.get(id))?.status).toBe('interrupted');
    expect(store.ledger.get(DAY).reserved_usd).toBe(0);
  });

  test('PETAL_RUN_MAX_S sets the limit; a run past it ends, and says so', async () => {
    vi.stubEnv('PETAL_RUN_MAX_S', '0.05');
    const stateDir = join(tmpRoot(), '.petal');
    const m = heldModel();
    const app = buildPetalApp({ root: REPO, fake: true, stateDir }, { llm: m.llm });
    const id = await startRun(app);
    await until(async () => (await read(app, id)).status !== 'running', 'the limit');
    expect(JSON.stringify((await read(app, id)).events)).toContain('ran past its 0.05 s');
  });
});

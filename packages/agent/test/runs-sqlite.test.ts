// T189: runs in the private store. A restart mid-run loses nothing, viewers can reconnect by cursor,
// owners stay out of what readers see, and the old files come over once.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentEvent, ChatMessage, Run } from '@petal/core/types';
import { openStore, type Store } from '@petal/store';
import { describe, expect, test, vi } from 'vitest';
import { importLedgerFile, storeLedger } from '../src/budget.ts';
import { DEFAULT_BUDGET } from '../src/llm.ts';
import { startRun } from '../src/run.ts';
import { fileRunStore, importRunFiles, type RunStore, sqliteRunStore } from '../src/runs.ts';
import {
  agreed,
  fakeContext,
  fakeRegistry,
  fakeSignature,
  INTERPRETATION,
  SPEC,
  scriptedLlm,
  tmpRoot,
  VIEW_URL,
} from './helpers.ts';

const QUESTION = agreed('who stands behind NEAR’s validators?') as ChatMessage[];
const message = (text: string): AgentEvent => ({ event: 'message', data: { text } });
const COST = 0.001;

/** A whole chat that draws a flower: five paid model calls, four rounds of tools. */
const skeleton = () =>
  scriptedLlm(
    [
      { calls: [{ name: 'get_snapshot', args: { network: 'near-validators' } }] },
      { calls: [{ name: 'propose_spec', args: { network: 'near-validators' } }] },
      {
        calls: [{ name: 'validate_spec', args: { spec: SPEC, interpretation: INTERPRETATION } }],
        signature: fakeSignature('c3'),
      },
      { calls: [{ name: 'render_flower', args: { spec: SPEC } }] },
      { content: `Here it is: ${VIEW_URL}`, signature: fakeSignature('c5') },
    ],
    { costUsd: COST },
  );

describe('a restart mid-run', () => {
  /**
   * Plays a whole chat, keeping its events the way the routes do. `restart` runs after each tool
   * result, between one model call and the next.
   */
  async function play(
    open: () => { runs: RunStore; store: Store },
    restart: (kept: AgentEvent[], runId: string) => Promise<void>,
  ) {
    let cur = open();
    const runId = await cur.runs.create({ messages: QUESTION });
    const today = () => new Date().toISOString().slice(0, 10);
    const budget = {
      ...DEFAULT_BUDGET,
      usdPerChat: 1,
      // the current connection on every call, as a restarted server would have
      ledger: {
        spentToday: () => storeLedger(cur.store).spentToday(),
        add: (usd: number) => storeLedger(cur.store).add(usd),
        reserve: (usd: number, cap: number) => storeLedger(cur.store).reserve(usd, cap),
        settle: (h: { day: string; usd: number }, usd: number) =>
          storeLedger(cur.store).settle(h, usd),
      },
    };
    const kept: AgentEvent[] = [];
    for await (const e of startRun(
      { messages: QUESTION },
      { tools: fakeContext(), llm: skeleton(), budget },
      {
        registry: fakeRegistry().registry,
        runId,
        heartbeatMs: 60_000,
        onThread: (t) => cur.runs.saveThread?.(runId, t),
      },
    )) {
      await cur.runs.append(runId, e);
      kept.push(e);
      if (e.event === 'tool_result') {
        cur.store.close();
        cur = open();
        await restart(kept, runId);
      }
    }
    return { ...cur, runId, kept, day: today() };
  }

  test('reopening the database after every tool round loses nothing', async () => {
    const path = join(tmpRoot(), 'private.db');
    const open = () => {
      const store = openStore(path);
      return { store, runs: sqliteRunStore(store) };
    };
    let restarts = 0;
    const end = await play(open, async (kept, runId) => {
      restarts++;
      const check = open();
      // everything so far is there, in order, each event once
      expect((await check.runs.get(runId))?.events).toEqual(kept);
      const log = await check.runs.eventsFrom?.(runId);
      expect(log?.map((x) => x.seq)).toEqual(kept.map((_, i) => i));
      // and the money: every finished call is recorded
      const paid = kept.filter((e) => e.event === 'tool_result').length;
      expect(
        check.store.ledger.get(new Date().toISOString().slice(0, 10)).usd,
      ).toBeGreaterThanOrEqual(paid * COST - 1e-9);
      check.store.close();
    });
    expect(restarts).toBe(4);

    const run = (await end.runs.get(end.runId)) as Run;
    expect(run.status).toBe('done');
    expect(run.events).toEqual(end.kept);
    expect(run.events.map((e) => e.event)).toContain('flower');
    expect(run.flower?.view_url).toBe(VIEW_URL);
    expect(run.messages.at(-1)).toEqual({
      role: 'assistant',
      content: `Here it is: ${VIEW_URL}`,
    });
    expect(run.draft?.entry?.provenance?.agent?.signature?.completion_id).toBe('c3');
    expect(end.store.ledger.get(end.day).usd).toBeCloseTo(5 * COST, 9);
    expect(end.store.ledger.get(end.day).reserved_usd).toBeCloseTo(0, 9);
    const thread = await end.runs.thread?.(end.runId);
    expect(thread?.filter((m) => m.role === 'tool')).toHaveLength(4);

    // a follow-up, after yet another restart, carries on the same log
    end.store.close();
    const later = open();
    const events = run.events.length;
    expect(await later.runs.create({ messages: QUESTION, run_id: end.runId })).toBe(end.runId);
    await later.runs.append(end.runId, message('more'));
    const next = await later.runs.eventsFrom?.(end.runId, events);
    expect(next).toEqual([{ seq: events, event: message('more') }]);
    later.store.close();
  });

  test('the same chat with no restart gives the same events', async () => {
    const store = openStore(':memory:');
    const steady = await play(
      () => ({ store: { ...store, close: () => {} }, runs: sqliteRunStore(store) }),
      async () => {},
    );
    const path = join(tmpRoot(), 'private.db');
    const restarted = await play(
      () => {
        const s = openStore(path);
        return { store: s, runs: sqliteRunStore(s) };
      },
      async () => {},
    );
    expect(restarted.kept.map((e) => e.event)).toEqual(steady.kept.map((e) => e.event));
  });
});

describe('sqliteRunStore', () => {
  const fresh = () => {
    const store = openStore(':memory:');
    return { store, runs: sqliteRunStore(store) };
  };

  test('events are numbered like their place in Run.events, and read by cursor', async () => {
    const { runs } = fresh();
    const id = await runs.create({ messages: QUESTION });
    for (const t of ['a', 'b', 'c']) await runs.append(id, message(t));
    await runs.append(id, { event: 'heartbeat', data: {} });
    expect((await runs.eventsFrom(id)).map((x) => x.seq)).toEqual([0, 1, 2]);
    expect(await runs.eventsFrom(id, 2)).toEqual([{ seq: 2, event: message('c') }]);
    expect(await runs.eventsFrom(id, 3)).toEqual([]);
    expect(await runs.eventsFrom('nothere1')).toEqual([]);
    const run = (await runs.get(id)) as Run;
    expect(run.events[2]).toEqual(message('c'));
  });

  test('appends from many events at once get one number each', async () => {
    const { runs } = fresh();
    const id = await runs.create({ messages: QUESTION });
    await Promise.all(Array.from({ length: 30 }, (_, i) => runs.append(id, message(String(i)))));
    const log = await runs.eventsFrom(id);
    expect(log.map((x) => x.seq)).toEqual(Array.from({ length: 30 }, (_, i) => i));
    expect(log.map((x) => x.event)).toEqual(
      Array.from({ length: 30 }, (_, i) => message(String(i))),
    );
  });

  test('an owner is optional, listed by owner, and never part of what a reader sees', async () => {
    const { runs } = fresh();
    const mine = await runs.create({ messages: QUESTION }, { owner: 'person-1' });
    const free = await runs.create({ messages: QUESTION });
    expect(await runs.ownerOf(mine)).toBe('person-1');
    expect(await runs.ownerOf(free)).toBeNull();
    expect(JSON.stringify(await runs.get(mine))).not.toContain('person-1');

    expect((await runs.listByOwner('person-1')).map((r) => r.run_id)).toEqual([mine]);
    expect(await runs.setOwner(free, 'person-1')).toBe(true);
    expect(await runs.setOwner(free, 'person-2')).toBe(false);
    const listed = await runs.listByOwner('person-1');
    expect(listed.map((r) => r.run_id).sort()).toEqual([mine, free].sort());
    expect(listed[0]).toEqual({
      run_id: expect.any(String),
      status: 'running',
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });
    // an anonymous handle's run moves to the person who claims it
    expect(await runs.setOwner(free, 'person-2', 'person-1')).toBe(true);
    expect(await runs.listByOwner('nobody')).toEqual([]);
  });

  test('a run keeps its owner when it is continued', async () => {
    const { runs } = fresh();
    const id = await runs.create({ messages: QUESTION }, { owner: 'person-1' });
    await runs.create({ messages: QUESTION, run_id: id });
    expect(await runs.ownerOf(id)).toBe('person-1');
  });

  test('the thread: saved, replaced, read back; none is null', async () => {
    const { runs } = fresh();
    const id = await runs.create({ messages: QUESTION });
    expect(await runs.thread(id)).toBeNull();
    await runs.saveThread(id, [{ role: 'user', content: 'a' }]);
    await runs.saveThread(id, [{ role: 'user', content: 'b' }]);
    expect(await runs.thread(id)).toEqual([{ role: 'user', content: 'b' }]);
    expect(await runs.thread('../../etc')).toBeNull();
  });
});

describe('the old files', () => {
  /** A folder written by the real fileRunStore: the fixture is what it really left behind. */
  async function oldFolder() {
    const dir = join(tmpRoot(), 'runs');
    const old = fileRunStore(dir);
    const id = await old.create({ messages: QUESTION });
    await old.append(id, {
      event: 'run',
      data: { run_id: id, resume_url: `/make?run=${id}` },
    });
    await old.append(id, message('here'));
    await old.append(id, {
      event: 'done',
      data: {
        turns: 1,
        model: 'z-ai/glm-5.3-flash',
        fallback_used: false,
        tokens: { in: 1, out: 1 },
        cost_usd: 0,
      },
    });
    await old.saveThread?.(id, [{ role: 'user', content: 'q' }]);
    return { dir, old, id };
  }

  test('come over whole, once, and stay where they are', async () => {
    const { dir, old, id } = await oldFolder();
    const before = readFileSync(join(dir, `${id}.json`), 'utf8');
    const store = openStore(':memory:');
    const lines: string[] = [];
    expect(importRunFiles(store, dir, (l) => lines.push(l))).toEqual({ imported: 1, skipped: 0 });
    expect(lines).toHaveLength(1);

    const runs = sqliteRunStore(store);
    expect(await runs.get(id)).toEqual(await old.get(id));
    expect(await runs.thread(id)).toEqual([{ role: 'user', content: 'q' }]);
    expect((await runs.eventsFrom(id)).map((x) => x.seq)).toEqual([0, 1, 2]);
    expect(store.run.get(id)?.model).toBe('z-ai/glm-5.3-flash');
    expect(readFileSync(join(dir, `${id}.json`), 'utf8')).toBe(before);

    // a run in the store is carried on from there, and a second boot brings nothing over again
    await runs.append(id, message('later'));
    writeFileSync(
      join(dir, 'newer00001.json'),
      JSON.stringify({ ...(await old.get(id)), run_id: 'newer00001' }),
    );
    expect(importRunFiles(store, dir, (l) => lines.push(l))).toEqual({ imported: 0, skipped: 0 });
    expect(await runs.get('newer00001')).toBeNull();
    expect((await runs.get(id))?.events).toHaveLength(4);
    expect(lines).toHaveLength(1);
  });

  test('what isn’t a run is skipped and counted, and never stops the boot', async () => {
    const { dir, id } = await oldFolder();
    writeFileSync(join(dir, 'broken0001.json'), '{ not json');
    writeFileSync(join(dir, 'wrongid001.json'), JSON.stringify({ run_id: 'another', events: [] }));
    writeFileSync(
      join(dir, 'badevent01.json'),
      JSON.stringify({
        run_id: 'badevent01',
        status: 'done',
        messages: [],
        events: [{ nope: 1 }],
        created_at: 'a',
        updated_at: 'a',
      }),
    );
    writeFileSync(join(dir, '.half.123.tmp'), 'partial');
    writeFileSync(join(dir, 'notes.txt'), 'hello');
    mkdirSync(join(dir, 'folder0001.json'));
    const store = openStore(':memory:');
    const lines: string[] = [];
    expect(importRunFiles(store, dir, (l) => lines.push(l))).toEqual({ imported: 1, skipped: 4 });
    expect(lines[0]).toMatch(/imported 1 runs.*skipped 4/);
    expect(store.run.get(id)).not.toBeNull();
    expect(store.run.get('badevent01')).toBeNull();
  });

  test('a thread that isn’t a list is left out, and the run still comes over', async () => {
    const { dir, id } = await oldFolder();
    writeFileSync(join(dir, `${id}.thread.json`), '{ not json');
    const store = openStore(':memory:');
    importRunFiles(store, dir, () => {});
    expect(store.run.get(id)).not.toBeNull();
    expect(store.runThread.get(id)).toBeNull();
  });

  test('no folder: nothing to do, nothing printed, and it is not looked for again', () => {
    const store = openStore(':memory:');
    const log = vi.fn();
    expect(importRunFiles(store, join(tmpRoot(), 'none'), log)).toEqual({
      imported: 0,
      skipped: 0,
    });
    expect(log).not.toHaveBeenCalled();
    expect(store.meta.get('runs_imported_at')).not.toBeNull();
  });

  test('an interrupted import brings nothing in, and the next boot tries again', async () => {
    const { dir, id } = await oldFolder();
    const store = openStore(':memory:');
    const spy = vi.spyOn(store.meta, 'set').mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    expect(() => importRunFiles(store, dir, () => {})).toThrow('disk full');
    expect(store.run.get(id)).toBeNull();
    spy.mockRestore();
    expect(importRunFiles(store, dir, () => {})).toEqual({ imported: 1, skipped: 0 });
  });

  test('today’s old ledger figure carries over, so moving can’t reset the cap', () => {
    const root = tmpRoot();
    const path = join(root, 'llm-ledger.json');
    writeFileSync(path, JSON.stringify({ day: '2026-11-05', usd: 1.25 }));
    const store = openStore(':memory:');
    importLedgerFile(store, path);
    expect(store.ledger.get('2026-11-05').usd).toBe(1.25);
    // the store is the truth from here on
    store.ledger.add('2026-11-05', 0.5);
    importLedgerFile(store, path);
    expect(store.ledger.get('2026-11-05').usd).toBeCloseTo(1.75, 9);
    expect(readFileSync(path, 'utf8')).toContain('1.25');
    importLedgerFile(store, join(root, 'none.json'));
    writeFileSync(path, 'not json');
    importLedgerFile(store, path);
  });
});

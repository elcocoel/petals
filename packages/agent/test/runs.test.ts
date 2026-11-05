// T058: fileRunStore and the daily ledger.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentEvent } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { fileLedger, memoryLedger, serverBudget } from '../src/budget.ts';
import { fileRunStore } from '../src/index.ts';
import { DEFAULT_BUDGET } from '../src/llm.ts';
import {
  fakeSignature,
  INTERPRETATION,
  RENDER_SHA,
  SPEC,
  SPEC_SHA,
  tmpRoot,
  VIEW_URL,
} from './helpers.ts';

const flower: AgentEvent = {
  event: 'flower',
  data: {
    spec: SPEC,
    spec_sha256: SPEC_SHA,
    render_sha256: RENDER_SHA,
    view_url: VIEW_URL,
    legend: [],
    interpretation: INTERPRETATION as never,
    validation: { valid: true, errors: [], warnings: [] },
  },
};
const done: AgentEvent = {
  event: 'done',
  data: {
    turns: 3,
    model: 'z-ai/glm-5.3-flash',
    fallback_used: false,
    tokens: { in: 1, out: 1 },
    cost_usd: 0,
  },
};
const runEvent = (id: string): AgentEvent => ({
  event: 'run',
  data: { run_id: id, resume_url: `/make?run=${id}` },
});

describe('fileRunStore', () => {
  test('a run in .petal/runs/<id>.json: messages, events, flower, a draft entry, status', async () => {
    const dir = join(tmpRoot(), 'runs');
    const runs = fileRunStore(dir);
    const id = await runs.create({ messages: [{ role: 'user', content: 'q' }] });
    expect(id).toMatch(/^[0-9a-f]{24}$/);
    expect((await runs.get(id))?.status).toBe('running');
    for (const e of [
      runEvent(id),
      { event: 'heartbeat', data: {} },
      { event: 'message', data: { text: 'here' } },
      flower,
      { event: 'signature', data: fakeSignature('c3') },
      done,
    ] as AgentEvent[]) {
      await runs.append(id, e);
    }
    const run = await runs.get(id);
    expect(run?.status).toBe('done');
    expect(run?.events.map((e) => e.event)).toEqual([
      'run',
      'message',
      'flower',
      'signature',
      'done',
    ]);
    expect(run?.messages).toEqual([
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'here' },
    ]);
    expect(run?.flower?.view_url).toBe(VIEW_URL);
    expect(run?.draft?.spec).toEqual(SPEC);
    expect(run?.draft?.entry).toMatchObject({
      petal: 'flower/v2',
      spec_sha256: SPEC_SHA,
      provenance: {
        agent: {
          kind: 'petal-agent',
          model: 'z-ai/glm-5.3-flash',
          signature: { completion_id: 'c3' },
        },
      },
    });
    expect(run?.draft?.entry?.provenance).not.toHaveProperty('maker');
    const onDisk = JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8'));
    expect(onDisk).toEqual(run);
    // a second store on the same folder (another process) sees the same run
    expect(await fileRunStore(dir).get(id)).toEqual(run);
  });

  test('an error with no flower fails the run; a flower despite an error still counts', async () => {
    const runs = fileRunStore(join(tmpRoot(), 'runs'));
    const a = await runs.create({ messages: [{ role: 'user', content: 'q' }] });
    for (const e of [
      runEvent(a),
      { event: 'error', data: { code: 'source_failed', message: 'x' } },
      done,
    ] as AgentEvent[]) {
      await runs.append(a, e);
    }
    expect((await runs.get(a))?.status).toBe('failed');
    const b = await runs.create({ messages: [{ role: 'user', content: 'q' }] });
    for (const e of [
      runEvent(b),
      flower,
      { event: 'error', data: { code: 'budget_exhausted', message: 'x' } },
      done,
    ] as AgentEvent[]) {
      await runs.append(b, e);
    }
    expect((await runs.get(b))?.status).toBe('done');
  });

  test('create with run_id continues that run: same id, the full messages, running again', async () => {
    const runs = fileRunStore(join(tmpRoot(), 'runs'));
    const id = await runs.create({ messages: [{ role: 'user', content: 'q1' }] });
    await runs.append(id, runEvent(id));
    await runs.append(id, done);
    const messages = [
      { role: 'user' as const, content: 'q1' },
      { role: 'user' as const, content: 'q2' },
    ];
    expect(await runs.create({ messages, run_id: id })).toBe(id);
    const run = await runs.get(id);
    expect(run?.status).toBe('running');
    expect(run?.messages).toEqual(messages);
    expect(run?.events).toHaveLength(2);
    // an unknown run_id makes a new run
    expect(await runs.create({ messages, run_id: 'nothere1' })).not.toBe('nothere1');
  });

  test('appends from many events at once land in order', async () => {
    const runs = fileRunStore(join(tmpRoot(), 'runs'));
    const id = await runs.create({ messages: [{ role: 'user', content: 'q' }] });
    await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        runs.append(id, { event: 'message', data: { text: String(i) } }),
      ),
    );
    const run = await runs.get(id);
    expect(run?.messages.slice(1).map((m) => m.content)).toEqual(
      Array.from({ length: 30 }, (_, i) => String(i)),
    );
  });

  test('ids that are not file names are refused', async () => {
    const runs = fileRunStore(join(tmpRoot(), 'runs'));
    expect(await runs.get('../../etc/passwd')).toBeNull();
    expect(await runs.get('nosuchrun')).toBeNull();
    await expect(runs.append('nosuchrun', done)).rejects.toThrow(/no run/);
  });
});

describe('ledgers', () => {
  test('the file ledger adds up across instances and starts again each UTC day', async () => {
    const path = join(tmpRoot(), 'llm-ledger.json');
    let now = new Date('2026-11-04T23:00:00Z');
    const a = fileLedger(path, () => now);
    await Promise.all([a.add(0.01), a.add(0.02)]);
    expect(await fileLedger(path, () => now).spentToday()).toBeCloseTo(0.03, 9);
    now = new Date('2026-11-05T00:30:00Z');
    expect(await a.spentToday()).toBe(0);
    await a.add(0.5);
    expect(await a.spentToday()).toBeCloseTo(0.5, 9);
  });

  test('the memory ledger rolls over too', async () => {
    let now = new Date('2026-11-04T10:00:00Z');
    const l = memoryLedger(() => now);
    await l.add(2);
    expect(await l.spentToday()).toBe(2);
    now = new Date('2026-11-05T10:00:00Z');
    expect(await l.spentToday()).toBe(0);
  });

  test('serverBudget: the per-chat limits stay, the daily cap comes from the config', () => {
    const ledger = memoryLedger();
    expect(serverBudget(DEFAULT_BUDGET, { usdPerDay: 1.5, ledger })).toMatchObject({
      toolRounds: 8,
      wallSeconds: 120,
      usdPerChat: 0.05,
      usdPerDay: 1.5,
    });
    expect(serverBudget(DEFAULT_BUDGET, { usdPerDay: Number.NaN, ledger }).usdPerDay).toBe(3);
    expect(serverBudget(DEFAULT_BUDGET, { ledger }).usdPerDay).toBe(3);
  });
});

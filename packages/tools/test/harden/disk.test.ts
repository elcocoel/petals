// T300, finding 1: a stranger can't fill the disk. Sizes are checked before anything is kept, what
// nobody claims goes away, and past the data budget a stranger's writes are refused in plain words.
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAP_LIMITS } from '@petal/near/map';
import { openStore } from '@petal/store';
import { beforeEach, describe, expect, test } from 'vitest';
import { httpApp } from '../../src/http/app.ts';
import { callTool } from '../../src/registry.ts';
import type { ToolContext } from '../../src/types.ts';
import { flow, NOW, rig, type TestRig } from '../helpers.ts';

// biome-ignore lint/suspicious/noExplicitAny: walking tool outputs
type Out = Record<string, any>;

let r: TestRig;
let f: Awaited<ReturnType<typeof flow>>;

const run = async (name: string, input: unknown, ctx: ToolContext = r.ctx) =>
  (await callTool(name, input, ctx)) as Out;
const person = (subject: string): ToolContext => ({ ...r.ctx, caller: { subject, door: 'test' } });
const limits = (l: Record<string, number>) => {
  (r.ctx.config as Out).limits = l;
};
/** The private store, as a second connection on the same file. */
const db = () => openStore(join(r.stateDir, 'private.db'));
const later = (days: number) => new Date(Date.parse(NOW) + days * 86_400_000).toISOString();

beforeEach(async () => {
  r = await rig();
  f = await flow((name, input) => run(name, input));
});

describe('a prepared draft', () => {
  test('an entry over the map limit is refused before anything is kept', async () => {
    const pad = 'a'.repeat(MAP_LIMITS.valueBytes);
    const entry = {
      ...f.draft,
      interpretation: {
        ...f.draft.interpretation,
        summary: `${f.draft.interpretation.summary} ${pad}`,
      },
    };
    const out = await run('prepare_publish', { entry });
    expect(out.error?.code).toBe('bad_input');
    expect(out.error?.message).toMatch(new RegExp(`over ${MAP_LIMITS.valueBytes} bytes`));
    const s = db();
    expect(await s.publishDraft.get(out.entry_sha256 ?? '')).toBeNull();
    await s.close();
    const size = statSync(join(r.stateDir, 'private.db')).size;
    expect(size).toBeLessThan(MAP_LIMITS.valueBytes);
  });

  test('a new draft clears the expired ones', async () => {
    const first = await run('prepare_publish', { entry: f.draft });
    expect(first.entry_sha256).toBeTruthy();
    r.clock.set('2031-01-01T00:00:00.000Z');
    const entry = { ...f.draft, title: 'a later flower' };
    const second = await run('prepare_publish', { entry });
    expect(second.entry_sha256).toBeTruthy();
    const s = db();
    expect(await s.publishDraft.get(first.entry_sha256)).toBeNull();
    expect(await s.publishDraft.get(second.entry_sha256)).toBeTruthy();
    await s.close();
  });
});

describe('explorations with nobody behind them', () => {
  test('the note cap holds on every path, the same spec with a note included', async () => {
    const start = await run('start_exploration', { question: 'mine' }, person('prs_a'));
    const id = start.exploration as string;
    const owner = person('prs_a');
    await run('save_step', { exploration: id, spec: f.spec }, owner);
    let refused: Out | undefined;
    for (let i = 0; i < 101 && !refused; i++) {
      // the same spec as the head, with a note: no new step, so only the note cap can stop it
      const out = await run('save_step', { exploration: id, spec: f.spec, note: `n${i}` }, owner);
      if (out.error) refused = out;
    }
    expect(refused?.error.code).toBe('bad_input');
    expect(refused?.error.message).toMatch(/100 notes/);
    expect((await run('add_note', { exploration: id, text: 'one more' }, owner)).error?.code).toBe(
      'bad_input',
    );
  });

  test('a fork copies at most the caps, even from one that holds more', async () => {
    const big = await run('start_exploration', { question: 'from before the caps' });
    const s = db();
    for (let i = 0; i < 150; i++) {
      await s.note.append({
        exploration: big.exploration,
        author: 'link:x',
        text: `n${i}`,
        at: NOW,
      });
    }
    const fork = await run('start_exploration', { fork_of: big.link.url });
    expect(await s.note.count(fork.exploration)).toBe(100);
    expect((await s.note.list(fork.exploration)).at(-1)?.text).toBe('n149');
    await s.close();
  });

  test('one nobody claimed goes away after the expiry; a claimed one stays', async () => {
    const dropped = await run('start_exploration', { question: 'nobody came back' });
    await run('save_step', { exploration: dropped.link.url, spec: f.spec, note: 'a note' });
    await run('add_note', { exploration: dropped.link.url, text: 'another' });
    const kept = await run(
      'start_exploration',
      { question: 'somebody came back' },
      person('prs_a'),
    );

    r.clock.set(later(15));
    expect((await run('start_exploration', { question: 'a new one' })).owned).toBe(false);

    const out = await run('get_exploration', { exploration: dropped.link.url });
    expect(out.error?.code).toBe('not_found');
    expect(
      (await run('get_exploration', { exploration: kept.exploration }, person('prs_a'))).question,
    ).toBe('somebody came back');
    const s = db();
    expect(await s.step.count(dropped.exploration)).toBe(0);
    expect(await s.note.count(dropped.exploration)).toBe(0);
    expect(await s.exploration.get(dropped.exploration)).toBeNull();
    await s.close();
  });

  test('one still being worked on is not expired', async () => {
    const live = await run('start_exploration', { question: 'in use' });
    r.clock.set(later(10));
    await run('add_note', { exploration: live.link.url, text: 'still here' });
    r.clock.set(later(20));
    await run('start_exploration', { question: 'another' });
    expect((await run('get_exploration', { exploration: live.link.url })).question).toBe('in use');
  });
});

describe('the data budget', () => {
  /** A folder over budget: 2 MB of files in the snapshot cache, with a 1 MB budget. */
  function overBudget() {
    limits({ dataMaxMb: 1 });
    const cache = join(r.stateDir, 'cache');
    mkdirSync(cache, { recursive: true });
    writeFileSync(join(cache, 'big.json.gz'), Buffer.alloc(2 * 1024 * 1024));
    r.clock.set(later(1)); // past any brief cache
  }

  test('writes a stranger can cause are refused, in plain words', async () => {
    const e = await run('start_exploration', { question: 'before' });
    overBudget();
    for (const [name, input] of [
      ['prepare_publish', { entry: f.draft }],
      ['start_exploration', { question: 'after' }],
      ['save_step', { exploration: e.link.url, spec: f.spec }],
      ['add_note', { exploration: e.link.url, text: 'a note' }],
    ] as const) {
      const out = await run(name, input);
      expect(out.error?.code, name).toBe('budget_exhausted');
      expect(out.error?.message, name).toMatch(/full|space/i);
    }
  });

  test('reading and drawing stored data go on; a drawing just has no short link', async () => {
    overBudget();
    expect((await run('get_snapshot', { network: 'near-validators' })).reused).toBe(true);
    const spec = (
      await run('propose_spec', {
        network: 'near-validators',
        sha256: f.sha256,
        choices: { measure: 'validator_stake_current_epoch', petals: 16 },
      })
    ).spec;
    const drawn = await run('render_flower', { spec });
    expect(drawn.render_sha256).toBeTruthy();
    expect(drawn.short_url).toBeUndefined();
  });

  test('over HTTP it is a 429 with the typed code', async () => {
    overBudget();
    const res = await httpApp(r.ctx).request('/api/v1/explorations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'after' }),
    });
    expect(res.status).toBe(429);
    expect(((await res.json()) as Out).error.code).toBe('budget_exhausted');
  });

  test('checked on write, cached briefly: a new file counts only after the cache', async () => {
    limits({ dataMaxMb: 1 });
    await run('start_exploration', { question: 'measured' });
    const cache = join(r.stateDir, 'cache');
    writeFileSync(join(cache, 'big.json.gz'), Buffer.alloc(2 * 1024 * 1024));
    expect((await run('start_exploration', { question: 'within the cache' })).owned).toBe(false);
    r.clock.set(later(1));
    const out = await run('start_exploration', { question: 'after the cache' });
    expect(out.error?.code).toBe('budget_exhausted');
  });
});

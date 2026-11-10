// T178: the projection from the chat's state to what a person reads, and the views that lay it out.
// These decisions used to live inside Chat.tsx's render.
import type { FlowerResult, ModelSignature } from '@petal/core/types';
import { DEFAULT_VIEW } from '@petal/core/view';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { Composer } from '../components/chat/Composer.tsx';
import { Thread } from '../components/chat/Thread.tsx';
import type { Item } from '../lib/thread.ts';
import {
  composerView,
  type FlowerRow,
  RECORDED_QUESTION,
  type Row,
  type ThreadInput,
  threadView,
} from '../lib/thread-view.ts';

const flower = (o: Partial<FlowerResult> = {}) =>
  ({
    spec: {},
    spec_sha256: 'a'.repeat(64),
    view_url: '/draft?spec=x',
    legend: [],
    interpretation: {},
    validation: { valid: true, errors: [], warnings: [] },
    ...o,
  }) as unknown as FlowerResult;
const flowerItem = (f = flower(), signature: ModelSignature | null = null): Item => ({
  kind: 'flower',
  flower: f,
  signature,
});
const you = (text: string): Item => ({ kind: 'user', text });
const say = (text: string): Item => ({ kind: 'message', text });
const tool = (id: string, result?: { ok: boolean; summary: string; ms: number }): Item => ({
  kind: 'tool',
  id,
  name: 'list_networks',
  args: { a: 1 },
  ...(result ? { result } : {}),
});
const view = (items: Item[], o: Partial<ThreadInput> = {}): Row[] =>
  threadView({
    items,
    busy: false,
    runId: null,
    turn: 'idle',
    lostAgain: false,
    recorded: false,
    view: DEFAULT_VIEW,
    ...o,
  });
const flowers = (rows: Row[]) => rows.filter((r): r is FlowerRow => r.kind === 'flower');
const kinds = (rows: Row[]) => rows.map((r) => r.kind);

describe('the rows', () => {
  test('keys stay what the thread used: position and kind', () => {
    const rows = view([you('q'), tool('1'), say('a')]);
    expect(rows.map((r) => r.key)).toEqual(['0-user', '1-steps', '2-message']);
  });

  test('an error reads code, message and hint', () => {
    const [row] = view([{ kind: 'error', code: 'x', message: 'y', hint: 'z' }]);
    expect(row).toMatchObject({ text: 'x: y (z)' });
    const [plain] = view([{ kind: 'error', code: 'x', message: 'y' }]);
    expect(plain).toMatchObject({ text: 'x: y' });
  });
});

describe('the steps', () => {
  const stage: Item = { kind: 'stage', stage: 'thinking', message: 'Reading the question' };

  test('stages alone are hidden once nothing is running', () => {
    expect(kinds(view([you('q'), stage]))).toEqual(['user']);
    expect(kinds(view([you('q'), stage], { busy: true }))).toEqual(['user']);
    expect(view([you('q'), stage], { busy: true, turn: 'working' }).at(-1)).toMatchObject({
      kind: 'turn',
      headline: 'Reading the question…',
    });
  });

  test('tool calls are counted, and what is happening now is the status row’s to say', () => {
    const items = [you('q'), stage, tool('1'), tool('2')];
    expect(view(items, { busy: true })[1]).toMatchObject({ summary: '2 tool calls' });
    expect(view(items)[1]).toMatchObject({ summary: '2 tool calls' });
    expect(view([you('q'), stage, tool('1'), say('a')], { busy: true })[1]).toMatchObject({
      summary: '1 tool call',
    });
  });

  test('each step says what it did', () => {
    const rows = view([
      { kind: 'progress', message: 'Reading', done: 1, total: 3 },
      { kind: 'progress', message: 'Reading', total: 3 },
      { kind: 'progress', message: 'Reading' },
      tool('1'),
      tool('2', { ok: true, summary: 'fine', ms: 12 }),
      tool('3', { ok: false, summary: 'no', ms: 3 }),
    ]);
    const steps = (rows[0] as Extract<Row, { kind: 'steps' }>).steps;
    expect(steps.map((s) => (s.kind === 'progress' ? s.text : s.kind))).toEqual([
      'Reading (1/3)',
      'Reading (0/3)',
      'Reading',
      'tool',
      'tool',
      'tool',
    ]);
    expect(steps.slice(3).map((s) => (s.kind === 'tool' ? s.status : ''))).toEqual([
      '…',
      'ok: fine (12 ms)',
      'failed: no (3 ms)',
    ]);
    expect(steps[3]).toMatchObject({ args: '{\n  "a": 1\n}' });
  });
});

describe('a flower in its turn', () => {
  test('gives a link only if this turn’s own text does not', () => {
    const f = flower();
    expect(flowers(view([you('q'), flowerItem(f)]))[0]?.showLink).toBe(true);
    expect(flowers(view([you('q'), flowerItem(f), say(`see ${f.view_url}`)]))[0]?.showLink).toBe(
      false,
    );
    // a link in another turn doesn't count
    expect(
      flowers(view([you('q1'), flowerItem(f), you('q2'), say(`see ${f.view_url}`)]))[0]?.showLink,
    ).toBe(true);
    expect(
      flowers(view([you('q1'), say(`see ${f.view_url}`), you('q2'), flowerItem(f)]))[0]?.showLink,
    ).toBe(true);
  });

  test('only the run’s latest flower can be published, and only with a run', () => {
    const items = [you('q'), flowerItem(), you('q2'), flowerItem()];
    const rows = flowers(view(items, { runId: 'r/1' }));
    expect(rows.map((r) => r.publishUrl)).toEqual([undefined, '/publish/r%2F1']);
    expect(flowers(view(items)).map((r) => r.publishUrl)).toEqual([undefined, undefined]);
  });

  test('a recorded run says so where a live one names the signature’s model', () => {
    const sig = { model: 'm' } as ModelSignature;
    expect(flowers(view([flowerItem(flower(), sig)]))[0]?.model).toBe('m');
    expect(flowers(view([flowerItem(flower(), sig)], { recorded: true }))[0]?.model).toBe(
      'recorded',
    );
  });

  test('the checks read valid and the warnings', () => {
    expect(flowers(view([flowerItem()]))[0]?.checks).toBe('Valid: true');
    const warned = flower({
      validation: {
        valid: false,
        errors: [],
        warnings: [{ message: 'one' }, { message: 'two' }],
      },
    } as unknown as Partial<FlowerResult>);
    expect(flowers(view([flowerItem(warned)]))[0]?.checks).toBe('Valid: false (one; two)');
  });
});

describe('one link per flower per turn', () => {
  const link = (rows: Row[]) =>
    rows.flatMap((r) => (r.kind === 'message' ? [JSON.stringify(r.blocks)] : []));

  test('a second mention in the same turn gives no second link; a new question starts over', () => {
    const url = '/draft?spec=x';
    const rows = view([you('q1'), say(url), say(url), you('q2'), say(url)]);
    const [a, b, c] = link(rows);
    expect(a).toContain('"flower"');
    expect(b).not.toContain('"flower"');
    expect(c).toContain('"flower"');
  });
});

describe('the turn’s stage in plain words', () => {
  const at = (turn: ThreadInput['turn'], o: Partial<ThreadInput> = {}) =>
    view([you('q')], { turn, ...o }).find((r) => r.kind === 'turn');

  test('at rest, nothing is added: the thread reads as it always did', () => {
    for (const turn of ['idle', 'done', 'error'] as const) expect(at(turn)).toBeUndefined();
  });

  test('on the way, it says what is known', () => {
    expect(at('sending')).toMatchObject({ text: 'Sending your question…' });
    expect(at('accepted')).toMatchObject({ text: expect.stringContaining('landed') });
    expect(at('working')).toMatchObject({ text: expect.stringContaining('working') });
  });

  test('none of those offers to follow anything', () => {
    for (const turn of ['sending', 'accepted', 'working'] as const) {
      expect(at(turn)).not.toHaveProperty('refollow');
    }
  });

  test('lost: says what happened and offers to follow the run again', () => {
    expect(at('lost')).toMatchObject({
      text: expect.stringContaining('connection ended before this turn finished'),
      refollow: { label: 'Follow the run again', disabled: false },
    });
  });

  test('lost while following: the offer waits', () => {
    expect(at('lost', { busy: true })).toMatchObject({
      refollow: { label: 'Following…', disabled: true },
    });
  });

  test('lost a second time: says the run may have stopped, and claims no more', () => {
    expect(at('lost', { lostAgain: true })).toMatchObject({
      text: expect.stringContaining('may have stopped'),
      refollow: { disabled: false },
    });
  });

  test('it is the last row', () => {
    expect(kinds(view([you('q'), say('a')], { turn: 'working' })).at(-1)).toBe('turn');
  });
});

describe('the composer', () => {
  const composer = (o: Partial<Parameters<typeof composerView>[0]> = {}) =>
    composerView({ question: '', runId: null, busy: false, recorded: false, ...o });

  test('a new chat, a follow-up, and a recorded run ask for different things', () => {
    expect(composer()).toMatchObject({
      value: '',
      readOnly: false,
      button: 'Send',
      disabled: true,
      label: 'Message Petals',
      placeholder: 'A network, a DAO, a token or an address.',
    });
    expect(composer({ runId: 'r1' })).toMatchObject({
      placeholder: 'A follow-up…',
      run: { id: 'r1', href: '/make?run=r1' },
    });
    expect(composer({ recorded: true, question: 'ignored' })).toMatchObject({
      value: RECORDED_QUESTION,
      readOnly: true,
      button: 'Play the recorded run',
      label: 'The saved question',
    });
  });

  test('busy says so and waits', () => {
    expect(composer({ busy: true })).toMatchObject({ button: 'Working…', disabled: true });
  });

  test('no run, no run link', () => {
    expect(composer()).not.toHaveProperty('run');
  });
});

describe('the views only lay it out', () => {
  const thread = (rows: Row[]) =>
    renderToStaticMarkup(
      createElement(Thread, {
        rows,
        renderFlower: (r) => createElement('i', { key: r.key }, 'flower'),
      }),
    );

  test('who is speaking, then what they said', () => {
    const out = thread(view([you('hi'), say('hello'), you('and?')]));
    expect(out).toContain('Original question');
    expect(out).toContain('hi');
    expect(out).toContain('>Petals<');
    expect(out).toContain('hello');
    expect(out).toContain('>You<');
    expect(thread(view([{ kind: 'note', text: 'n' }]))).toContain('n</p>');
    expect(thread(view([{ kind: 'error', code: 'c', message: 'm' }]))).toContain(
      '<p class="error type-ui">c: m</p>',
    );
  });

  test('a flower is drawn by whoever composes the thread', () => {
    expect(thread(view([flowerItem()]))).toContain('<i>flower</i>');
  });

  test('a stage is a line of plain text; lost adds one button', () => {
    const working = thread(view([], { turn: 'working' }));
    expect(working).toContain('data-turn-stage="working"');
    expect(working).toContain('Petals is working on it. This can take a while.');
    const lost = thread(view([], { turn: 'lost' }));
    expect(lost).toContain('data-turn-stage="lost"');
    expect(lost).toContain('Follow the run again</button>');
  });

  test('the composer is the one AskBox, and says what the run is', () => {
    const out = renderToStaticMarkup(
      createElement(Composer, {
        view: composerView({ question: 'q', runId: 'r1', busy: true, recorded: false }),
        onChange: () => {},
        onSend: () => {},
      }),
    );
    expect(out).toContain('id="q"');
    expect(out).toContain('Working…</button>');
    expect(out).toMatch(/<button type="submit" disabled=""/);
    expect(out).toContain('Run <a href="/make?run=r1">r1</a>');
  });
});

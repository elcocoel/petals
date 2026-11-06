// T183: the workspace's decisions, without a browser: which flower is in the panel, what a question
// carries, what the address holds, how a flower reads beside its drawing, and what the stage fits.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentEvent, FlowerResult, LegendItem, PetalDetail, Spec } from '@petal/core/types';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { PetalDetails } from '../components/PetalDetails.tsx';
import { FlowerShelf } from '../components/workspace/FlowerShelf.tsx';
import type { DrawnReading } from '../lib/agent-client.ts';
import { aboutLabel, aboutLine, readAbout, withAbout } from '../lib/ask-about.ts';
import { repoRoot } from '../lib/config.ts';
import {
  amountLabel,
  chainLabel,
  dateLabel,
  type ListedFlower,
  legendKeys,
  networkLabel,
  petalView,
  readingKey,
  shortId,
  svgTitle,
} from '../lib/flower-view.ts';
import {
  type CanvasFlower,
  canvasShown,
  composerTarget,
  flowerPanelView,
  nextCanvas,
  type PanelFlower,
  questionPrefix,
  shelfView,
} from '../lib/panel-view.ts';
import { fitView } from '../lib/stage.ts';
import {
  type ChatAction,
  type ChatState,
  chatReducer,
  type Item,
  initialChat,
  type StoredItem,
} from '../lib/thread.ts';
import { composerView, type FlowerRow, openFlowerIndex, threadView } from '../lib/thread-view.ts';
import { openFromParams, workspaceUrl } from '../lib/workspace-url.ts';
import { type ChatDeps, sendQuestion } from '../viewmodels/useMakeChat.ts';

const golden = JSON.parse(
  readFileSync(join(repoRoot(), 'fixtures/golden/near-validators-default.json'), 'utf8'),
) as { spec: Spec; legend: LegendItem[]; petals: PetalDetail[]; spec_sha256: string };
const { spec, legend, petals } = golden;
const first = petals[0] as PetalDetail;
const tail = petals.find((p) => p.id === '__tail') as PetalDetail;

const flower = (sha = 'a'.repeat(64)): FlowerResult =>
  ({
    spec,
    spec_sha256: sha,
    view_url: '/draft?spec=x',
    legend,
    interpretation: {},
    validation: { valid: true, errors: [], warnings: [] },
  }) as unknown as FlowerResult;
const flowerEvent = (sha?: string): AgentEvent => ({ event: 'flower', data: flower(sha) });
const reduce = (s: ChatState, ...actions: ChatAction[]) => actions.reduce(chatReducer, s);
const flowerItem = (sha?: string): Item => ({
  kind: 'flower',
  flower: flower(sha),
  signature: null,
});
const rowsOf = (items: Item[], s: Partial<Parameters<typeof threadView>[0]> = {}) =>
  threadView({
    items,
    busy: false,
    runId: null,
    turn: 'idle',
    lostAgain: false,
    recorded: false,
    ...s,
  });
const flowerRows = (items: Item[], s = {}) =>
  rowsOf(items, s).filter((r): r is FlowerRow => r.kind === 'flower');

const stored: StoredItem = {
  kind: 'stored',
  id: 'abc123',
  question: 'Who stands behind NEAR’s validators?',
  summary: 'Spread thin at the top.',
  network: 'near-validators',
  asOf: '2026-11-03T19:42:00Z',
};

describe('which flower is in the panel', () => {
  test('the newest, until the person chooses', () => {
    expect(openFlowerIndex({ kind: 'latest' }, 3)).toBe(2);
    expect(openFlowerIndex({ kind: 'turn', index: 0 }, 3)).toBe(0);
    expect(openFlowerIndex({ kind: 'stored', id: 'x' }, 3)).toBe(-1);
    expect(openFlowerIndex({ kind: 'shelf' }, 3)).toBe(-1);
  });

  test('an index beyond the thread falls back to the newest', () => {
    expect(openFlowerIndex({ kind: 'turn', index: 7 }, 2)).toBe(1);
  });

  test('a new flower takes the panel from any choice, and clears the petal', () => {
    let s = reduce(initialChat({}), { type: 'event', event: flowerEvent('a'.repeat(64)) });
    s = reduce(
      s,
      { type: 'open', open: { kind: 'stored', id: 'x' } },
      { type: 'select', petal: 'p' },
    );
    expect(s.open).toEqual({ kind: 'stored', id: 'x' });
    s = reduce(s, { type: 'event', event: flowerEvent('b'.repeat(64)) });
    expect(s.open).toEqual({ kind: 'latest' });
    expect(s.petal).toBeNull();
  });

  test('reading a stored run keeps what the address asked for', () => {
    const s = reduce(
      initialChat({ initialRun: 'r', open: { kind: 'turn', index: 0 }, petal: 'p' }),
      {
        type: 'opened',
        run: { status: 'done', messages: [], events: [flowerEvent()] },
      },
    );
    expect(s.open).toEqual({ kind: 'turn', index: 0 });
    expect(s.petal).toBe('p');
  });

  test('choosing another flower clears the petal and the extra reading', () => {
    const s = reduce(
      initialChat({ petal: 'p' }),
      { type: 'section', section: 'reading' },
      { type: 'open', open: { kind: 'turn', index: 0 } },
    );
    expect(s.petal).toBeNull();
    expect(s.section).toBeNull();
  });

  test('a section toggles', () => {
    const on = reduce(initialChat({}), { type: 'section', section: 'quote' });
    expect(on.section).toBe('quote');
    expect(reduce(on, { type: 'section', section: 'quote' }).section).toBeNull();
    expect(reduce(on, { type: 'section', section: 'reading' }).section).toBe('reading');
  });

  test('the rows say which one is open, in order', () => {
    const items = [flowerItem('a'.repeat(64)), flowerItem('b'.repeat(64))];
    expect(flowerRows(items).map((r) => [r.index, r.open])).toEqual([
      [0, false],
      [1, true],
    ]);
    expect(flowerRows(items, { open: { kind: 'turn', index: 0 } }).map((r) => r.open)).toEqual([
      true,
      false,
    ]);
    expect(flowerRows(items, { open: { kind: 'shelf' } }).map((r) => r.open)).toEqual([
      false,
      false,
    ]);
  });
});

describe('a stored flower in the thread', () => {
  test('it has its place once, and the opening gives way to its own words', () => {
    const greeted = initialChat({ greeting: 'Hi.' });
    const once = reduce(greeted, { type: 'stored-read', stored }, { type: 'stored-read', stored });
    expect(once.items.filter((x) => x.kind === 'stored')).toHaveLength(1);
    const rows = rowsOf(once.items, { open: { kind: 'stored', id: stored.id } });
    expect(rows.map((r) => r.kind)).toEqual(['user', 'message', 'stored']);
    expect(rows[0]).toMatchObject({ text: stored.question, label: 'Original question' });
    expect(rows[1]).toMatchObject({ speaker: 'Petals' });
    expect(rows[2]).toMatchObject({ open: true, id: stored.id });
  });

  test('it goes back before the question about it, when a run comes back around it', () => {
    const asked = withAbout(
      aboutLine({ kind: 'flower', id: stored.id, title: 'T', network: 'n', asOf: stored.asOf }),
      'What does it say?',
    );
    const s = reduce(
      initialChat({ initialRun: 'r', open: { kind: 'stored', id: stored.id } }),
      { type: 'stored-read', stored },
      {
        type: 'opened',
        run: {
          status: 'done',
          messages: [
            { role: 'assistant', content: 'Hi.' },
            { role: 'user', content: asked },
          ],
          events: [{ event: 'run', data: { run_id: 'r', resume_url: '/make?run=r' } }],
        },
      },
    );
    expect(s.items.map((x) => x.kind)).toEqual(['message', 'stored', 'user']);
  });
});

describe('what a question carries', () => {
  const panelFlower: PanelFlower = {
    key: 'a'.repeat(64),
    spec,
    legend,
    interpretation: {} as never,
    signature: null,
    checks: 'ok',
    viewUrl: '/x',
    earlier: false,
  };

  test('a selected wallet goes with the words, and the thread shows it quietly', () => {
    const target = composerTarget(panelFlower, first);
    expect(target.kind).toBe('wallet');
    const prefix = questionPrefix(panelFlower, target) as string;
    expect(prefix).toContain(first.id);
    expect(prefix).toContain('near-validators');
    const sent = withAbout(prefix, 'Who is this?');
    const { words, about } = readAbout(sent);
    expect(words).toBe('Who is this?');
    const [row] = rowsOf([{ kind: 'user', text: sent }]);
    expect(row).toMatchObject({ text: 'Who is this?', about: `About account ${first.id}` });
    expect(about).toContain('near-validators');
  });

  test('everyone else is a group, not a wallet', () => {
    const target = composerTarget(panelFlower, tail);
    expect(target.kind).toBe('group');
    expect(questionPrefix(panelFlower, target)).toContain('311 accounts grouped');
    expect(
      composerView({ question: '', runId: 'r', busy: false, recorded: false, target }).placeholder,
    ).toBe('Ask about everyone else…');
  });

  test('the flower the thread is on needs no words of its own; an earlier or stored one does', () => {
    const target = composerTarget(panelFlower, null);
    expect(questionPrefix(panelFlower, target)).toBeUndefined();
    expect(questionPrefix({ ...panelFlower, earlier: true }, target)).toContain('About flower');
    const prefix = questionPrefix(
      { ...panelFlower, stored: { id: 'abc123', title: 'Who decides?' } },
      target,
    ) as string;
    expect(readAbout(withAbout(prefix, 'q')).flower).toBe('abc123');
    expect(aboutLabel(prefix)).toBe('About “Who decides?”');
    expect(questionPrefix(null, { kind: 'none' })).toBeUndefined();
  });

  test('the placeholder follows the selection', () => {
    const at = (target: Parameters<typeof composerView>[0]['target']) =>
      composerView({ question: '', runId: 'r', busy: false, recorded: false, target }).placeholder;
    expect(at(composerTarget(panelFlower, first))).toBe('Ask about this wallet…');
    expect(at(composerTarget(panelFlower, null))).toBe('Ask about this flower…');
    expect(at({ kind: 'none' })).toBe('Ask a follow-up…');
  });

  test('a bracket in a title cannot end the prefix early', () => {
    const line = aboutLine({ kind: 'flower', id: 'x', title: 'a] b', network: 'n', asOf: '2026' });
    expect(readAbout(withAbout(line, 'q')).words).toBe('q');
  });

  test('plain words are left alone', () => {
    expect(readAbout('[not this] hello')).toEqual({
      about: null,
      flower: null,
      words: '[not this] hello',
    });
  });

  test('it goes to the server with the words, and a failure gives back only the words', async () => {
    const sent: string[] = [];
    const actions: ChatAction[] = [];
    const deps: ChatDeps = {
      client: {
        // biome-ignore lint/correctness/useYield: a chat that fails before its first event
        async *chat(r) {
          sent.push(r.messages.at(-1)?.content ?? '');
          throw new Error('refused');
        },
        readRun: () => Promise.reject(new Error('unused')),
        followRun: () => {
          throw new Error('unused');
        },
      },
      store: null,
      dispatch: (a) => actions.push(a),
      onRun: () => {},
    };
    await sendQuestion(deps, { text: 'Who?', recorded: false, runId: null, about: '[About x]' });
    expect(sent).toEqual(['[About x] Who?']);
    expect(actions[0]).toMatchObject({ type: 'sent', text: '[About x] Who?' });
    expect(actions.at(-1)).toMatchObject({ type: 'refused', text: 'Who?' });
  });
});

describe('the address', () => {
  test('holds what a reload needs, and comes back the same', () => {
    const cases = [
      { runId: 'r', open: { kind: 'latest' }, petal: null },
      { runId: 'r', open: { kind: 'turn', index: 1 }, petal: 'a.near' },
      { runId: null, open: { kind: 'stored', id: 'abc' }, petal: null },
      { runId: 'r', open: { kind: 'shelf' }, petal: null },
    ] as const;
    for (const c of cases) {
      const url = workspaceUrl(c) as string;
      const q = Object.fromEntries(new URL(url, 'http://x').searchParams);
      expect(openFromParams(q)).toEqual({ open: c.open, petal: c.petal });
    }
  });

  test('a fresh page has nothing to say', () => {
    expect(workspaceUrl({ runId: null, open: { kind: 'latest' }, petal: null })).toBeNull();
  });

  test('a question waiting goes along when the address has to change, and only then', () => {
    const fresh = { runId: null, open: { kind: 'latest' }, petal: null, asked: 'a b&c' } as const;
    expect(workspaceUrl(fresh)).toBeNull();
    const url = workspaceUrl({ ...fresh, runId: 'r' }) as string;
    expect(url).toBe('/make?run=r&q=a+b%26c');
    expect(new URL(url, 'http://x').searchParams.get('q')).toBe('a b&c');
    expect(workspaceUrl({ ...fresh, runId: 'r', asked: null })).toBe('/make?run=r');
  });

  test('nonsense falls back to the newest', () => {
    expect(openFromParams({ flower: 'x' }).open).toEqual({ kind: 'latest' });
    expect(openFromParams({ flower: '-1' }).open).toEqual({ kind: 'latest' });
    expect(openFromParams({ flower: ['2', '3'] }).open).toEqual({ kind: 'turn', index: 2 });
  });
});

describe('how a flower reads', () => {
  test('dates and chains', () => {
    expect(dateLabel('2026-11-03T19:42:00Z')).toBe('3 Nov 2026');
    expect(dateLabel('soon')).toBe('soon');
    expect(chainLabel('near:mainnet')).toBe('NEAR');
    expect(chainLabel('solana:mainnet')).toBe('Solana');
    expect(networkLabel('near-validators')).toBe('NEAR validators');
  });

  test('the drawing names itself', () => {
    expect(svgTitle('<svg xmlns="x" aria-label="A &amp; B" data-petal="y">')).toBe('A & B');
    expect(svgTitle('<svg></svg>')).toBeNull();
  });

  test('the reading key comes from the spec', () => {
    const key = readingKey(spec);
    expect(key.heading).toBe('60 largest validators + everyone else');
    expect(key.body).toBe('A taller petal holds more. Largest first, clockwise from the top.');
    expect(key.note).toContain('Snapshot at block 222,915,356');
    expect(key.note).toContain('3 Nov 2026');
  });

  test('the legend line has the colours and the group, not the outline', () => {
    expect(legendKeys(legend).map((k) => k.label)).toEqual([
      'Pool',
      'Liquid staking',
      'Everyone else',
    ]);
    expect(legendKeys(legend, true).at(-1)).toEqual({ label: 'Selected', swatch: 'selected' });
    expect(legendKeys(legend)[0]?.swatch).toBe('k-pool');
  });

  test('a named account stays whole; a hash shows its ends', () => {
    expect(shortId('astro-stakers.poolv1.near')).toBe('astro-stakers.poolv1.near');
    expect(shortId('5eosabcdefghijklmnopqrstuvwxyzmGTF')).toBe('5eos…mGTF');
    expect(shortId('short')).toBe('short');
    expect(amountLabel('33270925.6192')).toBe('33,270,925');
  });

  test('one petal: the amount with its unit, the share, and who it is', () => {
    const view = petalView(first, 'NEAR');
    expect(view.heading).toBe(first.id);
    expect(view.full).toBeNull();
    expect(view.stats).toBe('33,270,925 NEAR   ·   5.61% of the total');
    expect(view.says).toBe('astrostakers.com, self-declared.');
    const unknown = petalView({ ...first, identity: null });
    expect(unknown.says).toContain('The owner is unknown');
    expect(unknown.stats).not.toContain('NEAR');
    const grouped = petalView(tail);
    expect(grouped.heading).toBe('Everyone else');
    expect(grouped.says).toContain('311 accounts');
  });

  test('a detail closes only where it can', () => {
    const out = (onClose?: () => void) =>
      renderToStaticMarkup(createElement(PetalDetails, { petal: first, onClose }));
    expect(out()).not.toContain('Close detail');
    expect(out(() => {})).toContain('Close detail');
  });
});

describe('the panel', () => {
  const panelFlower: PanelFlower = {
    key: 'k',
    spec,
    legend,
    interpretation: {} as never,
    signature: null,
    checks: 'ok',
    viewUrl: '/x',
    earlier: false,
  };

  test('a flower being drawn has its words already; its name arrives with the drawing', () => {
    const waiting = flowerPanelView({
      flower: panelFlower,
      drawing: undefined,
      selected: null,
      sources: {},
      units: {},
    });
    expect(waiting).toMatchObject({
      svg: null,
      failed: null,
      title: 'NEAR validators',
      where: 'NEAR',
      date: '3 Nov 2026',
    });
    const drawn = flowerPanelView({
      flower: panelFlower,
      drawing: { svg: '<svg aria-label="Named by the renderer"></svg>', petals, legend },
      selected: first.id,
      sources: {},
      units: { [spec.selection.measure]: 'NEAR' },
    });
    expect(drawn.title).toBe('Named by the renderer');
    expect(drawn.selected).toBe(first.id);
    expect(drawn.petal?.stats).toContain('NEAR');
    expect(drawn.keys.at(-1)?.label).toBe('Selected');
  });

  test('a petal this drawing does not have selects nothing', () => {
    const view = flowerPanelView({
      flower: panelFlower,
      drawing: { svg: '<svg></svg>', petals, legend },
      selected: 'nobody',
      sources: {},
      units: {},
    });
    expect(view.selected).toBeNull();
    expect(view.petal).toBeNull();
  });

  const listed: ListedFlower[] = [
    {
      id: 'abc',
      title: null,
      network: 'near-validators',
      as_of: '2026-11-03T19:42:00Z',
      maker: null,
      published_at: null,
      where: 'map',
    },
  ];

  test('the shelf offers what is stored, and holds the place while the first one is made', () => {
    const shelf = shelfView(listed, false);
    expect(shelf.pending).toBe(false);
    expect(shelf.tiles[0]).toMatchObject({ title: 'abc', badge: 'On NEAR' });
    expect(shelf.tiles[0]?.image).toBe('/api/v1/flowers/abc/svg');
    expect(shelf.starter?.question).toBeTruthy();
    const pending = shelfView(listed, true);
    expect(pending.pending).toBe(true);
    expect(pending.note).toBe('Your flower will appear here.');
    expect(pending.starter).toBeUndefined();
    expect(shelfView([], false).note).toBe('Your flower will appear here.');
    expect(shelfView(listed, false, true).starter).toBeUndefined();
  });

  test('the shelf draws from its view', () => {
    const out = renderToStaticMarkup(
      createElement(FlowerShelf, { view: shelfView(listed, false) }),
    );
    expect(out).toContain('What would you like to map?');
    expect(out).toContain('/api/v1/flowers/abc/svg');
    expect(out).toContain('href="/gallery"');
  });
});

describe('the stage', () => {
  test('fit centres the whole box in the window', () => {
    const v = fitView({ x: 100, y: 200, width: 400, height: 200 }, { width: 824, height: 624 });
    expect(v?.k).toBe(2);
    // the box's corners land inside the window, centred
    expect(100 * (v?.k as number) + (v?.x as number)).toBe(12);
    expect(200 * (v?.k as number) + (v?.y as number)).toBe(112);
  });

  test('nothing to fit, or nowhere to fit it, is no answer', () => {
    expect(fitView({ x: 0, y: 0, width: 0, height: 10 }, { width: 10, height: 10 })).toBeNull();
    expect(fitView({ x: 0, y: 0, width: 10, height: 10 }, { width: 0, height: 10 })).toBeNull();
  });
});

describe('what a live canvas holds (T200)', () => {
  const reading: DrawnReading = { title: 'A', petals: [] };
  const other: DrawnReading = { title: 'B', petals: [] };

  test('nothing until a flower has its reading, then that flower', () => {
    expect(nextCanvas(null, null, undefined)).toBeNull();
    expect(nextCanvas(null, 'a', undefined)).toBeNull();
    expect(nextCanvas(null, 'a', reading)).toEqual({ key: 'a', reading });
  });

  test('the stand-in holds the canvas until the conversation draws its own', () => {
    const standIn: CanvasFlower = { key: 'stand-in', reading };
    const drawn: CanvasFlower = { key: 'drawn', reading: other };
    expect(canvasShown(null, false, standIn)).toBe(standIn);
    expect(canvasShown(drawn, false, standIn)).toBe(drawn);
  });

  test('nothing stands in while the address is coming back, and a drawn flower needs no stand-in', () => {
    const standIn: CanvasFlower = { key: 'stand-in', reading };
    expect(canvasShown(null, true, standIn)).toBeNull();
    const drawn: CanvasFlower = { key: 'drawn', reading: other };
    expect(canvasShown(drawn, true, standIn)).toBe(drawn);
    expect(canvasShown(drawn, false, null)).toBe(drawn);
    expect(canvasShown(null, false, null)).toBeNull();
  });

  test('the very flower already standing there changes nothing: the same scene, the same camera', () => {
    const standIn: CanvasFlower = { key: 'same', reading };
    expect(canvasShown({ key: 'same', reading: { ...reading } }, false, standIn)).toBe(standIn);
  });

  test('the same object until the flower really changes', () => {
    const held = nextCanvas(null, 'a', reading) as CanvasFlower;
    expect(nextCanvas(held, 'a', reading)).toBe(held);
    // even a new reading object for the same flower: only a new flower rebuilds the scene
    expect(nextCanvas(held, 'a', { ...reading })).toBe(held);
    expect(nextCanvas(held, null, undefined)).toBe(held);
    expect(nextCanvas(held, 'b', undefined)).toBe(held);
    expect(nextCanvas(held, 'b', other)).toEqual({ key: 'b', reading: other });
  });

  /** A turn through the real flow and reducer, with the canvas followed as useWorkspace does. */
  async function played(s0: ChatState, held0: CanvasFlower | null, recorded: boolean) {
    const sha = flower().spec_sha256;
    const drawings: Record<string, DrawnReading> = { [sha]: reading };
    let s = s0;
    let held = held0;
    const seen: (CanvasFlower | null)[] = [];
    const deps: ChatDeps = {
      client: {
        async *chat() {
          yield { event: 'run', data: { run_id: 'r', resume_url: '/make?run=r' } };
          yield { event: 'message', data: { text: 'Reading it.' } };
          yield flowerEvent();
          yield { event: 'message', data: { text: 'Here it is.' } };
        },
        readRun: async () => ({ ok: false, code: 'not_found', message: 'none' }),
        async *followRun() {},
      },
      store: null,
      onRun: () => {},
      dispatch: (a: ChatAction) => {
        s = chatReducer(s, a);
        const flowers = threadView({ ...s, recorded }).filter(
          (r): r is FlowerRow => r.kind === 'flower',
        );
        const row = flowers[openFlowerIndex(s.open, flowers.length)];
        const key = row?.flower.spec_sha256;
        held = nextCanvas(held, key, key ? drawings[key] : undefined);
        seen.push(held);
      },
    };
    await sendQuestion(deps, { text: 'q', recorded, runId: s.runId });
    return { s, seen, held };
  }

  test('a whole turn on the same flower never gives the canvas a new object', async () => {
    const first = await played(initialChat({}), null, true);
    expect(first.held?.key).toBe(flower().spec_sha256);
    // again: a recorded run starts over, so the thread has no flower for a while
    const again = await played(first.s, first.held, true);
    expect(again.seen.length).toBeGreaterThan(3);
    expect(new Set(again.seen)).toEqual(new Set([first.held]));
  });
});

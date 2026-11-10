// T183: the workspace's decisions, without a browser: which flower is in the panel, what a question
// carries, what the address holds, how a flower reads beside its drawing, and what a click on it does.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentEvent, FlowerResult, LegendItem, PetalDetail, Spec } from '@petal/core/types';
import { DEFAULT_VIEW } from '@petal/core/view';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { PetalDetails } from '../components/PetalDetails.tsx';
import { AskBox } from '../components/ui/AskBox.tsx';
import { FlowerShelf } from '../components/workspace/FlowerShelf.tsx';
import { FlowerPanel } from '../flower/FlowerPanel.tsx';
import type { DrawnReading } from '../lib/agent-client.ts';
import { aboutLabel, aboutLine, readAbout, withAbout } from '../lib/ask-about.ts';
import { repoRoot } from '../lib/config.ts';
import {
  amountLabel,
  chainLabel,
  dateLabel,
  networkLabel,
  petalView,
  readingKey,
  shortId,
  svgTitle,
} from '../lib/flower-view.ts';
import type { MapCard } from '../lib/maps.ts';
import {
  addressOpensBox,
  type CanvasFlower,
  canvasPetal,
  canvasReading,
  composerTarget,
  flowerPanelView,
  nextCanvas,
  type PanelFlower,
  type PanelView,
  panelFailure,
  pickPlan,
  questionPrefix,
  shelfView,
} from '../lib/panel-view.ts';
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
const noReading = {
  summary: '',
  power_means: [],
  mappings: [],
  conflicts: [],
  unknowns: [],
  inferred: [],
  documents: [],
} as unknown as NonNullable<PanelFlower['interpretation']>;
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
    view: DEFAULT_VIEW,
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
    ).toBe('About everyone else…');
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
    expect(at(composerTarget(panelFlower, first))).toBe('About this wallet…');
    expect(at(composerTarget(panelFlower, null))).toBe('About this flower…');
    expect(at({ kind: 'none' })).toBe('A follow-up…');
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
    interpretation: noReading,
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
    expect(drawn.petal?.id).toBe(first.id);
    expect(drawn.petal?.stats).toContain('NEAR');
    expect(drawn.keys).toEqual([{ label: 'Selected', swatch: 'selected' }]);
  });

  test('a petal this drawing does not have selects nothing', () => {
    const view = flowerPanelView({
      flower: panelFlower,
      drawing: { svg: '<svg></svg>', petals, legend },
      selected: 'nobody',
      sources: {},
      units: {},
    });
    expect(view.petal).toBeNull();
    expect(view.keys).toEqual([]);
  });

  const listed: MapCard[] = [
    {
      id: 'near:validators',
      name: 'NEAR validators',
      title: 'NEAR validators',
      about: 'validators on NEAR',
      chain: 'near:mainnet',
      address: null,
      picture: 'https://petals.test/api/v1/map/abc/svg?look=render%2Fv2&view=1421e0bf7b26',
      view_url: 'https://petals.test/d/abc',
      keys: [],
      readings: [
        {
          snapshot: 'abc',
          as_of: '2026-11-03T19:42:00Z',
          network: 'near-validators',
          about: 'validators on NEAR',
          title: 'NEAR validators',
          count: 8487,
          made_by: null,
          drawings: [],
        },
      ],
    },
  ];

  test('the shelf offers maps, one per address, and holds the place while the first one is made', () => {
    const shelf = shelfView(listed, false);
    expect(shelf.pending).toBe(false);
    // the Power Map's own tile, opening the map's page
    expect(shelf.tiles[0]).toMatchObject({
      key: 'near:validators',
      title: 'NEAR validators',
      badge: 'NEAR',
      image: 'https://petals.test/api/v1/map/abc/svg?look=render%2Fv2&view=1421e0bf7b26',
      href: '/m/near%3Avalidators',
    });
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
    expect(out).toContain(
      'src="https://petals.test/api/v1/map/abc/svg?look=render%2Fv2&amp;view=1421e0bf7b26"',
    );
    expect(out).toContain('href="/m/near%3Avalidators"');
    expect(out).toContain('href="/gallery"');
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

  test('the same object until the flower really changes', () => {
    const held = nextCanvas(null, 'a', reading) as CanvasFlower;
    expect(nextCanvas(held, 'a', reading)).toBe(held);
    // even a new reading object for the same flower: only a new flower rebuilds the scene
    expect(nextCanvas(held, 'a', { ...reading })).toBe(held);
    expect(nextCanvas(held, null, undefined)).toBe(held);
    expect(nextCanvas(held, 'b', undefined)).toBe(held);
    expect(nextCanvas(held, 'b', other)).toEqual({ key: 'b', reading: other });
  });

  test('a new view of the person’s draws the same flower again, once its reading in that view is in', () => {
    const held = nextCanvas(null, 'a', reading, undefined, 'v1') as CanvasFlower;
    expect(nextCanvas(held, 'a', { ...reading }, undefined, 'v1')).toBe(held);
    expect(nextCanvas(held, 'a', undefined, undefined, 'v2')).toBe(held);
    expect(nextCanvas(held, 'a', other, undefined, 'v2')).toEqual({
      key: 'a',
      reading: other,
      view: 'v2',
    });
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
        const flowers = threadView({ ...s, recorded, view: DEFAULT_VIEW }).filter(
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

describe('the legend of what the canvas draws (T202)', () => {
  const backers = JSON.parse(
    readFileSync(join(repoRoot(), 'fixtures/golden/near-validators-backers.json'), 'utf8'),
  ) as { legend: LegendItem[]; petals: PetalDetail[] };
  const ofLegend = (items: LegendItem[]) => canvasReading(items, noReading);

  test('a swatch only for a colour it paints: each petal by its kind, and the tail', () => {
    for (const items of [legend, backers.legend]) {
      const keyed = ofLegend(items).legend.filter((i) => i.keys);
      for (const i of keyed) expect(['colour', 'tail']).toContain(i.primitive);
    }
    const kept = ofLegend(backers.legend).legend;
    expect(kept.find((i) => i.primitive === 'colour')?.keys?.map((k) => k.swatch)).toEqual([
      'var(--k-pool)',
      'var(--k-entity)',
    ]);
    // the canvas bands a petal's segments in one tone, so they get no swatches of kinds
    expect(kept.find((i) => i.primitive === 'segments')?.keys).toBeUndefined();
  });

  test("outline goes, because the canvas doesn't draw it; colour stays, since the one look paints it", () => {
    const { legend: kept } = ofLegend(backers.legend);
    expect(kept.map((i) => i.primitive)).toEqual([
      'width',
      'height',
      'colour',
      'segments',
      'order',
      'tail',
    ]);
    expect(kept[0]?.meaning).toBe('share of stake in the current epoch, in a 2x band');
    expect(kept.find((i) => i.primitive === 'segments')?.meaning).toContain('who backs the pool');
  });

  test('the tail is one petal, not a hatched one, and it says the same otherwise', () => {
    // The one look already says so (render/v2); the panel says the same of an older drawing's words.
    const now = ofLegend(legend).legend.find((i) => i.primitive === 'tail')?.meaning as string;
    expect(now).toContain('one petal');
    expect(now).not.toContain('hatched');
    const older = legend.map((i) =>
      i.primitive === 'tail'
        ? { ...i, meaning: i.meaning.replace('one petal', 'one hatched petal') }
        : i,
    );
    expect(ofLegend(older).legend.find((i) => i.primitive === 'tail')?.meaning).toBe(now);
  });

  test('no source is lost with what went: each is still somewhere, once', () => {
    const { legend: kept, sources } = ofLegend(legend);
    const before = new Set(legend.flatMap((i) => i.sources));
    expect(new Set([...kept.flatMap((i) => i.sources), ...sources])).toEqual(before);
    expect(new Set(sources).size).toBe(sources.length);
    for (const id of sources) expect(kept.flatMap((i) => i.sources)).not.toContain(id);
  });

  test('the agent’s own why goes the same way for what is not drawn, and only that', () => {
    const reading = {
      ...noReading,
      summary: 'Its words stay.',
      mappings: [
        { primitive: 'height', why: 'Square root.', sources: ['a'] },
        { primitive: 'colour', why: 'Kind of account.', sources: ['a', 'b'] },
        { primitive: 'outline', why: 'Solid where declared.', sources: ['c'] },
      ],
    } as PanelFlower['interpretation'];
    const { interpretation, sources } = canvasReading([], reading);
    expect(interpretation?.summary).toBe('Its words stay.');
    expect(interpretation?.mappings.map((m) => m.primitive)).toEqual(['height', 'colour']);
    expect(sources).toEqual(['c']);
  });

  test('a petal says why it looks this way only for what the canvas draws', () => {
    const shown = canvasPetal(first).values.map((v) => v.primitive);
    expect(shown).toEqual(['width', 'height', 'colour', 'order']);
    expect(
      canvasPetal(tail)
        .values.map((v) => v.explains)
        .join(),
    ).not.toContain('hatched');
    expect(first.values.map((v) => v.primitive)).toContain('colour');
  });

  test('the line under the drawing keys only the selection; the legend keys the colours', () => {
    const at = (selected: string | null) =>
      flowerPanelView({
        flower: {
          key: 'k',
          spec,
          legend,
          interpretation: noReading,
          signature: null,
          checks: 'ok',
          viewUrl: '/x',
          earlier: false,
        },
        drawing: { svg: '<svg></svg>', petals, legend },
        selected,
        sources: {},
        units: {},
      });
    expect(at(null).keys).toEqual([]);
    expect(at(first.id).keys).toEqual([{ label: 'Selected', swatch: 'selected' }]);
    expect(at(first.id).petal?.values.map((v) => v.primitive)).toEqual([
      'width',
      'height',
      'colour',
      'order',
    ]);
  });
});

describe('a click on the canvas (T202)', () => {
  const reading: DrawnReading = { title: 'A', petals: [] };
  const standIn: CanvasFlower = { key: 'sha-stand-in', reading, stored: 'stand-in' };
  const play = (s: ChatState, plan: ReturnType<typeof pickPlan>) => reduce(s, ...plan.actions);

  test('a petal on the stand-in opens it, and only then selects', () => {
    const plan = pickPlan({ kind: 'petal', id: first.id }, standIn, undefined, []);
    expect(plan.opensBox).toBe(true);
    const s = play(initialChat({}), plan);
    expect(s.open).toEqual({ kind: 'stored', id: 'stand-in' });
    expect(s.petal).toBe(first.id);
    expect(workspaceUrl({ runId: null, open: s.open, petal: s.petal })).toBe(
      `/make?stored=stand-in&petal=${encodeURIComponent(first.id)}`,
    );
  });

  test('the centre of the stand-in opens it too, with no petal', () => {
    const s = play(initialChat({}), pickPlan({ kind: 'centre' }, standIn, undefined, []));
    expect(s.open).toEqual({ kind: 'stored', id: 'stand-in' });
    expect(s.petal).toBeNull();
  });

  test('the ground never opens it: the stand-in stays only a picture', () => {
    const plan = pickPlan({ kind: 'ground' }, standIn, undefined, []);
    expect(plan.opensBox).toBe(false);
    const s = play(initialChat({}), plan);
    expect(s.open).toEqual({ kind: 'latest' });
    expect(s.items).toEqual([]);
  });

  test('the flower already open only changes the petal, and keeps the extra reading', () => {
    const drawn: CanvasFlower = { key: 'k', reading };
    const before = reduce(initialChat({ petal: 'x' }), { type: 'section', section: 'reading' });
    const s = play(before, pickPlan({ kind: 'petal', id: 'y' }, drawn, 'k', ['k']));
    expect(s).toMatchObject({ open: { kind: 'latest' }, petal: 'y', section: 'reading' });
    const clear = play(s, pickPlan({ kind: 'ground' }, drawn, 'k', ['k']));
    expect(clear).toMatchObject({ open: { kind: 'latest' }, petal: null, section: 'reading' });
    const centre = play(s, pickPlan({ kind: 'centre' }, drawn, 'k', ['k']));
    expect(centre).toMatchObject({ petal: null, section: 'reading' });
  });

  test('from the shelf, the flower still on the canvas comes back, whichever turn it was', () => {
    const shelf = initialChat({ open: { kind: 'shelf' } });
    const keys = ['old', 'new'];
    const on = (key: string): CanvasFlower => ({ key, reading });
    const hit = { kind: 'petal', id: 'y' } as const;
    expect(play(shelf, pickPlan(hit, on('new'), undefined, keys)).open).toEqual({ kind: 'latest' });
    expect(play(shelf, pickPlan(hit, on('old'), undefined, keys)).open).toEqual({
      kind: 'turn',
      index: 0,
    });
    const stored = { ...on('s'), stored: 'id' };
    expect(play(shelf, pickPlan(hit, stored, undefined, keys)).open).toEqual({
      kind: 'stored',
      id: 'id',
    });
  });

  test('a stored flower on the canvas remembers its id', () => {
    expect(nextCanvas(null, 'k', reading, 'id')).toEqual({ key: 'k', reading, stored: 'id' });
  });

  test('the words sent carry the petal that was clicked, with a fake client', async () => {
    const panelFlower: PanelFlower = {
      key: 'sha-stand-in',
      spec,
      legend,
      interpretation: {} as never,
      signature: null,
      checks: 'ok',
      viewUrl: '/x',
      stored: { id: 'stand-in', title: 'Who stands behind NEAR’s validators?' },
      earlier: false,
    };
    const opened = play(
      initialChat({}),
      pickPlan({ kind: 'petal', id: first.id }, standIn, undefined, []),
    );
    const petal = petals.find((p) => p.id === opened.petal) ?? null;
    const target = composerTarget(panelFlower, petal);
    const view = composerView({
      question: 'Who is this?',
      runId: null,
      busy: false,
      recorded: false,
      target,
    });
    expect(view.placeholder).toBe('About this wallet…');
    expect(view.about).toBe(`About account ${first.id}`);

    const sent: string[] = [];
    const deps: ChatDeps = {
      client: {
        async *chat(r) {
          sent.push(r.messages.at(-1)?.content ?? '');
          yield { event: 'run', data: { run_id: 'r', resume_url: '/make?run=r' } };
        },
        readRun: () => Promise.reject(new Error('unused')),
        followRun: () => {
          throw new Error('unused');
        },
      },
      store: null,
      dispatch: () => {},
      onRun: () => {},
    };
    await sendQuestion(deps, {
      text: 'Who is this?',
      recorded: false,
      runId: null,
      about: questionPrefix(panelFlower, target),
    });
    expect(sent).toEqual([
      `[About account ${first.id}, in the near-validators flower, data as of ${spec.snapshot.as_of.slice(0, 10)}] Who is this?`,
    ]);
  });

  test('with no petal, the next question is about the flower that was chosen', () => {
    const chosen = { key: 'k', spec, stored: { id: 'stand-in', title: 'Who?' } } as PanelFlower;
    expect(questionPrefix(chosen, composerTarget(chosen, null))).toContain('About flower stand-in');
  });
});

describe('when the box opens (T202)', () => {
  test('only an address that asks for it', () => {
    expect(addressOpensBox({ kind: 'latest' }, null)).toBe(false);
    expect(addressOpensBox(undefined, undefined)).toBe(false);
    expect(addressOpensBox({ kind: 'turn', index: 0 }, null)).toBe(false);
    expect(addressOpensBox({ kind: 'latest' }, first.id)).toBe(true);
    expect(addressOpensBox({ kind: 'stored', id: 'x' }, null)).toBe(true);
    expect(addressOpensBox({ kind: 'shelf' }, null)).toBe(true);
  });

  test('a failure is something that can happen, and nothing else is', () => {
    const flowerView = (failed: string | null) =>
      ({ kind: 'flower', key: 'k', failed }) as unknown as PanelView;
    expect(panelFailure({ kind: 'failed', text: 'gone' })).toBe('gone');
    expect(panelFailure(flowerView('bad spec'))).toBe('k bad spec');
    expect(panelFailure(flowerView(null))).toBeNull();
    expect(panelFailure({ kind: 'loading', text: 'Opening…' })).toBeNull();
  });
});

describe('the panel in its box (T202)', () => {
  const view = (more: Partial<PanelFlower> = {}, selected: string | null = null) =>
    flowerPanelView({
      flower: {
        key: 'k',
        spec,
        legend,
        interpretation: { ...noReading, summary: 'The argued reading.' },
        signature: null,
        checks: 'Valid: true',
        viewUrl: '/draft?spec=x',
        publishUrl: '/publish/r',
        earlier: false,
        ...more,
      },
      drawing: { svg: '<svg></svg>', petals, legend },
      selected,
      sources: {},
      units: {},
    });
  const html = (v: PanelView, more: { petal?: PetalDetail; section?: 'reading' | 'quote' } = {}) =>
    renderToStaticMarkup(
      createElement(FlowerPanel, { view: v, ...more, actions: { onCloseDetail: () => {} } }),
    );

  test('no stage: the canvas is the stage, so no drawing here and none of its words', () => {
    const out = html(view());
    expect(out).not.toContain('<svg');
    expect(out).not.toContain('Double-click');
    expect(out).not.toContain('>Fit<');
  });

  test.each([
    'Explore another flower',
    'Interpretation and sources',
    'Publish on NEAR',
    'Open as a page',
  ])('keeps its word: %s', (word) => {
    expect(html(view())).toContain(word);
  });

  test('the reading key, or the petal in its place', () => {
    expect(html(view())).toContain('60 largest');
    const out = html(view({}, first.id), { petal: canvasPetal(first) });
    expect(out).not.toContain('60 largest');
    expect(out).toContain('Close detail');
    expect(out).toContain('Selected');
  });

  test('the reading: its interpretation, its legend with the colours it paints, every source, its signature', () => {
    const out = html(view(), { section: 'reading' });
    expect(out).toContain('The argued reading.');
    expect(out).toContain('Legend');
    expect(out).toContain('data-swatch="k-pool"');
    expect(out).toContain('data-swatch="tail"');
    expect(out).toContain('nearblocks-validators');
    expect(out).toContain('No model signature.');
    expect(out).toContain('spec_sha256 k');
  });

  test('says when it failed, is drawing, is loading, or has nothing yet', () => {
    const failed = flowerPanelView({
      flower: {
        key: 'k',
        spec,
        legend,
        interpretation: noReading,
        signature: null,
        checks: 'ok',
        viewUrl: '/x',
        earlier: false,
      },
      drawing: { failed: 'bad spec' },
      selected: null,
      sources: {},
      units: {},
    });
    expect(html(failed)).toContain('The flower could not be drawn: bad spec');
    const drawing = { ...view(), svg: null };
    expect(html(drawing)).toContain('Drawing…');
    expect(html({ kind: 'loading', text: 'Opening the flower…' })).toContain('Opening the flower…');
    const out = html({ kind: 'failed', text: 'It is gone.' });
    expect(out).toContain('It is gone.');
    expect(out).toContain('Explore another flower');
    expect(html(shelfView([], false))).toContain('What would you like to map?');
  });
});

describe('the landing’s ask box', () => {
  const html = (to?: string) =>
    renderToStaticMarkup(
      createElement(AskBox, { label: 'Ask', placeholder: 'Ask', ...(to ? { to } : {}) }),
    );

  test('stops before its address gets too long for a server', () => {
    expect(html('/make')).toContain('maxLength="1500"');
  });

  test('the composer has no address, so no limit', () => {
    expect(html().toLowerCase()).not.toContain('maxlength');
  });
});

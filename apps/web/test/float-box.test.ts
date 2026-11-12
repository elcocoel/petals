// T200: where a box floating over a canvas sits and what a hand does to it, and the box itself.
import { floatBox } from '@petal/tokens';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { Composer } from '../components/chat/Composer.tsx';
import { Thread } from '../components/chat/Thread.tsx';
import { TurnFlower } from '../components/chat/TurnFlower.tsx';
import { FloatBox, type FloatHand } from '../components/ui/FloatBox.tsx';
import { Terminal } from '../components/ui/Terminal.tsx';
import { MAP_BOTTOM, MAP_SIZE } from '../flower/marks.ts';
import {
  besideMenu,
  besideOrBelow,
  clearOfConversation,
  conversationBoxes,
  type Edge,
  kept,
  moved,
  type Rect,
  recordedBoxes,
  type Size,
  seamed,
  sized,
  snapped,
} from '../lib/float-box.ts';
import { composerView } from '../lib/thread-view.ts';

const WIN: Size = { w: 1440, h: 900 };
const BOX: Rect = { x: 300, y: 200, w: 480, h: 500 };
const barInside = (r: Rect, win: Size) =>
  r.x >= 0 && r.x + r.w <= win.w && r.y >= 0 && r.y + floatBox.bar <= win.h;

describe('where the conversation starts (design/conversation.md, line 3)', () => {
  const base = floatBox['base-height'];

  test('beside the work menu, it starts past it', () => {
    expect(conversationBoxes(WIN, base, besideMenu).conversation.x).toBe(besideMenu);
  });

  test("where there's no room beside the menu, it goes over it, inside the window", () => {
    const narrow = { w: 700, h: 900 };
    const { conversation } = conversationBoxes(narrow, base, besideMenu);
    expect(conversation.x + conversation.w).toBe(narrow.w - floatBox.inset);
    const phone = { w: 390, h: 844 };
    expect(conversationBoxes(phone, base, besideMenu).conversation.x).toBe(floatBox.inset);
  });

  test('one box on the left, its base at its foot', () => {
    const { conversation } = conversationBoxes(WIN);
    expect(conversation.x).toBe(floatBox.inset);
    expect(conversation.y).toBe(floatBox.inset);
    expect(conversation.w).toBe(floatBox.width);
    expect(conversation.base).toBe(base);
  });

  test("it stops above the corner the flower's small map has", () => {
    const { conversation } = conversationBoxes(WIN);
    expect(conversation.y + conversation.h).toBe(WIN.h - floatBox.floor);
    expect(floatBox.floor).toBeGreaterThanOrEqual(MAP_BOTTOM + MAP_SIZE);
  });

  test('the models open beside it, ending level with its foot (line 20)', () => {
    const { conversation, options } = conversationBoxes(WIN);
    expect(options.x).toBe(conversation.x + conversation.w + floatBox.gap);
    expect(options.y + options.h).toBe(conversation.y + conversation.h);
  });

  test.each([
    [1024, 600],
    [640, 400],
    [320, 240],
    [768, 1024],
    [390, 844],
  ])('its bar is in a %i x %i window, and its sheet keeps its least', (w, h) => {
    for (const place of [conversationBoxes, recordedBoxes]) {
      const { conversation } = place({ w, h });
      expect(barInside(conversation, { w, h })).toBe(true);
      expect(conversation.base).toBeGreaterThanOrEqual(floatBox['base-min-height']);
    }
  });

  test.each([
    [768, 1024],
    [390, 844],
  ])('it fits a %i x %i window, with nothing past its sides', (w, h) => {
    for (const place of [conversationBoxes, recordedBoxes]) {
      const { conversation } = place({ w, h });
      expect(conversation.x).toBeGreaterThanOrEqual(0);
      expect(conversation.x + conversation.w).toBeLessThanOrEqual(w);
      expect(conversation.y + conversation.h).toBeLessThanOrEqual(h);
    }
  });

  test('a recorded run starts with a taller base, and stops in the same place (line 19)', () => {
    const live = conversationBoxes(WIN).conversation;
    const recorded = recordedBoxes(WIN).conversation;
    expect(recorded.base).toBe(floatBox['recorded-base-height']);
    expect(recorded.base).toBeGreaterThan(live.base ?? 0);
    expect(recorded.y + recorded.h).toBe(live.y + live.h);
    expect(recorded.y).toBe(live.y);
  });
});

describe('a sheet over a base (box.split, design/conversation.md, lines 5 to 11)', () => {
  const SPLIT: Rect = { x: 300, y: 100, w: 480, h: 600, base: 200 };
  const sheetOf = (r: Rect) => r.h - (r.base ?? 0);

  test('the sides size the whole box, both parts with it', () => {
    expect(sized(SPLIT, 'e', 40, 0, WIN)).toEqual({ ...SPLIT, w: 520 });
    expect(sized(SPLIT, 'w', -40, 0, WIN)).toEqual({ ...SPLIT, x: 260, w: 520 });
  });

  test('the top sizes the sheet, and the base stays where it is', () => {
    const r = sized(SPLIT, 'n', 0, -50, WIN);
    expect(r).toEqual({ ...SPLIT, y: 50, h: 650 });
    expect(r.y + r.h - (r.base ?? 0)).toBe(SPLIT.y + SPLIT.h - (SPLIT.base ?? 0));
  });

  test('the bottom sizes the base, and the sheet stays as it is', () => {
    const r = sized(SPLIT, 's', 0, 60, WIN);
    expect(r).toEqual({ ...SPLIT, h: 660, base: 260 });
    expect(sheetOf(r)).toBe(sheetOf(SPLIT));
  });

  test('the seam moves the line between them, and the box stays as it is', () => {
    expect(seamed(SPLIT, -80)).toEqual({ ...SPLIT, base: 280 });
    expect(seamed(SPLIT, 50)).toEqual({ ...SPLIT, base: 150 });
  });

  test('neither part goes below its least', () => {
    expect(seamed(SPLIT, 9000).base).toBe(floatBox['base-min-height']);
    expect(sheetOf(seamed(SPLIT, -9000))).toBe(floatBox['min-height']);
    expect(sheetOf(sized(SPLIT, 'n', 0, 9000, WIN))).toBe(floatBox['min-height']);
    expect(sized(SPLIT, 's', 0, -9000, WIN).base).toBe(floatBox['base-min-height']);
  });

  test("a corner does its two edges' work", () => {
    expect(sized(SPLIT, 'se', 20, 30, WIN)).toEqual({ ...SPLIT, w: 500, h: 630, base: 230 });
    expect(sized(SPLIT, 'nw', -20, -30, WIN)).toEqual({ ...SPLIT, x: 280, y: 70, w: 500, h: 630 });
  });

  test('a smaller window keeps the base where it fits (line 13)', () => {
    const r = kept(SPLIT, { w: 1440, h: 400 });
    expect(r.h).toBe(400);
    expect(r.base).toBe(SPLIT.base);
    expect(kept(SPLIT, { w: 1440, h: 300 }).base).toBe(300 - floatBox['min-height']);
  });

  test('a box with no base has none to move', () => {
    expect(seamed(BOX, 50)).toEqual(BOX);
    expect(sized(BOX, 's', 0, 10, WIN)).not.toHaveProperty('base');
  });
});

describe("where the flower's own box starts", () => {
  test('on the right, at the top, sized to read', () => {
    const { panel } = conversationBoxes(WIN);
    expect(panel.x + panel.w).toBe(WIN.w - floatBox.inset);
    expect(panel.y).toBe(floatBox.inset);
    expect(panel.w).toBe(floatBox['panel-width']);
    expect(panel.h).toBe(floatBox['panel-height']);
  });

  test.each([
    [1440, 900],
    [1024, 600],
    [768, 1024],
    [390, 844],
    [320, 240],
  ])('its bar and all of it are in a %i x %i window', (w, h) => {
    for (const place of [conversationBoxes, recordedBoxes]) {
      const { panel } = place({ w, h });
      expect(barInside(panel, { w, h })).toBe(true);
      expect(panel.x + panel.w).toBeLessThanOrEqual(w);
      expect(panel.y + panel.h).toBeLessThanOrEqual(h);
    }
  });
});

describe('moving', () => {
  test('follows the hand', () => {
    expect(moved(BOX, 20, -30, WIN)).toEqual({ ...BOX, x: 320, y: 170 });
  });

  test.each([
    ['left', -9000, 0],
    ['right', 9000, 0],
    ['up', 0, -9000],
    ['down', 0, 9000],
    ['a corner', 9000, 9000],
  ])('the bar stays in the window, thrown %s', (_name, dx, dy) => {
    expect(barInside(moved(BOX, dx, dy, WIN), WIN)).toBe(true);
  });

  test('the body may hang off the bottom, not the sides', () => {
    const r = moved(BOX, 0, 9000, WIN);
    expect(r.y).toBe(WIN.h - floatBox.bar);
    expect(r.h).toBe(BOX.h);
  });
});

describe('snapping (box.snap; Elco, walk 5: "snap to the edges more easily")', () => {
  const { inset, gap, bar } = floatBox;
  const PANEL = 312;
  test("let go near the window's edges, it lands on them, where the boxes start", () => {
    expect(snapped({ ...BOX, x: inset + bar - 1, y: inset + 10 }, WIN)).toMatchObject({
      x: inset,
      y: inset,
    });
    const right = WIN.w - inset - BOX.w;
    const bottom = WIN.h - inset - BOX.h;
    expect(snapped({ ...BOX, x: right - 20, y: bottom + 20 }, WIN)).toMatchObject({
      x: right,
      y: bottom,
    });
  });

  test("near the side panel's edge, it lands beside the panel, as a box starts there", () => {
    expect(snapped({ ...BOX, x: PANEL + 40 }, WIN, PANEL).x).toBe(PANEL + gap);
    expect(snapped({ ...BOX, x: PANEL - 20 }, WIN, PANEL).x).toBe(PANEL + gap);
  });

  test('farther than a bar from every edge, it stays where the hand left it', () => {
    const far = { ...BOX, x: PANEL + gap + bar + 1, y: inset + bar + 1 };
    expect(snapped(far, WIN, PANEL)).toEqual(far);
  });

  test('its size and base never change', () => {
    const r = snapped({ ...BOX, base: 184, x: inset + 5 }, WIN);
    expect([r.w, r.h, r.base]).toEqual([BOX.w, BOX.h, 184]);
  });
});

describe("a room that starts below the site's nav (top; OVERLAYS, 12 Nov: the map's panels as boxes)", () => {
  const NAV = 96;
  const { inset, bar } = floatBox;
  test('no bar goes above it, moved or kept', () => {
    expect(kept({ ...BOX, y: 10 }, WIN, NAV).y).toBe(NAV);
    expect(moved(BOX, 0, -500, WIN, NAV).y).toBe(NAV);
  });

  test('a box no taller than the room below it', () => {
    expect(kept({ ...BOX, h: WIN.h }, WIN, NAV).h).toBe(WIN.h - NAV);
  });

  test("it snaps to where boxes start below it, not to the window's top", () => {
    expect(snapped({ ...BOX, y: NAV + inset + bar - 1 }, WIN, 0, NAV).y).toBe(NAV + inset);
  });

  test('a top edge sized up stops at it', () => {
    expect(sized(BOX, 'n', 0, -500, WIN, NAV).y).toBe(NAV);
  });
});

describe('sizing', () => {
  const EDGES: [Edge, Partial<Rect>][] = [
    ['n', { y: 190, h: 510 }],
    ['s', { h: 510 }],
    ['e', { w: 490 }],
    ['w', { x: 290, w: 490 }],
    ['nw', { x: 290, y: 190, w: 490, h: 510 }],
    ['ne', { y: 190, w: 490, h: 510 }],
    ['sw', { x: 290, w: 490, h: 510 }],
    ['se', { w: 490, h: 510 }],
  ];
  test.each(EDGES)('%s moves its own edges and no others', (edge, change) => {
    const dx = edge.includes('w') ? -10 : 10;
    const dy = edge.includes('n') ? -10 : 10;
    expect(sized(BOX, edge, dx, dy, WIN)).toEqual({ ...BOX, ...change });
  });

  test.each(EDGES)('%s stops at the smallest size, by token, and the far edge holds', (edge) => {
    const dx = edge.includes('w') ? 9000 : -9000;
    const dy = edge.includes('n') ? 9000 : -9000;
    const r = sized(BOX, edge, dx, dy, WIN);
    if (edge.includes('e') || edge.includes('w')) expect(r.w).toBe(floatBox['min-width']);
    if (edge.includes('n') || edge.includes('s')) expect(r.h).toBe(floatBox['min-height']);
    if (edge.includes('w')) expect(r.x + r.w).toBe(BOX.x + BOX.w);
    if (edge.includes('n')) expect(r.y + r.h).toBe(BOX.y + BOX.h);
  });

  test.each(EDGES)('%s stops at the window', (edge) => {
    const dx = edge.includes('w') ? -9000 : 9000;
    const dy = edge.includes('n') ? -9000 : 9000;
    const r = sized(BOX, edge, dx, dy, WIN);
    expect(barInside(r, WIN)).toBe(true);
    expect(r.y + r.h).toBeLessThanOrEqual(WIN.h);
  });

  test("a top edge can't push the bar out of the window from a box hanging off it", () => {
    const hanging = { ...BOX, y: 800 };
    expect(barInside(sized(hanging, 'n', 0, 9000, WIN), WIN)).toBe(true);
  });
});

describe('a window that changes', () => {
  test.each([
    [700, 460],
    [320, 200],
    [100, 40],
  ])('a %i x %i window keeps the box, its bar inside', (w, h) => {
    const r = kept(BOX, { w, h });
    expect(r.w).toBeLessThanOrEqual(w);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    if (h >= floatBox.bar) expect(barInside(r, { w, h })).toBe(true);
  });
});

describe('the views', () => {
  const none = {};
  const hand: FloatHand = {
    root: () => {},
    raise: () => {},
    bar: none,
    edge: { n: none, s: none, e: none, w: none, nw: none, ne: none, sw: none, se: none },
    seam: none,
  };

  test('a float box: the box parent, its own kind, words once, eight edges with no marks', () => {
    const html = renderToStaticMarkup(
      FloatBox({
        label: 'Conversation',
        title: 'Conversation',
        surface: 'ink',
        hand,
        children: 'body',
      }),
    );
    expect(html).toContain('data-b="box"');
    expect(html).toContain('data-kind="float"');
    expect(html).toContain('data-surface="ink"');
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(8);
    expect(html.match(/>Conversation</g)).toHaveLength(1);
  });

  test('with a foot: one box, the sheet over a dark base, the seam a ninth hand (line 1)', () => {
    const html = renderToStaticMarkup(
      FloatBox({
        label: 'Conversation',
        title: 'Conversation',
        hand,
        foot: 'field',
        children: 'body',
      }),
    );
    expect(html.match(/<section/g)).toHaveLength(1);
    expect(html).toContain('data-foot=""');
    expect(html).toContain('data-surface="ink"');
    expect(html).toContain('cursor-row-resize');
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(9);
    expect(html.indexOf('body')).toBeLessThan(html.indexOf('field'));
  });

  test('an empty bar still has the height to hold it by', () => {
    const html = renderToStaticMarkup(FloatBox({ label: 'Conversation', hand, children: 'body' }));
    expect(html).toContain('min-h-control-height');
  });

  test('the Terminal is the same markup it was', () => {
    const html = renderToStaticMarkup(
      createElement(Terminal, { start: 'a', end: 'b', lines: [{ text: 'c' }] }),
    );
    expect(html).toContain('<div data-b="box" data-kind="term" class="border border-primary">');
    expect(html).toContain('<div class="border-b border-primary px-block-gap py-space-16">');
    expect(html).not.toContain('data-surface');
  });

  test('/make keeps its padding unless a surface says otherwise', () => {
    const thread = (className?: string) =>
      renderToStaticMarkup(
        createElement(Thread, {
          rows: [],
          renderFlower: () => null,
          ...(className ? { className } : {}),
        }),
      );
    expect(thread()).toContain(
      'class="min-h-0 flex-1 overflow-y-auto pt-column-gap pr-space-32 pl-column-gap"',
    );
    expect(thread('p-1')).toContain('class="min-h-0 flex-1 overflow-y-auto p-1"');
    const view = composerView({ question: '', runId: null, busy: false, recorded: false });
    const composer = (className?: string) =>
      renderToStaticMarkup(
        createElement(Composer, {
          view,
          onChange: () => {},
          onSend: () => {},
          ...(className ? { className } : {}),
        }),
      );
    expect(composer()).toContain(
      'class="flex flex-col gap-space-8 shrink-0 pt-text-gap pr-space-32 pb-space-32 pl-column-gap"',
    );
    expect(composer('p-1')).toContain('class="flex flex-col gap-space-8 shrink-0 p-1"');
  });

  test('an open row says where its flower is, and only where that is true', () => {
    const row = (openWord?: string) =>
      renderToStaticMarkup(
        createElement(TurnFlower, {
          title: 'a',
          sub: 'b',
          open: true,
          ...(openWord === undefined ? {} : { openWord }),
        }),
      );
    expect(row()).toContain('In the panel');
    expect(row('')).not.toContain('In the panel');
  });
});

describe('what the conversation covers of /make’s canvas (#78)', () => {
  const conversation = { x: 330, y: 24, w: 480, h: 700 };
  test('its right edge and the gap, from the canvas’s left', () => {
    expect(
      clearOfConversation(conversation, { left: 312, top: 0, width: 1128, height: 900 }),
    ).toEqual({ left: 330 + 480 + floatBox.gap - 312, right: 0, top: 0, bottom: 0 });
  });
  test('on a phone, the conversation below the flower: the flower keeps the top', () => {
    const below = besideOrBelow({ x: 24, y: 24, w: 342, h: 700, base: 184 }, { w: 390, h: 844 }, 0);
    expect(below.y).toBeGreaterThan(300);
    expect(below.x + below.w).toBeLessThanOrEqual(390);
    expect(
      clearOfConversation(below, { left: 0, top: 0, width: 390, height: 844 }).bottom,
    ).toBeGreaterThan(0);
  });

  test('room beside it, the conversation stays where it starts', () => {
    const c = { x: 330, y: 24, w: 480, h: 700 };
    expect(besideOrBelow(c, { w: 1440, h: 900 }, 312)).toBe(c);
  });
});

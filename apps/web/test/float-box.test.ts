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
import {
  conversationBoxes,
  type Edge,
  kept,
  moved,
  type Rect,
  type Size,
  sized,
} from '../lib/float-box.ts';
import { composerView } from '../lib/thread-view.ts';

const WIN: Size = { w: 1440, h: 900 };
const BOX: Rect = { x: 300, y: 200, w: 480, h: 500 };
const barInside = (r: Rect, win: Size) =>
  r.x >= 0 && r.x + r.w <= win.w && r.y >= 0 && r.y + floatBox.bar <= win.h;

describe('where the conversation starts', () => {
  test('both on the right, output above, input directly under it, the same width', () => {
    const { output, input } = conversationBoxes(WIN);
    expect(output.x).toBe(input.x);
    expect(output.w).toBe(input.w);
    expect(output.x + output.w).toBe(WIN.w - floatBox.inset);
    expect(input.y).toBe(output.y + output.h + floatBox.gap);
    expect(input.y + input.h).toBe(WIN.h - floatBox.inset);
  });

  test.each([
    [1024, 600],
    [640, 400],
    [320, 240],
  ])('every bar is in a %i x %i window', (w, h) => {
    const { output, input } = conversationBoxes({ w, h });
    expect(barInside(output, { w, h })).toBe(true);
    expect(barInside(input, { w, h })).toBe(true);
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
      'class="flex shrink-0 flex-col gap-space-8 pt-text-gap pr-space-32 pb-space-32 pl-column-gap"',
    );
    expect(composer('p-1')).toContain('class="flex shrink-0 flex-col gap-space-8 p-1"');
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

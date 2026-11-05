// What shows at what distance: the table, and the marks that come from it, with no browser.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Reading } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { fitView, type View } from '../lab/flower/camera.ts';
import { DETAIL, fade, openAt, type Row, ramp } from '../lab/flower/detail.ts';
import type { HoverWay } from '../lab/flower/hover.ts';
import { fakeRelations } from '../lab/flower/illustrative.ts';
import { newLive, noteAt, stepLive } from '../lab/flower/live.ts';
import { type Focus, type Marks, marks } from '../lab/flower/marks.ts';
import { type Model, modelOf } from '../lab/flower/model.ts';
import { SHAPE } from '../lab/flower/ring.ts';
import { syntheticReading } from '../lab/flower/synthetic.ts';
import { amount, kindWord, LINE, noteText, pct, textWidth } from '../lab/flower/words.ts';

const GOLDEN = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'golden');
const reading = (name: string): Reading =>
  JSON.parse(readFileSync(join(GOLDEN, `${name}.reading.json`), 'utf8')).reading;

const backers = modelOf(reading('near-validators-backers'));
const plain = modelOf(reading('near-validators-default'));
const stake = modelOf(reading('house-of-stake-default'));
const big = modelOf(syntheticReading(200));

const W = 1440;
const H = 900;
/** A view with the flower's centre at the window's centre, at this scale. */
const at = (k: number): View => ({
  k,
  x: W / 2 - SHAPE.cx * k,
  y: H / 2 - SHAPE.cy * k,
  width: W,
  height: H,
});
const pointing = (index: number): Focus => ({ index, presence: 1 });

const KS = Array.from({ length: 70 }, (_, i) => 0.05 * (24 / 0.05) ** (i / 69));

interface Text {
  what: string;
  opacity: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Every piece of text in a set of marks, as a box on screen, worked out here on its own. */
function texts(m: Marks): Text[] {
  const out: Text[] = [];
  const box = (what: string, opacity: number, x: number, y: number, w: number) => {
    out.push({ what, opacity, x0: x, y0: y - LINE + 5, x1: x + w, y1: y + 3 });
  };
  for (const n of m.notes) box(n.text, n.opacity, n.x, n.y, n.width);
  if (m.focus) {
    box(m.focus.text, m.focus.opacity, m.focus.x, m.focus.y, m.focus.width * m.focus.scale);
    if (m.focus.subOpacity > 0.01) {
      box(m.focus.sub, m.focus.subOpacity, m.focus.x, m.focus.y + 4 + LINE, textWidth(m.focus.sub));
    }
  }
  const half = textWidth(m.title) / 2;
  box('title', m.titleInside.opacity, m.titleInside.x - half, m.titleInside.y, half * 2);
  box('title', m.titleOutside.opacity, m.titleOutside.x - half, m.titleOutside.y, half * 2);
  for (const l of m.labels) {
    const w = textWidth(l.text) / 2;
    const r = (l.rotate * Math.PI) / 180;
    const ex = Math.abs(Math.cos(r)) * w + Math.abs(Math.sin(r)) * 5;
    const ey = Math.abs(Math.sin(r)) * w + Math.abs(Math.cos(r)) * 5;
    out.push({
      what: l.text,
      opacity: l.opacity,
      x0: l.x - ex,
      y0: l.y - ey,
      x1: l.x + ex,
      y1: l.y + ey,
    });
  }
  if (m.panel) {
    for (const l of m.panel.lines) box(l.text, l.opacity, l.x, l.y, textWidth(l.text));
  }
  return out;
}

const overlap = (a: Text, b: Text) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** What may be read on screen at once: where two texts overlap, one is at most a ghost. */
const READABLE = 0.2;

function collisions(m: Marks): string[] {
  const list = texts(m).filter((t) => t.opacity > 0.01);
  const hits: string[] = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i] as Text;
      const b = list[j] as Text;
      if (overlap(a, b) && Math.min(a.opacity, b.opacity) >= READABLE) {
        hits.push(`${a.what} (${a.opacity.toFixed(2)}) / ${b.what} (${b.opacity.toFixed(2)})`);
      }
    }
  }
  return hits;
}

describe('the table', () => {
  test('has a row for each thing Elco named', () => {
    for (const thing of [
      'silhouette',
      'titleInside',
      'titleOutside',
      'topNotes',
      'allNotes',
      'segments',
      'segmentLabels',
      'kind',
      'panel',
    ]) {
      expect(DETAIL).toHaveProperty(thing);
    }
  });

  test('every row fades in over a range of one on-screen size', () => {
    for (const row of Object.values(DETAIL) as Row[]) {
      expect(row.fadeIn[0]).toBeLessThanOrEqual(row.fadeIn[1]);
      if (row.fadeOut) expect(row.fadeOut[0]).toBeLessThan(row.fadeOut[1]);
      expect(typeof row.driver).toBe('string');
    }
  });

  test('a fade has a part-way, and reverses', () => {
    const row: Row = { driver: 'petalSide', fadeIn: [10, 20] };
    expect(fade(row, 5)).toBe(0);
    expect(fade(row, 25)).toBe(1);
    expect(fade(row, 15)).toBeCloseTo(0.5, 9);
    expect(ramp(10, 20, 12)).toBeLessThan(ramp(10, 20, 18));
  });

  test('the silhouette is solid until the petals are', () => {
    const r = SHAPE.R;
    for (const k of KS) {
      const shown = fade(DETAIL.silhouette, r * k) + fade(DETAIL.petals, r * k);
      expect(shown).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('marks', () => {
  test('are pure: the same input, the same output', () => {
    const v = at(2.3);
    const a = marks(backers, v, pointing(7));
    const b = marks(backers, v, pointing(7));
    expect(JSON.stringify({ ...a, segments: [...a.segments] })).toBe(
      JSON.stringify({ ...b, segments: [...b.segments] }),
    );
  });

  test('stop part-way and it stays part-way: some note is only partly there', () => {
    const partly = KS.some((k) => marks(plain, at(k), null).notes.some((n) => n.opacity < 0.9));
    expect(partly).toBe(true);
  });

  test('zoom out reverses it: same zoom, same marks, whichever way it got there', () => {
    for (const k of [0.4, 1.2, 3.3, 7.7]) {
      const going = marks(plain, at(k), pointing(5));
      for (const other of [24, 0.05, k * 1.1]) marks(plain, at(other), pointing(5));
      const coming = marks(plain, at(k), pointing(5));
      expect(coming.notes).toEqual(going.notes);
      expect(coming.focus).toEqual(going.focus);
    }
  });

  test('far away it is only the silhouette', () => {
    const m = marks(backers, at(0.06), null);
    expect(m.silhouette).toBe(1);
    expect(m.petals).toBe(0);
    expect(m.notes).toEqual([]);
    expect(m.labels).toEqual([]);
    expect(m.titleInside.opacity).toBe(0);
    expect(m.panel).toBeNull();
  });

  test('the title moves in once the polygon can hold it, and there is never two of it', () => {
    const m = plain;
    let sawOutside = false;
    let sawInside = false;
    for (const k of KS) {
      const { titleInside, titleOutside } = marks(m, at(k), null);
      sawOutside ||= titleOutside.opacity > 0.9;
      sawInside ||= titleInside.opacity > 0.9;
      expect(Math.min(titleInside.opacity, titleOutside.opacity)).toBe(0);
    }
    expect(sawOutside && sawInside).toBe(true);
  });

  test('top notes come in by rank, as the flower grows', () => {
    const rankFadesIn = (rank: number) =>
      KS.findIndex((k) =>
        marks(plain, at(k), null).notes.some((n) => plain.petals[n.index]?.rank === rank),
      );
    expect(rankFadesIn(1)).toBeGreaterThan(0);
    expect(rankFadesIn(1)).toBeLessThan(rankFadesIn(6));
    expect(rankFadesIn(6)).toBeLessThan(rankFadesIn(14));
  });

  test('bands show on a petal only as it gets wide enough, by its own drawn size', () => {
    const widest = 0;
    expect(marks(backers, at(0.5), null).segments[widest]).toBe(0);
    expect(marks(backers, at(8), null).segments[widest]).toBe(1);
    const narrow = backers.n - 3;
    const part = 26 / (backers.ring.len[widest] as number);
    expect(marks(backers, at(part), null).segments[widest]).toBeGreaterThan(0);
    expect(marks(backers, at(part), null).segments[narrow]).toBe(0);
  });

  test('the crossing: the account opens with the zoom, by its own side, and comes with a panel', () => {
    const i = 20;
    const side = plain.ring.len[i] as number;
    expect(marks(plain, at(10 / side), pointing(i)).open).toBe(0);
    const half = marks(plain, at(48 / side), pointing(i));
    expect(half.open).toBeCloseTo(0.5, 5);
    expect(half.recede).toBeGreaterThan(marks(plain, at(90 / side), pointing(i)).recede);
    expect(marks(plain, at(10 / side), pointing(i)).panel).toBeNull();
    expect(marks(plain, at(90 / side), pointing(i)).panel?.opacity).toBe(1);
    expect(openAt(side, 72 / side)).toBe(1);
  });

  test('the way back shows once the flower no longer fits', () => {
    expect(marks(plain, at(1.4), null).map.opacity).toBe(0);
    expect(marks(plain, at(6), pointing(3)).map).toMatchObject({ opacity: 1, litIndex: 3 });
  });
});

describe('text never overlaps', () => {
  const FLOWERS: [string, Model][] = [
    ['backers', backers],
    ['default', plain],
    ['house of stake', stake],
    ['200 petals', big],
  ];
  test.each(FLOWERS)('%s, at every zoom, wherever the pointer is', (_, m) => {
    const hits: string[] = [];
    for (const k of KS) {
      for (const focus of [null, 0, 1, 5, 17, 30, 44, m.n - 1]) {
        const mk = marks(m, at(k), focus === null ? null : pointing(focus));
        for (const hit of collisions(mk)) hits.push(`k=${k.toFixed(2)} focus=${focus}: ${hit}`);
      }
    }
    expect(hits).toEqual([]);
  });

  test.each(['dock', 'lift'] as HoverWay[])('%s: on a swollen flower too', (way) => {
    const hits: string[] = [];
    for (const k of [0.9, 1.33, 1.8, 2.6, 3.6, 5, 7, 11]) {
      const l = newLive(backers, way, W, H, true);
      const fit = fitView(W, H);
      const c = l.camera;
      c.k = k;
      c.raw = { x: Math.log(k), v: 0, t: Math.log(k) };
      c.x = W / 2 - (W / 2 - fit.x) * (k / fit.k);
      c.y = H / 2 - (H / 2 - fit.y) * (k / fit.k);
      for (const i of [0, 4, 12, 24, 40, 60]) {
        const r = backers.ring;
        const h = (backers.height[i] as number) * 0.6;
        const wx = ((r.ax[i] as number) + (r.bx[i] as number)) / 2 + (r.nx[i] as number) * h;
        const wy = ((r.ay[i] as number) + (r.by[i] as number)) / 2 + (r.ny[i] as number) * h;
        l.pointer.x = wx * c.k + c.x;
        l.pointer.y = wy * c.k + c.y;
        l.pointer.inside = true;
        l.locked = false;
        stepLive(l, 1 / 60);
        const focus: Focus = {
          index: l.focusIndex,
          presence: l.presence.x,
          open: l.open.x[l.focusIndex] as number,
          chase: noteAt(l),
          side: l.noteSide.x,
        };
        const mk = marks(backers, c, focus, l.ring);
        for (const hit of collisions(mk)) hits.push(`k=${k} at ${i}: ${hit}`);
      }
    }
    expect(hits).toEqual([]);
  });

  test('nothing is drawn off the window', () => {
    for (const k of KS) {
      const m = marks(backers, at(k), pointing(11));
      for (const n of m.notes) {
        expect(n.x).toBeGreaterThanOrEqual(0);
        expect(n.x + n.width).toBeLessThanOrEqual(W);
        expect(n.y).toBeGreaterThanOrEqual(0);
        expect(n.y).toBeLessThanOrEqual(H);
      }
    }
  });
});

describe('words come only from the data', () => {
  test('every word on screen is in the reading', () => {
    const m = backers;
    const allowed = new Set<string>([m.title]);
    for (const p of m.petals) {
      allowed.add(noteText(p));
      allowed.add(noteText(p, true));
      allowed.add(p.id);
      allowed.add(amount(p.amount));
      allowed.add(kindWord(p.kind));
      for (const s of p.segments) allowed.add(`${s.label} ${pct(s.frac)}`);
    }
    for (const k of KS) {
      for (const f of [null, 0, 9, 30]) {
        const mk = marks(m, at(k), f === null ? null : pointing(f));
        for (const t of texts(mk)) {
          if (t.what !== 'title') expect(allowed).toContain(t.what);
        }
        expect(mk.title).toBe(m.title);
      }
    }
  });

  test('amounts read as whole numbers with separators', () => {
    expect(amount('33270925.619217119134459443495696')).toBe('33,270,925');
    expect(amount('0.123456')).toBe('0.1234');
    expect(pct(0.056071)).toBe('5.61%');
    expect(pct(0.137972)).toBe('13.8%');
    expect(pct(0.00014)).toBe('<0.1%');
  });
});

describe('the illustrative layer', () => {
  test('is the same drawing each time, between petals that exist', () => {
    const a = fakeRelations(61);
    expect(a).toEqual(fakeRelations(61));
    expect(a.pairs.length).toBeGreaterThan(10);
    for (const [x, y] of a.pairs) {
      expect(x).not.toBe(y);
      expect(x).toBeLessThan(61);
      expect(y).toBeLessThan(61);
    }
  });
});

describe('the synthetic flowers', () => {
  test('say what they are, and are shaped like a reading', () => {
    const r = syntheticReading(500);
    expect(r.title).toContain('synthetic');
    expect(r.petals).toHaveLength(500);
    expect(r.petals.reduce((t, p) => t + p.share, 0)).toBeCloseTo(1, 6);
    for (const p of r.petals) {
      expect(p.width).toBeGreaterThanOrEqual(1);
      expect(p.width).toBeLessThanOrEqual(2);
      expect(p.height).toBeGreaterThan(0);
      expect(p.height).toBeLessThanOrEqual(1);
    }
  });
});

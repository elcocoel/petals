// Claims as pins on the map: what's said about a DAO or a wallet, as a small drop (a comment's pin) on it where the
// map draws it, a DAO's at its middle and a wallet's at its petal's tip, following it as the map moves. Pins near
// each other on the screen group into one with their count; a press on a group flies in until it parts, a press on
// a pin opens what's said there. Pins show only on flowers drawn big enough to read (from the size the names gain
// their treasury), so far away there are none. Everything about pins is here, so they come out in one place.
import type { Claim } from '@petal/core/types';
import type { Driven } from '../flower/drive.ts';
import { tipOf } from '../flower/live.ts';
import { SHAPE } from '../flower/ring.ts';
import type { LandFlower, LandView } from './scene.ts';
import { WORTH_AT } from './scene.ts';
import { flowerView, screenCentre, screenRadius } from './space.ts';
import { el, type Slot, slot } from './svg.ts';

const INK = 'var(--text-primary)';
const GROUND = 'var(--surface)';
const ACCENT = 'var(--accent)';

/** A pin's round part's radius on screen, in px. */
export const PIN = 9;
/** Pins closer than this on screen, in px, group into one. */
export const PIN_GROUP = PIN * 3;
/** Pins show on a flower from this radius on screen, in px: where the names gain their treasury. */
export const PINS_FROM = WORTH_AT.fadeIn[0];

/** One subject's claims, where the map draws it on the screen now. */
export interface PinAnchor {
  /** its map and its subject, as one key */
  key: string;
  map: string;
  subject: string;
  x: number;
  y: number;
  claims: readonly Claim[];
}

/** Pins near each other on the screen, as one: at its first pin's place, with how many claims. */
export interface PinGroup {
  x: number;
  y: number;
  anchors: PinAnchor[];
  count: number;
}

/** An address without its namespace, as petals and claims both carry it: eip155:100:0xAb… and 0xab… are one. */
export const bare = (ref: string) => (ref.split(':').at(-1) ?? ref).toLowerCase();

export const pinKey = (map: string, subject: string) => `${map}\u0000${subject}`;

/** The flowers' maps that pins read claims for now: those drawn big enough. */
export function pinMaps(
  lives: ReadonlyMap<number, Driven>,
  flowers: readonly LandFlower[],
  cam: LandView,
): string[] {
  const out = new Set<string>();
  for (const i of lives.keys()) {
    const f = flowers[i];
    if (f?.map && screenRadius(cam, f.place) >= PINS_FROM) out.add(f.map);
  }
  return [...out].sort();
}

/**
 * Where each subject's claims sit on the screen: on the flower whose map they were read for, a claim about the DAO
 * itself at the top right of its middle, one about a wallet at its petal's tip. A subject the flower doesn't draw
 * (a wallet folded into everyone else, another address) has no pin; Insights still lists it.
 */
export function anchorsOf(
  lives: ReadonlyMap<number, Driven>,
  flowers: readonly LandFlower[],
  cam: LandView,
  claims: ReadonlyMap<string, readonly Claim[]>,
  slid: ReadonlyMap<number, { x: number; y: number }>,
): PinAnchor[] {
  const out: PinAnchor[] = [];
  for (const [i, d] of lives) {
    const f = flowers[i];
    const said = f?.map ? claims.get(f.map) : undefined;
    if (!f?.map || !said?.length || screenRadius(cam, f.place) < PINS_FROM) continue;
    const bySubject = new Map<string, Claim[]>();
    for (const c of said) bySubject.set(c.subject, [...(bySubject.get(c.subject) ?? []), c]);
    const view = flowerView(cam, f.place);
    const ring = d.live.ring;
    const s = slid.get(i) ?? { x: 0, y: 0 };
    for (const [subject, cs] of bySubject) {
      let at: { x: number; y: number } | null = null;
      if (bare(subject) === bare(f.map)) {
        const c = screenCentre(cam, f.place);
        const hole = SHAPE.r0 * cam.k * f.place.s * Math.SQRT1_2;
        at = { x: c.x + s.x + hole, y: c.y + s.y - hole };
      } else {
        const p = d.m.petals.findIndex((petal) => bare(petal.id) === bare(subject));
        if (p >= 0) {
          const tip = tipOf(ring, p);
          at = { x: (tip.x + ring.ox) * view.k + view.x, y: (tip.y + ring.oy) * view.k + view.y };
        }
      }
      if (!at || at.x < 0 || at.y < 0 || at.x > cam.width || at.y > cam.height) continue;
      out.push({ key: pinKey(f.map, subject), map: f.map, subject, ...at, claims: cs });
    }
  }
  return out;
}

/** Each pin joins the first group whose place is nearer than `gap` px on the screen, or starts its own. */
export function groupPins(anchors: readonly PinAnchor[], gap = PIN_GROUP): PinGroup[] {
  const groups: PinGroup[] = [];
  for (const a of anchors) {
    const g = groups.find((x) => Math.hypot(x.x - a.x, x.y - a.y) < gap);
    if (g) {
      g.anchors.push(a);
      g.count += a.claims.length;
    } else groups.push({ x: a.x, y: a.y, anchors: [a], count: a.claims.length });
  }
  return groups;
}

/** The drop, its point at (x, y): round on three corners, the point its bottom left one, as a comment's pin. */
export function dropPath(x: number, y: number, r = PIN): string {
  const f = (n: number) => Math.round(n * 10) / 10;
  return `M${f(x)} ${f(y)}V${f(y - r)}A${r} ${r} 0 0 1 ${f(x + r)} ${f(y - 2 * r)}A${r} ${r} 0 0 1 ${f(x + 2 * r)} ${f(y - r)}A${r} ${r} 0 0 1 ${f(x + r)} ${f(y)}Z`;
}

/** A group's round part's middle, where its count is written and a press is caught. */
const middleOf = (g: { x: number; y: number }) => ({ x: g.x + PIN, y: g.y - PIN });

export interface Pins {
  /** Draws the groups, the open pin's in the accent. */
  draw(groups: readonly PinGroup[], open: string | null): void;
  /** The group drawn under a point on the screen, or null. */
  at(x: number, y: number): PinGroup | null;
  dispose(): void;
}

/** The pins' layer, above everything else on the map. */
export function newPins(svg: SVGSVGElement): Pins {
  const layer = el('g', { 'data-layer': 'pins' }, svg);
  const drawn: { g: Slot<SVGGElement>; drop: Slot<SVGPathElement>; count: Slot<SVGTextElement> }[] =
    [];
  let last: readonly PinGroup[] = [];
  return {
    draw(groups, open) {
      // the layer stays the last thing on the map, so pins are above the flowers mounted after it
      if (svg.lastChild !== layer) svg.appendChild(layer);
      while (drawn.length < groups.length) {
        const g = slot(el('g', {}, layer));
        drawn.push({
          g,
          drop: slot(el('path', { stroke: GROUND, 'stroke-width': 1.5 }, g.node)),
          count: slot(
            el('text', { class: 'type-mono', fill: GROUND, 'text-anchor': 'middle' }, g.node),
          ),
        });
      }
      drawn.forEach((d, i) => {
        const g = groups[i];
        d.g.show(Boolean(g));
        if (!g) return;
        const isOpen = open !== null && g.anchors.some((a) => a.key === open);
        d.drop.set('d', dropPath(g.x, g.y));
        d.drop.set('fill', isOpen ? ACCENT : INK);
        const m = middleOf(g);
        d.count.set('x', Math.round(m.x));
        d.count.set('y', Math.round(m.y + 4));
        d.count.node.textContent = g.count > 1 ? String(g.count) : '';
      });
      last = groups;
    },
    at(x, y) {
      // the last drawn is on top
      for (let i = last.length - 1; i >= 0; i--) {
        const g = last[i] as PinGroup;
        const m = middleOf(g);
        if (Math.hypot(x - m.x, y - m.y) <= PIN + 3) return g;
      }
      return null;
    },
    dispose() {
      layer.remove();
    },
  };
}

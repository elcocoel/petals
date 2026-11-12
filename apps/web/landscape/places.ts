// Places (specs/006-the-map, M-B, places/v1): where each flower sits on the map. A place is neither a fact
// about accounts nor part of the look; it's an address, worked out once and saved, so it stays put as the
// map grows. Pure and deterministic: the same flowers and links always give the same places, and a run
// with places already saved keeps every one of them and only finds room for the new.
//
// Continents: one per chain, since an account only matches on its own chain. Inside one, a force map:
// flowers that share accounts pull together by their overlap, every flower keeps the others at a distance,
// and a flower with no links drifts to the edge. World units are a flower's own (flower/ring.ts, SIZE 800).
import { SHAPE } from '../flower/ring.ts';

export const PLACES_VERSION = 'places/v1';

/** One flower to place: its id (the view's spec hash), its chain and how many members it reads. */
export interface Seed {
  id: string;
  chain: string;
  members: number;
}

/** Two flowers that share accounts, from the relations index. */
export interface Link {
  a: string;
  b: string;
  shared: number;
  weight: number;
}

export interface Place {
  id: string;
  chain: string;
  x: number;
  y: number;
  /** Its size on the map, 1 to SIZE_MOST: a flower of size s is s times a flower's own size. */
  s: number;
}

export interface Continent {
  chain: string;
  x: number;
  y: number;
  r: number;
}

export interface Places {
  petal: typeof PLACES_VERSION;
  continents: Continent[];
  flowers: Place[];
}

/** The biggest a flower gets on the map, against the smallest. Narrow, so no flower drowns the others. */
export const SIZE_MOST = 2.5;
/** Members at which a flower is smallest, and at which it stops growing. */
const MEMBERS_LEAST = 10;
const MEMBERS_MOST = 100_000;
/** A flower keeps this much room around its petals, for its name under it and a gap. */
const ROOM = 1.5;
/** Between continents, in a flower's radii. */
const SEA = 1.5;
const STEPS = 400;

/** How many of a flower's links, its strongest, pull on it, and show as roads from the farthest away. */
export const ROADS_FAR = 3;

/**
 * Each flower's strongest few links, most shared first. Where nearly every flower shares someone with
 * every other, pulling on all of them knots the map; pulling on these keeps the strongest roads short.
 */
export function backbone(links: readonly Link[], k = ROADS_FAR): Link[] {
  const sorted = [...links].sort(
    (x, y) => y.shared - x.shared || (x.a < y.a ? -1 : x.a > y.a ? 1 : x.b < y.b ? -1 : 1),
  );
  const count = new Map<string, number>();
  const kept: Link[] = [];
  for (const l of sorted) {
    const ca = count.get(l.a) ?? 0;
    const cb = count.get(l.b) ?? 0;
    if (ca < k || cb < k) kept.push(l);
    count.set(l.a, ca + 1);
    count.set(l.b, cb + 1);
  }
  return kept;
}

/** A flower's size on the map, from how many members it reads. */
export function sizeOf(members: number): number {
  const lo = Math.log10(MEMBERS_LEAST);
  const hi = Math.log10(MEMBERS_MOST);
  const t = (Math.log10(Math.max(1, members)) - lo) / (hi - lo);
  return 1 + (SIZE_MOST - 1) * Math.max(0, Math.min(1, t));
}

/** The room a flower of this size takes, as a radius in world units. */
export const footprint = (s: number): number => SHAPE.R * s * ROOM;

const round = (x: number) => Math.round(x * 10) / 10;

interface Body {
  id: string;
  x: number;
  y: number;
  r: number;
  pinned: boolean;
  linked: boolean;
}

/** The force map of one continent, centred on its own origin. */
function layContinent(bodies: Body[], links: { a: number; b: number; pull: number }[]): void {
  const n = bodies.length;
  for (let step = 0; step < STEPS; step++) {
    const alpha = 1 - step / STEPS;
    for (const { a, b, pull } of links) {
      const p = bodies[a] as Body;
      const q = bodies[b] as Body;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const want = (p.r + q.r) * 1.05;
      const f = ((d - want) / d) * pull * 0.5 * alpha;
      // A pinned flower doesn't move, so the other one takes the whole step.
      const wp = p.pinned ? 0 : q.pinned ? 2 : 1;
      const wq = q.pinned ? 0 : p.pinned ? 2 : 1;
      p.x += dx * f * wp;
      p.y += dy * f * wp;
      q.x -= dx * f * wq;
      q.y -= dy * f * wq;
    }
    for (const p of bodies) {
      if (p.pinned) continue;
      const g = (p.linked ? 0.02 : 0.006) * alpha;
      p.x -= p.x * g;
      p.y -= p.y * g;
    }
    for (let i = 0; i < n; i++) {
      const p = bodies[i] as Body;
      for (let j = i + 1; j < n; j++) {
        const q = bodies[j] as Body;
        let dx = q.x - p.x;
        let dy = q.y - p.y;
        let d = Math.hypot(dx, dy);
        const least = p.r + q.r;
        if (d >= least) continue;
        if (d < 1e-6) {
          // Two in one spot: part them along a direction their order decides, never at random.
          const a = (i * 2.399963 + j) % (2 * Math.PI);
          dx = Math.cos(a);
          dy = Math.sin(a);
          d = 1;
        }
        const push = (least - d) / d;
        if (p.pinned && q.pinned) continue;
        const pShare = p.pinned ? 0 : q.pinned ? 1 : 0.5;
        p.x -= dx * push * pShare;
        p.y -= dy * push * pShare;
        q.x += dx * push * (1 - pShare);
        q.y += dy * push * (1 - pShare);
      }
    }
  }
}

/**
 * Where a new circle of radius r goes, nearest the middle but no nearer than `from`, clear of every
 * circle already placed.
 */
function nearestClear(
  placed: readonly { x: number; y: number; r: number }[],
  r: number,
  gap: number,
  from = 0,
): { x: number; y: number } {
  if (placed.length === 0 && from === 0) return { x: 0, y: 0 };
  const clear = (x: number, y: number) =>
    placed.every((c) => Math.hypot(x - c.x, y - c.y) >= c.r + r + gap);
  const stride = Math.max(10, r / 8);
  for (let d = from; ; d += stride) {
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * 2 * Math.PI;
      const x = d * Math.cos(a);
      const y = d * Math.sin(a);
      if (clear(x, y)) return { x, y };
    }
  }
}

/**
 * Places every flower. With `before`, a flower that already has a place keeps it exactly, and a continent
 * that already exists keeps its middle; only new flowers and new continents are placed.
 */
export function placeFlowers(
  seeds: readonly Seed[],
  links: readonly Link[],
  before?: Places,
): Places {
  const kept = new Map((before?.flowers ?? []).map((p) => [p.id, p]));
  const keptLand = new Map((before?.continents ?? []).map((c) => [c.chain, c]));
  const chains = new Map<string, Seed[]>();
  for (const s of [...seeds].sort((a, b) => b.members - a.members || (a.id < b.id ? -1 : 1))) {
    const list = chains.get(s.chain) ?? [];
    list.push(s);
    chains.set(s.chain, list);
  }
  const pulls = backbone(links);
  const linkedIds = new Set(pulls.flatMap((l) => [l.a, l.b]));
  const most = Math.max(1, ...pulls.map((l) => l.shared));

  const lands: { chain: string; flowers: Place[]; r: number }[] = [];
  for (const [chain, list] of chains) {
    const old = keptLand.get(chain);
    const index = new Map(list.map((s, i) => [s.id, i]));
    const mean = list.reduce((a, s) => a + footprint(sizeOf(s.members)), 0) / list.length;
    const bodies: Body[] = list.map((s, i) => {
      const was = kept.get(s.id);
      if (was && old) {
        return {
          id: s.id,
          x: was.x - old.x,
          y: was.y - old.y,
          r: footprint(was.s),
          pinned: true,
          linked: linkedIds.has(s.id),
        };
      }
      // A sunflower's spiral: even, and decided by order alone.
      const a = i * 2.399963;
      const d = Math.sqrt(i + 0.5) * mean * 1.2;
      return {
        id: s.id,
        x: d * Math.cos(a),
        y: d * Math.sin(a),
        r: footprint(sizeOf(s.members)),
        pinned: false,
        linked: linkedIds.has(s.id),
      };
    });
    // The linked flowers first, by the force map; then the ones with no links yet, on the shore.
    const core = bodies.filter((b) => b.linked || b.pinned);
    const shore = bodies.filter((b) => !b.linked && !b.pinned);
    const inCore = new Map(core.map((b, i) => [b.id, i]));
    const inLand = pulls
      .filter((l) => index.has(l.a) && index.has(l.b) && inCore.has(l.a) && inCore.has(l.b))
      .map((l) => ({
        a: inCore.get(l.a) as number,
        b: inCore.get(l.b) as number,
        pull: 0.2 + 0.8 * (Math.log1p(l.shared) / Math.log1p(most)),
      }));
    layContinent(core, inLand);
    // Centre a new continent on its own flowers; a kept one keeps its middle.
    let cx = 0;
    let cy = 0;
    const free = core.filter((b) => !b.pinned);
    if (!old && free.length > 0) {
      cx = free.reduce((a, b) => a + b.x, 0) / free.length;
      cy = free.reduce((a, b) => a + b.y, 0) / free.length;
    }
    for (const b of core) {
      b.x -= cx;
      b.y -= cy;
    }
    const coreR = core.length ? Math.max(...core.map((b) => Math.hypot(b.x, b.y) + b.r)) : 0;
    const placedHere = [...core];
    for (const b of shore) {
      const at = nearestClear(placedHere, b.r, 0, core.length ? coreR + b.r : 0);
      b.x = at.x;
      b.y = at.y;
      placedHere.push(b);
    }
    cx = 0;
    cy = 0;
    const flowers = bodies.map((b, i) => ({
      id: b.id,
      chain,
      x: b.x - cx,
      y: b.y - cy,
      s: kept.get(b.id)?.s ?? Math.round(sizeOf((list[i] as Seed).members) * 1000) / 1000,
    }));
    const r = Math.max(...bodies.map((b) => Math.hypot(b.x - cx, b.y - cy) + b.r));
    lands.push({ chain, flowers, r });
  }

  // Continents: kept ones where they were, then new ones, biggest first, as near the middle as is clear.
  const sea = footprint(1) * SEA;
  const placed: Continent[] = [];
  const order = [...lands].sort(
    (a, b) => Number(keptLand.has(b.chain)) - Number(keptLand.has(a.chain)) || b.r - a.r,
  );
  const out: Place[] = [];
  for (const land of order) {
    const old = keptLand.get(land.chain);
    const at = old ? { x: old.x, y: old.y } : nearestClear(placed, land.r, sea);
    placed.push({ chain: land.chain, x: round(at.x), y: round(at.y), r: round(land.r) });
    for (const f of land.flowers) {
      const was = kept.get(f.id);
      out.push(
        was ?? { id: f.id, chain: f.chain, x: round(at.x + f.x), y: round(at.y + f.y), s: f.s },
      );
    }
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  placed.sort((a, b) => (a.chain < b.chain ? -1 : 1));
  return { petal: PLACES_VERSION, continents: placed, flowers: out };
}

/**
 * Gravity (Elco, 12 Nov walk: "we're unnecessarily hyper clustering ... gravity so how much things attract each
 * other so we can give more space between them"): 1 keeps the saved places as packed as the force map left them,
 * 0 gives three times the room. Places stay addresses: a flower moves out from its continent's middle along its
 * own line, so the arrangement is the same, only the space between changes.
 */
export const GRAVITY_DEFAULT = 0.75;
export const spreadOf = (gravity: number): number =>
  1 + 2 * (1 - Math.max(0, Math.min(1, gravity)));

/** A place, spread about its continent's middle. */
export const spreadPlace = (p: Place, c: Pick<Continent, 'x' | 'y'>, spread: number): Place => ({
  ...p,
  x: c.x + (p.x - c.x) * spread,
  y: c.y + (p.y - c.y) * spread,
});

/**
 * The map around one DAO (Elco, 12 Nov walk: "one click put something in the center ... we could put a dashed line
 * on the center for focus all the dowels are organized around that and then I can put something in the center to
 * be what everything else gets compared to"): it in the middle; the others on rings round it, those sharing the
 * most wallets with it nearest, those sharing none on rings past them; each ring clockwise from twelve. Sizes stay.
 * `shared` is how many wallets each flower shares with the one in the middle. Pure.
 */
export function ringsAround(
  places: readonly Place[],
  shared: readonly number[],
  c: number,
  middle: { x: number; y: number },
): { places: Place[]; r: number } {
  const gap = SHAPE.R * 0.6;
  const out = places.map((p) => ({ ...p }));
  const centre = places[c] as Place;
  out[c] = { ...centre, x: middle.x, y: middle.y };
  const tier = (i: number) => ((shared[i] ?? 0) > 0 ? 0 : 1);
  const others = places
    .map((_, i) => i)
    .filter((i) => i !== c)
    .sort(
      (a, b) =>
        tier(a) - tier(b) ||
        (shared[b] ?? 0) - (shared[a] ?? 0) ||
        (places[b] as Place).s - (places[a] as Place).s ||
        a - b,
    );
  const fp = (i: number) => footprint((places[i] as Place).s);
  let edge = footprint(centre.s);
  let k = 0;
  while (k < others.length) {
    // a ring: the next flowers that fit round it, never two tiers on one ring
    const first = others[k] as number;
    const ring = [first];
    let r = edge + gap + fp(first);
    let used = 2 * fp(first) + gap;
    while (k + ring.length < others.length) {
      const next = others[k + ring.length] as number;
      if (tier(next) !== tier(first) || used + 2 * fp(next) + gap > 2 * Math.PI * r) break;
      ring.push(next);
      used += 2 * fp(next) + gap;
      r = Math.max(r, edge + gap + fp(next));
    }
    let along = 0;
    for (const i of ring) {
      const share = (2 * fp(i) + gap) / used;
      const a = -Math.PI / 2 + 2 * Math.PI * (along + share / 2);
      along += share;
      out[i] = {
        ...(out[i] as Place),
        x: middle.x + r * Math.cos(a),
        y: middle.y + r * Math.sin(a),
      };
    }
    edge = r + Math.max(...ring.map(fp));
    k += ring.length;
  }
  return { places: out, r: edge + gap };
}

/** The circle that holds every continent: the map's home for the camera. */
export function homeOf(places: Places): { cx: number; cy: number; r: number } {
  if (places.continents.length === 0) return { cx: 0, cy: 0, r: SHAPE.R };
  const xs = places.continents.flatMap((c) => [c.x - c.r, c.x + c.r]);
  const ys = places.continents.flatMap((c) => [c.y - c.r, c.y + c.r]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const r = Math.max(...places.continents.map((c) => Math.hypot(c.x - cx, c.y - cy) + c.r));
  return { cx, cy, r };
}

/**
 * Where a new map stands on its chain's map before it's read (Elco, 12 Nov on /make: "if it's completely new, than
 * we have a 'place holder'"): the first free place, from the middle outward, as big as the chain's middling
 * flower, clear of every flower there; its reading lands there.
 */
export function freePlace(
  on: readonly Place[],
  home: { x: number; y: number; r: number },
  chain: string,
  id: string,
): Place {
  const sizes = on.map((p) => p.s).sort((a, b) => a - b);
  const s = sizes[Math.floor(sizes.length / 2)] ?? 1;
  const clear = (x: number, y: number) =>
    on.every((p) => Math.hypot(p.x - x, p.y - y) >= SHAPE.R * (p.s + s) * 1.05);
  for (const share of [0, 0.35, 0.55, 0.75, 0.95, 1.15, 1.35]) {
    const steps = share === 0 ? 1 : 24;
    for (let k = 0; k < steps; k++) {
      // clockwise from twelve, as the petals go
      const a = (k / steps) * Math.PI * 2;
      const x = home.x + home.r * share * Math.sin(a);
      const y = home.y - home.r * share * Math.cos(a);
      if (clear(x, y)) return { id, chain, x, y, s };
    }
  }
  return { id, chain, x: home.x, y: home.y - home.r * 1.5, s };
}

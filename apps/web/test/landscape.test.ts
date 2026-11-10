// The map (specs/006-the-map), with no browser: places are addresses, roads come from shared accounts,
// and a flower on the map is drawn with the view it would have alone.
import { describe, expect, test } from 'vitest';
import { fitView, newCamera, stepCamera } from '../flower/camera.ts';
import { newLive, stepLive } from '../flower/live.ts';
import { modelOf } from '../flower/model.ts';
import { SHAPE } from '../flower/ring.ts';
import { syntheticReading } from '../lab/flower/synthetic.ts';
import { fixtureNight, landscapeOf } from '../lab/map/landscape.ts';
import {
  backbone,
  footprint,
  homeOf,
  type Link,
  type Places,
  placeFlowers,
  type Seed,
  SIZE_MOST,
  sizeOf,
} from '../landscape/places.ts';
import { roadsBetween } from '../landscape/roads.ts';
import {
  edgePoint,
  flowerAt,
  flowerView,
  LIVE_FROM,
  LIVE_UNTIL,
  liveSet,
  reachOf,
  screenRadius,
  toSegment,
} from '../landscape/space.ts';

const seeds: Seed[] = [
  { id: 'a', chain: 'eip155:1', members: 8000 },
  { id: 'b', chain: 'eip155:1', members: 20000 },
  { id: 'c', chain: 'eip155:1', members: 4000 },
  { id: 'd', chain: 'eip155:1', members: 50 },
  { id: 'e', chain: 'eip155:1', members: 12 },
  { id: 's1', chain: 'solana', members: 90000 },
  { id: 's2', chain: 'solana', members: 300 },
];
const links: Link[] = [
  { a: 'a', b: 'b', shared: 1731, weight: 0.002 },
  { a: 'b', b: 'c', shared: 1634, weight: 0.001 },
  { a: 'a', b: 'c', shared: 548, weight: 0.001 },
  { a: 's1', b: 's2', shared: 40, weight: 0.01 },
];

const at = (p: Places, id: string) => p.flowers.find((f) => f.id === id) as Places['flowers'][0];
const gap = (p: Places, x: string, y: string) => {
  const a = at(p, x);
  const b = at(p, y);
  return Math.hypot(a.x - b.x, a.y - b.y);
};

describe('places', () => {
  test('the same flowers and links give the same places', () => {
    expect(placeFlowers(seeds, links)).toEqual(placeFlowers([...seeds].reverse(), [...links]));
  });

  test('one continent per chain, and every flower on its own', () => {
    const p = placeFlowers(seeds, links);
    expect(p.petal).toBe('places/v1');
    expect(p.continents.map((c) => c.chain).sort()).toEqual(['eip155:1', 'solana']);
    for (const f of p.flowers) {
      const c = p.continents.find((x) => x.chain === f.chain) as Places['continents'][0];
      expect(Math.hypot(f.x - c.x, f.y - c.y) + footprint(f.s)).toBeLessThanOrEqual(c.r + 1);
    }
  });

  test('no two flowers overlap, and continents keep a sea between them', () => {
    const p = placeFlowers(seeds, links);
    for (const f of p.flowers)
      for (const g of p.flowers) {
        if (f.id >= g.id) continue;
        expect(Math.hypot(f.x - g.x, f.y - g.y)).toBeGreaterThanOrEqual(
          footprint(f.s) + footprint(g.s) - 1,
        );
      }
    const [m, n] = p.continents as [Places['continents'][0], Places['continents'][0]];
    expect(Math.hypot(m.x - n.x, m.y - n.y)).toBeGreaterThan(m.r + n.r);
  });

  test('linked flowers touch, and a flower with no links sits on the shore, past every linked one', () => {
    const p = placeFlowers(seeds, links);
    const edge = (x: string, y: string) =>
      gap(p, x, y) - footprint(at(p, x).s) - footprint(at(p, y).s);
    expect(edge('a', 'b')).toBeLessThan(footprint(1) * 0.25);
    expect(edge('b', 'c')).toBeLessThan(footprint(1) * 0.25);
    const land = p.continents.find((c) => c.chain === 'eip155:1') as Places['continents'][0];
    const from = (id: string) => Math.hypot(at(p, id).x - land.x, at(p, id).y - land.y);
    for (const lone of ['d', 'e'])
      for (const linked of ['a', 'b', 'c']) expect(from(lone)).toBeGreaterThan(from(linked));
  });

  test('a new flower takes a place, and nobody else moves', () => {
    const before = placeFlowers(seeds, links);
    const more = [...seeds, { id: 'f', chain: 'eip155:1', members: 900 }];
    const after = placeFlowers(more, [...links, { a: 'f', b: 'a', shared: 30, weight: 0 }], before);
    for (const f of before.flowers) expect(at(after, f.id)).toEqual(f);
    for (const c of before.continents)
      expect(after.continents.find((x) => x.chain === c.chain)).toMatchObject({ x: c.x, y: c.y });
    const f = at(after, 'f');
    for (const g of before.flowers.filter((x) => x.chain === 'eip155:1'))
      expect(gap(after, 'f', g.id)).toBeGreaterThanOrEqual(footprint(f.s) + footprint(g.s) - 1);
  });

  test('a new chain gets its own continent, clear of the old ones', () => {
    const before = placeFlowers(seeds, links);
    const after = placeFlowers([...seeds, { id: 'n', chain: 'near', members: 400 }], links, before);
    const near = after.continents.find((c) => c.chain === 'near') as Places['continents'][0];
    for (const c of before.continents)
      expect(Math.hypot(near.x - c.x, near.y - c.y)).toBeGreaterThan(c.r + near.r);
  });

  test('sizes stay in a narrow range', () => {
    expect(sizeOf(1)).toBe(1);
    expect(sizeOf(10)).toBe(1);
    expect(sizeOf(1e9)).toBe(SIZE_MOST);
    expect(sizeOf(1000)).toBeGreaterThan(sizeOf(100));
  });

  test("each flower pulls on its strongest few links, whoever else it's linked to", () => {
    const many: Link[] = Array.from({ length: 10 }, (_, i) => ({
      a: 'hub',
      b: `x${i}`,
      shared: 100 - i,
      weight: 0,
    }));
    const kept = backbone(many, 3);
    // Every spoke is one of its own few strongest, so each stays, but the hub's 4th to 10th only for them.
    expect(kept).toHaveLength(10);
    expect(backbone([...many, { a: 'x0', b: 'x1', shared: 1, weight: 0 }], 1)).not.toContainEqual({
      a: 'x0',
      b: 'x1',
      shared: 1,
      weight: 0,
    });
  });

  test("the map's home holds every continent", () => {
    const p = placeFlowers(seeds, links);
    const h = homeOf(p);
    for (const c of p.continents)
      expect(Math.hypot(c.x - h.cx, c.y - h.cy) + c.r).toBeLessThanOrEqual(h.r + 1e-6);
  });
});

describe('roads', () => {
  const p = placeFlowers(seeds, links);

  test('one road per pair on the map, most shared first, and the strongest marked', () => {
    const roads = roadsBetween(p.flowers, [...links, { a: 'a', b: 'gone', shared: 5, weight: 0 }]);
    expect(roads.map((r) => r.shared)).toEqual([1731, 1634, 548, 40]);
    expect(roads.every((r) => r.strong)).toBe(true);
  });
});

describe('the space', () => {
  const W = 1440;
  const H = 900;

  test("a flower on the map gets the view it has alone, at the map's camera", () => {
    const place = { x: 5000, y: -2000, s: 2 };
    // The map's camera, set so the flower fills the window as it does alone.
    const alone = fitView(W, H);
    const k = alone.k / place.s;
    const cam = { k, x: W / 2 - place.x * k, y: H / 2 - place.y * k, width: W, height: H };
    const v = flowerView(cam, place);
    expect(v.k).toBeCloseTo(alone.k, 9);
    expect(v.x).toBeCloseTo(alone.x, 6);
    expect(v.y).toBeCloseTo(alone.y, 6);
    expect(screenRadius(cam, place)).toBeCloseTo(SHAPE.R * alone.k, 6);
  });

  test('a flower comes alive above its threshold and stays down to a lower one', () => {
    const flowers = [{ x: 0, y: 0, s: 1 }];
    const cam = (r: number) => {
      const k = r / SHAPE.R;
      return { k, x: W / 2, y: H / 2, width: W, height: H };
    };
    expect(liveSet(cam(LIVE_FROM + 1), flowers, new Set()).has(0)).toBe(true);
    expect(liveSet(cam(LIVE_UNTIL + 1), flowers, new Set()).has(0)).toBe(false);
    expect(liveSet(cam(LIVE_UNTIL + 1), flowers, new Set([0])).has(0)).toBe(true);
    expect(liveSet(cam(LIVE_UNTIL - 1), flowers, new Set([0])).has(0)).toBe(false);
  });

  test("a flower driven by the map's view keeps that view, and starts open", () => {
    const m = modelOf(syntheticReading(60));
    const l = newLive(m, 'dock', W, H, false, false);
    const view = { k: 0.7, x: 120, y: -40, width: W, height: H };
    stepLive(l, 1 / 60, view);
    expect([l.camera.k, l.camera.x, l.camera.y]).toEqual([0.7, 120, -40]);
    expect(Array.from(l.height.x).every((h) => h >= 0)).toBe(true);
  });

  test('a camera on another home fits that home, and its limits are its own', () => {
    const home = { cx: 10000, cy: 4000, r: 20000 };
    const c = newCamera(W, H, home, [0.01, 24]);
    const fit = fitView(W, H, home);
    expect(c.k).toBeCloseTo(fit.k, 9);
    expect((W / 2 - c.x) / c.k).toBeCloseTo(home.cx, 6);
    c.raw.t = Math.log(0.001);
    for (let i = 0; i < 600; i++) stepCamera(c, 1 / 60, false);
    expect(c.k).toBeGreaterThan(0.009);
  });
});

describe('bench v2', () => {
  const W = 1440;
  const H = 900;

  test("a flower's reach is where its petals end, not its room", () => {
    const tall = modelOf(syntheticReading(60));
    const r = reachOf(tall);
    expect(r).toBeGreaterThan(SHAPE.r0 / SHAPE.R);
    expect(r).toBeLessThanOrEqual(1.0001);
  });

  test('a click finds a flower only on its petals', () => {
    const cam = { k: 0.1, x: 0, y: 0, width: W, height: H };
    const flowers = [{ x: 5000, y: 4000, s: 1 }];
    const c = { x: 500, y: 400 };
    const r = SHAPE.R * 0.1;
    expect(flowerAt(cam, flowers, [1], c.x + r * 0.9, c.y)).toBe(0);
    expect(flowerAt(cam, flowers, [0.5], c.x + r * 0.9, c.y)).toBe(-1);
  });

  test("an arrow meets the window's edge the way its neighbour lies", () => {
    expect(edgePoint(720, 450, 1, 0, W, H, 28)).toEqual({ x: W - 28, y: 450 });
    const up = edgePoint(720, 450, 0, -1, W, H, 28);
    expect(up).toEqual({ x: 720, y: 28 });
    const corner = edgePoint(720, 450, Math.SQRT1_2, Math.SQRT1_2, W, H, 28);
    expect(corner.y).toBeCloseTo(H - 28, 6);
  });

  test('how far a point is from a connection', () => {
    expect(toSegment(5, 3, 0, 0, 10, 0)).toBe(3);
    expect(toSegment(-4, 3, 0, 0, 10, 0)).toBe(5);
  });

  test("names are the run's, without their notes, and one chain's names tell its flowers apart", () => {
    const b = landscapeOf(fixtureNight());
    const eth = b.flowers.filter((f) => f.place.chain === 'eip155:1').map((f) => f.name);
    expect(eth).toContain('ENS delegates');
    expect(eth).toContain('ENS active holders');
    for (const f of b.flowers) {
      expect(f.name).not.toMatch(/[()]/);
      expect(f.name.length).toBeLessThanOrEqual(28);
      expect(f.mark.symbol.length).toBeGreaterThan(0);
      expect(f.reading.title).toBe('');
    }
    const jito = b.flowers.find((f) => f.name === 'Jito');
    expect(jito?.mark.symbol).toBe('JTO');
  });

  test('every chain is offered, the most flowers first, by its own name', () => {
    const b = landscapeOf(fixtureNight());
    expect(b.chains.map((c) => c.label)).toEqual(
      expect.arrayContaining(['Ethereum', 'Gnosis', 'Solana', 'Arbitrum', 'Base', 'NEAR']),
    );
    const n = (chain: string) => b.flowers.filter((f) => f.place.chain === chain).length;
    for (let i = 1; i < b.chains.length; i++)
      expect(n((b.chains[i - 1] as (typeof b.chains)[number]).chain)).toBeGreaterThanOrEqual(
        n((b.chains[i] as (typeof b.chains)[number]).chain),
      );
  });

  test('a view the address book lacks gets a place, and every saved place stays', () => {
    const night = fixtureNight();
    const before = landscapeOf(night);
    const first = night.views.find((v) => v.chain === 'ethereum') as (typeof night.views)[number];
    const more = {
      ...night,
      views: [...night.views, { ...first, sha: 'f'.repeat(64), name: 'New one' }],
    };
    const after = landscapeOf(more);
    expect(after.flowers).toHaveLength(before.flowers.length + 1);
    for (const f of before.flowers)
      expect(after.flowers.find((g) => g.place.id === f.place.id)?.place).toEqual(f.place);
    expect(after.flowers.some((g) => g.name === 'New one')).toBe(true);
  });
});

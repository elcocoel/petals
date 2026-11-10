// coordinator/one-source.md, step 6: a flower is the map zoomed in. A map's page, a flower's page and a
// draft open the Power Map inside the flower that stands for their map, found by its address or by a
// reading of it; a reading that isn't on the map opens nothing.
import { describe, expect, test, vi } from 'vitest';
import { fixtureNight } from '../landscape/land.ts';

const night = fixtureNight();
// The live map's rows: the fixture's views, each its own map, but for the first two, one map read twice.
const views = night.views.map((v, i) => ({
  sha: v.sha,
  name: v.name,
  title: v.reading.title,
  network: v.reader,
  chain: v.chain,
  address: v.address || null,
  count: null,
  as_of: v.as_of,
  snapshot: v.snapshot,
  map: i < 2 ? 'shared:map' : `map:${v.sha}`,
  reading: v.reading,
}));
const asked: string[] = [];

vi.mock('../lib/api.ts', () => ({
  api: async (path: string) => {
    asked.push(path);
    return { ok: true, value: { ...night, views } };
  },
}));

describe('the Power Map opened at one map', () => {
  test('by its address: the flower that stands for it, in the view asked for', async () => {
    const { powerMapAt } = await import('../landscape/land.ts');
    const at = await powerMapAt('ab'.repeat(32), { map: `map:${views[5]?.sha}` });
    if ('error' in at) throw new Error(at.error);
    expect(at.land.flowers[at.focus]?.map).toBe(`map:${views[5]?.sha}`);
    expect(asked.at(-1)).toBe(`/api/v1/map?view=${'ab'.repeat(32)}`);
  });

  test('by a reading of it: an older reading opens the map that holds it, which shows its newest', async () => {
    const { powerMapAt } = await import('../landscape/land.ts');
    const at = await powerMapAt('ab'.repeat(32), { snapshot: views[0]?.snapshot as string });
    if ('error' in at) throw new Error(at.error);
    expect(at.land.flowers[at.focus]?.map).toBe('shared:map');
    expect(at.land.flowers.filter((f) => f.map === 'shared:map')).toHaveLength(1);
  });

  test('a reading that isn’t on the map opens nothing', async () => {
    const { powerMapAt } = await import('../landscape/land.ts');
    const at = await powerMapAt('ab'.repeat(32), { snapshot: 'not-on-the-map' });
    if ('error' in at) throw new Error(at.error);
    expect(at.focus).toBe(-1);
  });
});

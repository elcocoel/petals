// The lobby's flowers (specs/004-workspace, W3): each reads as in the gallery and opens on the canvas.
import { describe, expect, test } from 'vitest';
import type { ListedFlower } from '../lib/flower-view.ts';
import { mapTiles } from '../lib/lobby-view.ts';

const flower = (over: Partial<ListedFlower>): ListedFlower => ({
  id: '9ac16c8917aa5ca579c8421a',
  title: 'House of Stake',
  network: 'near',
  as_of: '2026-11-05T10:00:00Z',
  maker: null,
  published_at: null,
  where: 'map',
  ...over,
});

describe('mapTiles', () => {
  test('a flower on the map opens on the canvas as a stored flower, with the gallery’s badge', () => {
    const [tile] = mapTiles([flower({})]);
    expect(tile?.href).toBe('/make?stored=9ac16c8917aa5ca579c8421a');
    expect(tile?.image).toBe('/api/v1/flowers/9ac16c8917aa5ca579c8421a/svg');
    expect(tile?.badge).toBe('on NEAR');
    expect(tile?.title).toBe('House of Stake');
  });

  test('a fixture says so, and a flower with no title is named by its id', () => {
    const [tile] = mapTiles([flower({ where: 'fixture', title: null, id: 'moloch-v1' })]);
    expect(tile?.badge).toBe('fixture');
    expect(tile?.title).toBe('moloch-v1');
    expect(tile?.key).toBe('fixture:moloch-v1');
  });

  test('the order is the API’s', () => {
    const tiles = mapTiles([flower({ id: 'b' }), flower({ id: 'a' })]);
    expect(tiles.map((t) => t.key)).toEqual(['map:b', 'map:a']);
  });
});

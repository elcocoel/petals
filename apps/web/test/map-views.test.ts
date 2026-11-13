// The gallery on the one shared map: a view's tile says its name in people's words,
// and uses the server's picture and address as given.
import { describe, expect, test } from 'vitest';
import { listKeys, type MapViewRow, viewName, viewTile } from '../lib/map-views.ts';
import { HERO_SHA, POWER_MAP, tilesOf } from '../lib/power-map.ts';

const row = (over: Partial<MapViewRow>): MapViewRow => ({
  sha: 'abc',
  name: null,
  title: 'NEAR validators',
  network: 'near-validators',
  chain: 'near:mainnet',
  address: null,
  count: 8487,
  as_of: '2026-11-03T19:42:00Z',
  view_url: 'https://petal-flowers.vercel.app/d/abc',
  picture: 'https://petal-flowers.vercel.app/api/v1/map/abc/svg?look=render%2Fv2&view=1421e0bf7b26',
  keys: [
    { label: 'pool', swatch: 'var(--k-pool)' },
    { label: 'everyone else', swatch: 'var(--tail)' },
  ],
  made_by: null,
  ...over,
});

describe('viewName', () => {
  test("the run's name without its notes, and the part before a slash", () => {
    expect(viewName(row({ name: 'Jito / JTO', title: 'SPL holders jtoj…9mCL' }))).toBe('Jito');
    expect(viewName(row({ name: 'Seeker / SKR (token-only map)' }))).toBe('Seeker');
    expect(viewName(row({ name: 'RaidGuild v3', title: 'RG holders, Gnosis' }))).toBe(
      'RaidGuild v3',
    );
  });
  test('a view made by hand has no run name, so it takes its title', () => {
    expect(viewName(row({}))).toBe('NEAR validators');
  });
});

describe('viewTile', () => {
  test("the server's picture and address as given, the chain as its badge", () => {
    const t = viewTile(
      row({
        name: 'Jito / JTO',
        title: 'SPL holders jtoj…9mCL',
        chain: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      }),
    );
    expect(t.image).toBe(
      'https://petal-flowers.vercel.app/api/v1/map/abc/svg?look=render%2Fv2&view=1421e0bf7b26',
    );
    expect(t.href).toBe('https://petal-flowers.vercel.app/d/abc');
    expect(t.badge).toBe('Solana');
    expect(t.where).toBe('SPL holders jtoj…9mCL   /   3\u00a0Nov\u00a02026');
  });
  test("the title isn't said twice", () => {
    expect(viewTile(row({})).where).toBe('3\u00a0Nov\u00a02026');
  });
});

describe('one key for the gallery', () => {
  test('every colour the pictures draw, once, and everyone else last', () => {
    const keys = listKeys([
      row({}),
      row({
        keys: [
          { label: 'contract', swatch: 'var(--k-contract)' },
          { label: 'everyone else', swatch: 'var(--tail)' },
        ],
      }),
    ]);
    expect(keys).toEqual([
      { label: 'pool', swatch: 'k-pool' },
      { label: 'contract', swatch: 'k-contract' },
      { label: 'everyone else', swatch: 'tail' },
    ]);
  });
});

describe("the landing's Power Map, from the map", () => {
  test("its views in the landing's order, each with the map's picture, address and colours; one off the map is left out", () => {
    const [first, second] = POWER_MAP;
    const tiles = tilesOf([
      row({ sha: second?.sha, picture: 'p2', view_url: 'u2' }),
      row({ sha: first?.sha, picture: 'p1', view_url: 'u1' }),
    ]);
    expect(tiles.map((t) => [t.title, t.image, t.href])).toEqual([
      [first?.title, 'p1', 'u1'],
      [second?.title, 'p2', 'u2'],
    ]);
    // with its map known, a tile opens the map's page
    const [mapped] = tilesOf([row({ sha: first?.sha, map: 'near:mainnet:validators' })]);
    expect(mapped?.href).toBe('/m/near%3Amainnet%3Avalidators');
    expect(tiles[0]?.keys).toEqual([
      { label: 'pool', swatch: 'k-pool' },
      { label: 'everyone else', swatch: 'tail' },
    ]);
    expect(first?.sha).toBe(HERO_SHA);
  });
});

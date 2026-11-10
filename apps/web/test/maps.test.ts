// One map per address (Elco, 10 Nov): the Power Map lists maps, each card opens its map's page, and a page
// lists the map's readings newest first with who made them and their drawings.
import { describe, expect, test } from 'vitest';
import {
  drawingsKeys,
  drawingTile,
  type MapCard,
  mapHref,
  mapsKeys,
  mapTile,
  readingLine,
} from '../lib/maps.ts';

const drawing = (sha: string, keys = [{ label: 'unknown', swatch: 'var(--unknown)' }]) => ({
  sha,
  name: null,
  view_url: `https://petal-flowers.vercel.app/d/${sha}`,
  picture: `https://petal-flowers.vercel.app/api/v1/map/${sha}/svg?look=render%2Fv2`,
  keys,
  made_by: 'mapping.petals.near',
});

const raidguild: MapCard = {
  id: 'gnosis:0x372f6d58c2f5e1eb0a0bc5e2e4bfa7ee0d43b6b3',
  name: 'RaidGuild v3',
  title: 'RG holders, Gnosis',
  about: 'ERC-20 token holders on Gnosis',
  chain: 'gnosis',
  address: '0x372f6d58c2f5e1eb0a0bc5e2e4bfa7ee0d43b6b3',
  picture: 'https://petal-flowers.vercel.app/api/v1/map/bbb/svg?look=render%2Fv2',
  view_url: 'https://petal-flowers.vercel.app/d/bbb',
  keys: [{ label: 'unknown', swatch: 'var(--unknown)' }],
  readings: [
    {
      snapshot: 's2',
      as_of: '2026-11-09T00:47:40Z',
      network: 'erc20-votes',
      about: 'ERC-20 delegates on Gnosis',
      title: 'RG delegates',
      count: 112,
      made_by: 'mapping.petals.near',
      drawings: [drawing('bbb', [{ label: 'contract', swatch: 'var(--k-contract)' }])],
    },
    {
      snapshot: 's1',
      as_of: '2026-11-09T00:45:00Z',
      network: 'erc20-holders',
      about: 'ERC-20 token holders on Gnosis',
      title: 'RG holders, Gnosis',
      count: 158,
      made_by: null,
      drawings: [drawing('aaa'), drawing('ccc')],
    },
  ],
};

describe('the Power Map lists maps', () => {
  test('a card: its name, its address shortened, how many readings and its newest date; it opens the map', () => {
    const t = mapTile(raidguild);
    expect(t.title).toBe('RaidGuild v3');
    expect(t.where).toBe('0x37…b6b3   /   2 readings   /   9 Nov 2026');
    expect(t.badge).toBe('Gnosis');
    expect(t.image).toBe(raidguild.picture);
    expect(t.href).toBe('/m/gnosis%3A0x372f6d58c2f5e1eb0a0bc5e2e4bfa7ee0d43b6b3');
  });
  test('a whole network has no address, and one reading says no count', () => {
    const near = {
      ...raidguild,
      id: 'near:mainnet:validators',
      name: null,
      title: 'NEAR validators',
      address: null,
      chain: 'near:mainnet',
      readings: [raidguild.readings[1] as MapCard['readings'][number]],
    };
    expect(mapTile(near).title).toBe('NEAR validators');
    expect(mapTile(near).where).toBe('9 Nov 2026');
    expect(mapHref(near.id)).toBe('/m/near%3Amainnet%3Avalidators');
  });
  test("one key for the cards' pictures", () => {
    expect(mapsKeys([raidguild])).toEqual([{ label: 'unknown', swatch: 'unknown' }]);
  });
});

describe("a map's page", () => {
  test('each reading says what it read, when, how many and who made it', () => {
    expect(readingLine(raidguild.readings[0] as MapCard['readings'][number])).toBe(
      "RG delegates   ·   9 Nov 2026   ·   112 accounts   ·   Petals' own mapping",
    );
    expect(readingLine(raidguild.readings[1] as MapCard['readings'][number])).toBe(
      'RG holders, Gnosis   ·   9 Nov 2026   ·   158 accounts',
    );
  });
  test('its drawings open themselves, and one key covers them all', () => {
    const r = raidguild.readings[1] as MapCard['readings'][number];
    const t = drawingTile(
      raidguild,
      r,
      r.drawings[0] as MapCard['readings'][number]['drawings'][number],
    );
    expect(t.href).toBe('https://petal-flowers.vercel.app/d/aaa');
    expect(t.title).toBe('RG holders, Gnosis');
    expect(drawingsKeys(raidguild).map((k) => k.label)).toEqual(['contract', 'unknown']);
  });
});

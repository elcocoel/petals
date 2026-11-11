// The far wave's names and marks (#84, #85): each flower named and marked by its map's own mark, where its card has
// one; what it had where it doesn't.
import { describe, expect, test } from 'vitest';
import { type BenchLandscape, withMarks } from '../landscape/land.ts';
import type { MapMark } from '../lib/maps.ts';

const land = {
  flowers: [
    {
      name: 'UNI',
      mark: { logo: null, symbol: 'UNI' },
      map: 'eip155:1:0x1f98',
      place: {},
      reading: {},
    },
    {
      name: 'RG',
      mark: { logo: null, symbol: 'RG' },
      map: 'eip155:100:0x372f',
      place: {},
      reading: {},
    },
    { name: 'x', mark: { logo: null, symbol: 'X' }, map: null, place: {}, reading: {} },
  ],
  roads: [],
  chains: [],
} as unknown as BenchLandscape;

const part = (value: string) => ({ value, status: 'self-declared', source: 'chain' });

describe('the far wave named by marks', () => {
  test("a map's mark names its flower and gives its logo and symbol", () => {
    const marks = new Map<string, MapMark | null>([
      [
        'eip155:1:0x1f98',
        {
          name: part('Uniswap'),
          symbol: part('UNI'),
          logo: {
            url: 'https://petal-flowers.vercel.app/api/v1/media/a.png',
            status: 'verified',
            source: 'trustwallet',
          },
          read_at: '2026-11-11T00:00:00Z',
        },
      ],
      [
        'eip155:100:0x372f',
        { name: null, symbol: part('RG'), logo: null, read_at: '2026-11-11T00:00:00Z' },
      ],
    ]);
    const [uni, rg, other] = withMarks(land, marks).flowers;
    expect(uni?.name).toBe('Uniswap');
    expect(uni?.mark.logo).toMatch(/media\/a\.png$/);
    // no name in its mark: the flower keeps its own
    expect(rg?.name).toBe('RG');
    expect(other).toEqual(land.flowers[2]);
  });
});

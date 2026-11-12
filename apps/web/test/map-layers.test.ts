// A map's layers each say the period their data covers and who mapped them (Elco's walk 3), as the card says.
import type { Claim } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { type LayerCard, mapLayers } from '../lib/map-layers.ts';

const card: LayerCard = {
  readings: [
    {
      snapshot: 's1',
      as_of: '2026-11-11T16:01:38.934Z',
      network: 'sputnik-dao',
      about: 'Sputnik DAO members on NEAR',
      title: 'ref-finance',
      count: 46,
      made_by: 'mapping.petals.near',
      drawings: [],
    },
  ],
  value: {
    asset: { id: 'near:native', symbol: 'NEAR' },
    price: {
      usd: 3.74,
      source: '1click',
      ref: 'tokens (https://1click.example/v0/tokens)',
      at: '2026-11-11T16:00:31.435Z',
    },
    supply: null,
    supply_usd: null,
    total_usd: null,
    measure: null,
    totals: [],
    snapshot: null,
    read_at: '2026-11-11T16:00:31.435Z',
  },
  proposals: { count: 1060, read_at: '2026-11-11T16:01:45.540Z' },
};

const said = (at: string, by = 'tool:codex-solana-wave@1') => ({ issued_at: at, by }) as Claim;

describe('a map’s layers', () => {
  test('each reading as of its moment, with how many and who mapped it', () => {
    expect(mapLayers(card, null)[0]).toEqual({
      key: 'reading:s1',
      name: 'Sputnik DAO members on NEAR',
      period: 'As of 11 Nov 2026',
      count: '46 accounts',
      by: "Petals' own mapping",
    });
  });
  test('proposals over the span the card gives, or when they were read', () => {
    expect(mapLayers(card, null)[1]?.period).toBe('Read 11 Nov 2026');
    const spanned: LayerCard = {
      ...card,
      proposals: {
        count: 1060,
        read_at: '2026-11-11T16:01:45.540Z',
        period: { from: '2021-06-30T23:01:52Z', to: '2026-11-05T12:47:40Z' },
      },
    };
    expect(mapLayers(spanned, null)[1]?.period).toBe('30 Jun 2021 to 5 Nov 2026');
  });
  test('the price on its day, from its source, linked', () => {
    expect(mapLayers(card, null)[2]).toMatchObject({
      name: 'NEAR price',
      period: 'On 11 Nov 2026',
      count: '$3.74',
      by: '1Click',
      link: 'https://1click.example/v0/tokens',
    });
  });
  test('insights over the days they were said', () => {
    const lines = mapLayers(card, [said('2026-11-09T10:00:00Z'), said('2026-11-11T10:00:00Z')]);
    expect(lines.at(-1)).toMatchObject({
      name: 'Insights',
      period: '9 Nov 2026 to 11 Nov 2026',
      count: '2',
    });
  });
});

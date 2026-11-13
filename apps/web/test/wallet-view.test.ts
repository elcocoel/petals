// A chosen wallet in Information says only what its reading says (WORKSPACE, wave 4).
import type { ReadingPetal } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import type { MapValue } from '../lib/value-view.ts';
import { differsOf, walletView } from '../lib/wallet-view.ts';

const petal = {
  id: 'cronus.near',
  name: 'cronus.near',
  kind: 'unknown',
  identity: null,
  amount: '534',
  share: 0.081877,
} as unknown as ReadingPetal;

const value: MapValue = {
  asset: { id: 'near:native', symbol: 'NEAR' },
  price: { usd: 3.74, source: '1click', ref: '', at: '2026-11-11T16:00:31.435Z' },
  supply: null,
  supply_usd: null,
  total_usd: null,
  measure: 'native_balance',
  totals: [{ measure: 'native_balance', unit: 'NEAR', amount: '1046', usd: null }],
  snapshot: null,
  read_at: '2026-11-11T16:00:31.435Z',
};

describe('a chosen wallet', () => {
  test('its facts, its holding in the map’s unit, its dollars at the price', () => {
    const v = walletView(petal, value);
    expect(v.title).toBe('cronus.near');
    expect(v.address).toBeNull();
    expect(v.facts).toEqual([
      ['Who it is', 'Not named yet'],
      ['Kind', 'unknown'],
      ['Holds', '534 NEAR'],
      ['Share', '8.19%'],
    ]);
    expect(v.worth?.text).toBe('$1,997 at $3.74 per NEAR');
  });
  test('no price, no dollars; a name beside its address', () => {
    const v = walletView({ ...petal, name: 'Cronus', identity: null }, null);
    expect(v.worth).toBeNull();
    expect(v.address).toBe('cronus.near');
    expect(v.facts[2]).toEqual(['Holds', '534']);
  });
});

describe('where authors differ on a wallet', () => {
  test('each piece, each value with who stated it, named as the map says', () => {
    const credit = {
      pieces: {
        amount: {
          'cronus.near': {
            by: ['near:mainnet:mapping.petals.near'],
            differs: [{ value: '535', by: ['near:mainnet:elco.near'] }],
          },
        },
        kind: { 'cronus.near': {} },
      },
      authors: { 'near:mainnet:mapping.petals.near': { name: "Petals' mapping" } },
    };
    expect(differsOf(credit, 'cronus.near', (p) => p)).toEqual([
      { what: 'amount', drawnBy: "Petals' mapping", values: [{ value: '535', by: 'elco.near' }] },
    ]);
    expect(differsOf(undefined, 'cronus.near', (p) => p)).toEqual([]);
  });
});

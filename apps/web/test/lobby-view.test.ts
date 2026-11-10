// The lobby's map (Elco, 10 Nov: one map): every view on the one shared map, read as the gallery reads it,
// with its picture as SYSTEMS draws it, opening where it lives. And the profile part's money.
import { describe, expect, test } from 'vitest';
import type { MapViewRow } from '../lib/flower-view.ts';
import {
  canWithdraw,
  fundsWords,
  mapTiles,
  nearOf,
  shownAccount,
  WITHDRAW_ALL,
  withdrawn,
} from '../lib/lobby-view.ts';

const view = (over: Partial<MapViewRow>): MapViewRow => ({
  sha: '3f0c9a1b2d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5061728394a5b6c7d8e',
  name: null,
  title: 'House of Stake',
  network: 'near-house-of-stake',
  about: 'House of Stake on NEAR',
  chain: 'near',
  address: null,
  count: 412,
  as_of: '2026-11-05T10:00:00Z',
  made_by: 'mapping.petals.near',
  view_url: 'https://petal-flowers.vercel.app/d/3f0c9a1b',
  picture: '/api/v1/map/3f0c9a1b/svg?look=render%2Fv2&view=1421e0bf7b26',
  ...over,
});

describe('mapTiles', () => {
  test('a view opens where it lives, with the picture as given and its chain as the badge', () => {
    const [tile] = mapTiles([view({})]);
    expect(tile?.href).toBe('https://petal-flowers.vercel.app/d/3f0c9a1b');
    expect(tile?.image).toBe('/api/v1/map/3f0c9a1b/svg?look=render%2Fv2&view=1421e0bf7b26');
    expect(tile?.badge).toBe('NEAR');
    expect(tile?.title).toBe('House of Stake');
    expect(tile?.where).toBe('House of Stake on NEAR   /   5 Nov 2026');
  });

  test('under the title, what the view maps in the map’s own words, with its date', () => {
    const [tile] = mapTiles([
      view({ about: 'SPL token holders on Solana', as_of: '2026-11-09T00:00:00Z' }),
    ]);
    expect(tile?.where).toBe('SPL token holders on Solana   /   9 Nov 2026');
  });

  test('a view someone named on the map shows that name', () => {
    const [tile] = mapTiles([view({ name: 'RaidGuild' })]);
    expect(tile?.title).toBe('RaidGuild');
  });

  test('a chain other than NEAR says its name', () => {
    const [tile] = mapTiles([view({ chain: 'ethereum' })]);
    expect(tile?.badge).toBe('Ethereum');
  });

  test('every view, in the API’s order, each once', () => {
    const tiles = mapTiles([view({ sha: 'b' }), view({ sha: 'a' })]);
    expect(tiles.map((t) => t.key)).toEqual(['b', 'a']);
  });
});

describe('the profile part’s money', () => {
  test('yoctoNEAR reads as NEAR to two places, rounded to the nearest hundredth', () => {
    expect(nearOf('840000000000000000000000')).toBe('0.84');
    expect(nearOf('0')).toBe('0.00');
    expect(nearOf('1')).toBe('0.00');
    expect(nearOf('4995000000000000000000')).toBe('0.00');
    expect(nearOf('5000000000000000000000')).toBe('0.01');
    expect(nearOf('12345000000000000000000000')).toBe('12.35');
  });

  test('what came out is the balance before less the balance after', () => {
    expect(withdrawn('840000000000000000000000', '0')).toBe('0.84');
    expect(fundsWords.withdrew(withdrawn('840000000000000000000000', '0'))).toBe(
      'Withdrew 0.84 NEAR.',
    );
  });

  test('Withdraw is there only while the contract holds something', () => {
    expect(canWithdraw('1')).toBe(true);
    expect(canWithdraw('0')).toBe(false);
  });

  test('the wallet takes everything out: withdraw, no amount, the 1 yoctoNEAR the contract asks', () => {
    expect(WITHDRAW_ALL).toEqual({
      type: 'FunctionCall',
      params: { methodName: 'withdraw', args: {}, gas: '30000000000000', deposit: '1' },
    });
  });
});

describe('the profile part’s account', () => {
  test('a 64-character implicit account shows its first six and last four, and in full for the pointer', () => {
    const id = '02b85f8c8bbfbcc34f4d30b55724f36336768f05c27c2d7f97936e5d699018fc';
    expect(shownAccount(id)).toEqual({ shown: '02b85f…18fc', full: id });
  });

  test('a named account shows as it is', () => {
    expect(shownAccount('petals.near')).toEqual({ shown: 'petals.near', full: 'petals.near' });
  });
});

// The lobby's flowers (specs/004-workspace, W3): each reads as in the gallery and opens on the canvas.
import { describe, expect, test } from 'vitest';
import type { ListedFlower } from '../lib/flower-view.ts';
import {
  canWithdraw,
  fundsWords,
  mapTiles,
  nearOf,
  shownAccount,
  WITHDRAW_ALL,
  withdrawn,
} from '../lib/lobby-view.ts';

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

  test('the site’s own copies (fixtures) are left out, so a flower never shows twice', () => {
    const tiles = mapTiles([flower({}), flower({ where: 'fixture', id: 'near-validators' })]);
    expect(tiles.map((t) => t.key)).toEqual(['map:9ac16c8917aa5ca579c8421a']);
  });

  test('a flower with no title is named by its id', () => {
    const [tile] = mapTiles([flower({ title: null, id: 'moloch-v1' })]);
    expect(tile?.title).toBe('moloch-v1');
  });

  test('the order is the API’s', () => {
    const tiles = mapTiles([flower({ id: 'b' }), flower({ id: 'a' })]);
    expect(tiles.map((t) => t.key)).toEqual(['map:b', 'map:a']);
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

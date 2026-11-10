// The lobby's words and arithmetic: the profile part's money, and the account as it's shown.
import { describe, expect, test } from 'vitest';
import {
  canWithdraw,
  fundsWords,
  nearOf,
  shownAccount,
  WITHDRAW_ALL,
  withdrawn,
} from '../lib/lobby-view.ts';

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

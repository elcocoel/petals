// The lobby's words and arithmetic: the profile part's money, and the account as it's shown.
import { describe, expect, test } from 'vitest';
import {
  canWithdraw,
  fundsWords,
  nearOf,
  shownAccount,
  WITHDRAW_ALL,
  withdrawn,
  withdrawView,
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

describe('Withdraw says what it can and can’t take out', () => {
  test('with no contract, no Withdraw', () => {
    expect(withdrawView(null, 1, 3.46)).toBeNull();
    expect(withdrawView('0', 1, null)).toBeNull();
  });

  test('credit from before the contract: Withdraw is there, takes nothing, and says why', () => {
    const v = withdrawView('0', 1, 3.46);
    expect(v?.enabled).toBe(false);
    expect(v?.can).toBe(fundsWords.nothingToWithdraw);
    expect(v?.cannot).toBe(fundsWords.cannotWithdraw({ usd: '1.00', near: '0.29' }));
  });

  test('what the contract holds can come out; the rest says why it can’t', () => {
    const all = withdrawView('840000000000000000000000', 3.0408, 3.62);
    expect(all?.enabled).toBe(true);
    expect(all?.can).toBe(fundsWords.canWithdraw({ usd: '3.04', near: '0.84' }));
    expect(all?.cannot).toBeNull();
    const both = withdrawView('840000000000000000000000', 4.0408, 3.62);
    expect(both?.cannot).toBe(fundsWords.cannotWithdraw({ usd: '1.00', near: '0.28' }));
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

// The payment step: what a payment sends, what's left (dollars first, NEAR beside), and where the chat offers it.

import { DEFAULT_VIEW } from '@petal/core/view';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { PayRow } from '../components/chat/PayRow.tsx';
import {
  money,
  moneyWords,
  nearFor,
  PAY_NEAR,
  payAction,
  payWords,
  sentBy,
  yoctoOf,
} from '../lib/pay.ts';
import { threadView } from '../lib/thread-view.ts';

describe('paying for Petals’ agent', () => {
  test('a transfer is written in yoctoNEAR, exactly', () => {
    expect(yoctoOf(1)).toBe('1000000000000000000000000');
    expect(yoctoOf(0.5)).toBe('500000000000000000000000');
  });

  test('money reads dollars first, NEAR beside at today’s price', () => {
    expect(money(2, 4)).toEqual({ usd: '2.00', near: '0.50' });
    expect(moneyWords(money(2, 4))).toBe('$2.00 · 0.50 NEAR');
    expect(payWords.balance(money(1, 3.62))).toBe('Balance: $1.00 · 0.28 NEAR');
  });

  test('a small cost keeps its places, so it never reads as nothing; a balance takes two', () => {
    expect(money(0.012, 3.6, 'cost')).toEqual({ usd: '0.012', near: '0.003' });
    expect(money(0.0042, 3.6, 'cost')).toEqual({ usd: '0.004', near: '0.001' });
    expect(money(0.0005, 3.6, 'cost')).toEqual({ usd: '0.0005', near: '0.0001' });
    expect(money(0.012, 3.6)).toEqual({ usd: '0.01', near: '0.00' });
    expect(money(0, 3.6)).toEqual({ usd: '0.00', near: '0.00' });
  });

  test('with no price, dollars alone; a negative credit is none', () => {
    expect(moneyWords(money(1, null))).toBe('$1.00');
    expect(money(-1, 4)).toEqual({ usd: '0.00', near: '0.00' });
  });

  test('with the credit contract it deposits; without it, a plain transfer', () => {
    const base = { network: 'testnet' as const, receiver: 'r', near_usd: 3 };
    expect(payAction({ ...base, method: 'deposit' }, '5')).toEqual({
      type: 'FunctionCall',
      params: { methodName: 'deposit', args: {}, gas: '30000000000000', deposit: '5' },
    });
    expect(payAction({ ...base, method: null }, '5')).toEqual({
      type: 'Transfer',
      params: { deposit: '5' },
    });
  });

  test('the hash and the account come from the wallet’s answer', () => {
    expect(sentBy({ transaction: { hash: 'H', signer_id: 'a.near' } })).toEqual({
      hash: 'H',
      account: 'a.near',
    });
    expect(sentBy({})).toBeNull();
  });

  test('out of credit, the chat shows the way to add some instead of an error', () => {
    const items = [{ kind: 'error' as const, code: 'payment_required', message: 'no credit' }];
    const rows = threadView({
      items,
      view: DEFAULT_VIEW,
      busy: false,
      runId: null,
      turn: 'idle',
      lostAgain: false,
      recorded: false,
    });
    expect(rows.map((r) => r.kind)).toEqual(['pay']);
  });

  test('the row offers one payment, waits for the wallet, then says what was added', () => {
    const at = (phase: 'ready' | 'paying' | 'added', added: string | null = null) =>
      renderToStaticMarkup(createElement(PayRow, { phase, added, onPay: () => {} }));
    expect(at('ready')).toContain(payWords.button(PAY_NEAR));
    expect(at('paying')).toContain(payWords.paying);
    expect(at('added', '1')).toContain(payWords.added('1'));
  });
});

describe('about $1, never twice', () => {
  test('dollars become NEAR at today’s price, in thousandths, never less than asked', () => {
    expect(nearFor(1, 3.42)).toBe(0.293);
    expect(nearFor(1, null)).toBeNull();
    expect(nearFor(0, 3.42)).toBeNull();
    expect(payWords.buttonUsd(money(1, 3.42))).toBe('Add $1.00 · 0.29 NEAR');
  });

  test('the row lets the person set the dollars, and a transfer that went out is confirmed, not sent again', () => {
    const row = (props: Record<string, unknown>) =>
      renderToStaticMarkup(
        createElement(PayRow, { phase: 'ready', added: null, onPay: () => {}, ...props }),
      );
    const asking = row({
      label: payWords.buttonUsd(money(1, 3.42)),
      amount: { usd: '1', label: payWords.amount, onUsd: () => {} },
    });
    expect(asking).toContain(payWords.amount);
    expect(asking).toContain('Add $1.00 · 0.29 NEAR');
    const waiting = row({
      phase: 'failed',
      label: payWords.confirm,
      amount: null,
      failedWords: payWords.pending,
    });
    expect(waiting).toContain(payWords.confirm);
    expect(waiting).toContain(payWords.pending);
    expect(waiting).not.toContain(payWords.amount);
  });
});

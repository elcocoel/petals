// B, the payment step: what a payment sends, what's left in NEAR, and where the chat offers it.

import { DEFAULT_VIEW } from '@petal/core/view';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { PayRow } from '../components/chat/PayRow.tsx';
import { nearLeft, PAY_NEAR, payAction, payWords, sentBy, yoctoOf } from '../lib/pay.ts';
import { threadView } from '../lib/thread-view.ts';

describe('paying for Petals’ agent', () => {
  test('a transfer is written in yoctoNEAR, exactly', () => {
    expect(yoctoOf(1)).toBe('1000000000000000000000000');
    expect(yoctoOf(0.5)).toBe('500000000000000000000000');
  });

  test('what’s left shows in NEAR at today’s price, and nothing without credit or a price', () => {
    const credit = { funded_usd: 3, spent_usd: 1, left_usd: 2, usd_per_chat: 0.01 };
    expect(nearLeft(credit, 4)).toBe('0.50');
    expect(nearLeft(null, 4)).toBeNull();
    expect(nearLeft(credit, null)).toBeNull();
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

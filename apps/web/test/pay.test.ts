// B, the payment step: what a payment sends, what's left (dollars first, NEAR beside), and where the chat offers it.

import { DEFAULT_VIEW } from '@petal/core/view';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { ConnectWallet } from '../components/chat/ConnectWallet.tsx';
import { PayRow } from '../components/chat/PayRow.tsx';
import { notSignedInWords } from '../lib/door-words.ts';
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
import { payFromMine } from '../viewmodels/usePay.ts';

describe('paying for Petals’ agent', () => {
  test('a transfer is written in yoctoNEAR, exactly', () => {
    expect(yoctoOf(1)).toBe('1000000000000000000000000');
    expect(yoctoOf(0.5)).toBe('500000000000000000000000');
  });

  test('money reads dollars first, NEAR beside at today’s price (Elco, 10 Nov)', () => {
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

describe('about $1, never twice (wave 5, Elco’s mainnet test)', () => {
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

describe('the NEAR comes from one of their own wallets (flow 3, 13 Nov)', () => {
  const deps = (o: { mine?: string[]; connected?: string | null; link?: string | null | Error }) => {
    const calls: string[] = [];
    return {
      calls,
      d: {
        mine: async () => {
          calls.push('mine');
          return o.mine ?? [];
        },
        connected: async () => {
          calls.push('connected');
          return o.connected ?? null;
        },
        link: async () => {
          calls.push('link');
          if (o.link instanceof Error) throw o.link;
          return o.link === undefined ? 'linked.near' : o.link;
        },
      },
    };
  };

  test('a connected wallet that is theirs sends at once, with nothing more to sign', async () => {
    const { d, calls } = deps({ mine: ['a.near'], connected: 'a.near' });
    expect(await payFromMine(d)).toBe(true);
    expect(calls).not.toContain('link');
  });

  test('signed in with Ethereum or Solana, the NEAR wallet is bound first, before any NEAR leaves', async () => {
    const none = deps({ mine: [], connected: null });
    expect(await payFromMine(none.d)).toBe(true);
    expect(none.calls).toContain('link');
    const other = deps({ mine: ['a.near'], connected: 'b.near' });
    expect(await payFromMine(other.d)).toBe(true);
    expect(other.calls).toContain('link');
  });

  test('closing the wallet stops it; the server’s refusal comes back as its words, and nothing is sent', async () => {
    expect(await payFromMine(deps({ link: null }).d)).toBe(false);
    await expect(
      payFromMine(deps({ link: new Error('That wallet already belongs to another account.') }).d),
    ).rejects.toThrow('That wallet already belongs to another account.');
  });

  test('a transfer already out from a wallet that isn’t theirs is bound first, then confirmed', async () => {
    const out = deps({ mine: ['a.near'], connected: 'a.near' });
    expect(await payFromMine(out.d, 'b.near')).toBe(true);
    expect(out.calls).toEqual(['mine', 'link']);
    const theirs = deps({ mine: ['b.near'] });
    expect(await payFromMine(theirs.d, 'b.near')).toBe(true);
    expect(theirs.calls).toEqual(['mine']);
  });
});

describe('the conversation’s Connect offers NEAR, Ethereum and Solana (flow 1, 13 Nov)', () => {
  test('three ways in, as the signed-out page has them', () => {
    const html = renderToStaticMarkup(
      createElement(ConnectWallet, {
        question: '',
        busy: false,
        failed: null,
        onConnect: () => {},
        onConnectEvm: () => {},
        onConnectSolana: () => {},
      }),
    );
    expect(html).toContain(notSignedInWords.near);
    expect(html).toContain(notSignedInWords.evm);
    expect(html).toContain(notSignedInWords.solana);
  });
});

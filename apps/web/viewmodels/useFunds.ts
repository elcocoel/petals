// The person's money, the one balance (Elco, 9 and 10 Nov; "the balance hasn't updated", 10 Nov): the credit
// they hold (GET /api/v1/me's credit, which plain transfers to Petals and credit given by hand both go onto,
// in NEAR at today's price; with the contract, what it holds, read from the chain). It's read once, in the
// layout (viewmodels/useWorkPanel.ts), and again whenever `cue` changes: after each turn and on every move,
// and after a payment (reread). /make's composer, the panel's Lobby section and the
// lobby's Balance card all show this one value. And Withdraw, which takes everything out of the contract
// while it holds something: the person's own wallet calls the contract, and the server reads that
// transaction back and says what's left (POST /api/v1/pay). There is no timer. lib/lobby-view.ts holds the
// arithmetic and the words.
import { useCallback, useEffect, useState } from 'react';
import { confirmPay, readCredit, readPay } from '../lib/agent-client.ts';
import { type HeldCredit, WITHDRAW_ALL, type WithdrawPhase, withdrawn } from '../lib/lobby-view.ts';
import { type Credit, nearLeft, type PayInfo, sentBy } from '../lib/pay.ts';
import { sendAction } from '../lib/wallet.ts';

export function useFunds(cue: string) {
  const [info, setInfo] = useState<PayInfo | null>(null);
  /** The person's credit, as /make reads it. */
  const [credit, setCredit] = useState<Credit | null>(null);
  /** What the contract holds for the person, in yoctoNEAR; null when there's no contract to hold it. */
  const [held, setHeld] = useState<string | null>(null);
  const [phase, setPhase] = useState<WithdrawPhase>('ready');
  const [withdrew, setWithdrew] = useState<string | null>(null);
  /** Bumped by reread(), so the read runs again with the same cue. */
  const [again, setAgain] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: cue and again say when to read again; the read uses neither
  useEffect(() => {
    let gone = false;
    void Promise.all([readCredit(), readPay()]).then(
      ([c, p]) => {
        if (gone) return;
        setInfo(p);
        // with the contract, what it holds now, read from the chain, is the truer balance (as usePay)
        setCredit(p?.credit ?? c);
        setHeld((p?.credit as HeldCredit | null | undefined)?.balance_yocto ?? null);
      },
      // no answer shows no balance
      () => {},
    );
    return () => {
      gone = true;
    };
  }, [cue, again]);

  /** Reads the credit again now: after a payment, as the pay step's own read used to. */
  const reread = useCallback(() => setAgain((n) => n + 1), []);

  const withdraw = useCallback(() => {
    if (!info || held === null) return;
    const before = held;
    setPhase('withdrawing');
    void (async () => {
      try {
        const sent = sentBy(await sendAction(info.network, info.receiver, WITHDRAW_ALL));
        if (!sent) throw new Error('The wallet named no transaction.');
        const after = await confirmPay({
          network: info.network,
          account_id: sent.account,
          tx_hash: sent.hash,
        });
        const left = (after.credit as HeldCredit).balance_yocto ?? '0';
        setWithdrew(withdrawn(before, left));
        setCredit(after.credit);
        setHeld(left);
        setPhase('withdrew');
      } catch {
        setPhase('failed');
      }
    })();
  }, [info, held]);

  return {
    /** Where a payment goes and NEAR's price (GET /api/v1/pay), read with the credit: the pay step's too. */
    where: info,
    /**
     * The credit in NEAR, as /make shows it; nothing given yet is none. Null until it's read, or with no
     * price to show it in.
     */
    balance: info
      ? credit
        ? nearLeft(credit, info.near_usd)
        : info.near_usd
          ? '0.00'
          : null
      : null,
    held,
    phase,
    withdrew,
    withdraw,
    reread,
  };
}

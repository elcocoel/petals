// The person's money, the one balance, kept up to date: the credit
// they hold (GET /api/v1/me's credit, which plain transfers to Petals and credit given by hand both go onto,
// in NEAR at today's price; with the contract, what it holds, read from the chain), and what's left on the
// invites a chat of theirs falls back on, so a person on an invite reads what they can spend (13 Nov). It's read once, in the
// layout (viewmodels/useWorkPanel.ts), and again whenever `cue` changes: after each turn and on every move,
// and after a payment (reread). /make's composer, the panel's Lobby section and the
// lobby's Balance card all show this one value. And Withdraw, always there with the contract and saying what
// it can take out (what the contract holds) and what it can't (credit off the contract), which takes everything
// out of the contract while it holds something: the person's own wallet calls the contract, and the server reads that
// transaction back and says what's left (POST /api/v1/pay). There is no timer. lib/lobby-view.ts holds the
// arithmetic and the words.
import { useCallback, useEffect, useState } from 'react';
import { confirmPay, readCredit, readPay } from '../lib/agent-client.ts';
import {
  type HeldCredit,
  WITHDRAW_ALL,
  type WithdrawPhase,
  withdrawn,
  withdrawView,
} from '../lib/lobby-view.ts';
import { type Credit, type Money, money, type PayInfo, sentBy } from '../lib/pay.ts';
import { profilePageWords, walletRefusal } from '../lib/profile-view.ts';
import { connectWallet, sendAction } from '../lib/wallet.ts';

export function useFunds(cue: string) {
  const [info, setInfo] = useState<PayInfo | null>(null);
  /** The person's credit, as /make reads it. */
  const [credit, setCredit] = useState<Credit | null>(null);
  /** Dollars left on their usable invites (GET /api/v1/me's invite_left_usd). */
  const [inviteLeft, setInviteLeft] = useState(0);
  /** What the contract holds for the person, in yoctoNEAR; null when there's no contract to hold it. */
  const [held, setHeld] = useState<string | null>(null);
  const [phase, setPhase] = useState<WithdrawPhase>('ready');
  const [withdrew, setWithdrew] = useState<string | null>(null);
  /** Why the last withdrawal didn't go through, as the wallet or Petals said it. */
  const [failedWhy, setFailedWhy] = useState<string | null>(null);
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
        setCredit(p?.credit ?? c.credit);
        setInviteLeft(c.inviteLeftUsd);
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
    setFailedWhy(null);
    void (async () => {
      // the person's own NEAR wallet sends it: connected first (its picker opens when none is), and what it
      // says, a no included, is said as it said it
      let sent: ReturnType<typeof sentBy>;
      try {
        await connectWallet(info.network);
        sent = sentBy(await sendAction(info.network, info.receiver, WITHDRAW_ALL));
        if (!sent) throw new Error('The wallet named no transaction.');
      } catch (e) {
        setFailedWhy(walletRefusal(profilePageWords.nearWallet, e));
        setPhase('failed');
        return;
      }
      try {
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
      } catch (e) {
        setFailedWhy(e instanceof Error && e.message ? e.message : null);
        setPhase('failed');
      }
    })();
  }, [info, held]);

  const balanceUsd = (credit?.left_usd ?? 0) + inviteLeft;
  return {
    /** Where a payment goes and NEAR's price (GET /api/v1/pay), read with the credit: the pay step's too. */
    where: info,
    /**
     * What's left, dollars first and NEAR beside at today's price , their own and on their
     * invites; nothing given yet is none. Null until Petals has said.
     */
    balance: (info ? money(balanceUsd, info.near_usd) : null) as Money | null,
    held,
    /** Withdraw, with the contract: what it takes out and what stays, and why; null with no contract. */
    withdrawal: withdrawView(held, balanceUsd, info?.near_usd ?? null),
    phase,
    withdrew,
    /** Why the last withdrawal didn't go through; null for the plain words. */
    failedWhy,
    withdraw,
    reread,
  };
}

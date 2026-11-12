// Paying for Petals' agent (B): the one payment, which the wallet sends and the server checks on chain, to
// where GET /api/v1/pay says. That's read once, with the one balance (useFunds, in the layout), and handed in
// as `where`; `paid` reads both again once a payment lands. lib/pay.ts holds the arithmetic and the words.
// The person sets how many dollars (about $1 to start, Elco's mainnet test), and a transfer the wallet sent is
// kept until the server confirms it, so pressing again never sends a second one (wave 5).
import { useCallback, useEffect, useState } from 'react';
import { confirmPay } from '../lib/agent-client.ts';
import {
  money,
  nearFor,
  PAY_NEAR,
  PAY_USD,
  type PayInfo,
  type PayPhase,
  PENDING_KEY,
  type PendingPay,
  payAction,
  payWords,
  sentBy,
  yoctoOf,
} from '../lib/pay.ts';
import { sendAction } from '../lib/wallet.ts';

const readPending = (): PendingPay | null => {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingPay) : null;
  } catch {
    return null;
  }
};

const keepPending = (p: PendingPay | null) => {
  try {
    if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // a browser that keeps nothing: the page still holds it until it's closed
  }
};

/** `asking` is the newest pay row's key: a new one starts a new payment. */
export function usePay(
  /** Where a payment goes and NEAR's price, as the one balance read them; null until it has. */
  where: PayInfo | null,
  asking: string | null,
  /** The one balance's re-read, once a payment has landed. */
  paid: () => void,
) {
  const [phase, setPhase] = useState<PayPhase>('ready');
  const [added, setAdded] = useState<string | null>(null);
  const [usd, setUsd] = useState(String(PAY_USD));
  const [pending, setPending] = useState<PendingPay | null>(null);
  useEffect(() => setPending(readPending()), []);
  const [askedBy, setAskedBy] = useState(asking);
  // adjusted during render, as React allows: a new refusal is a new payment
  if (asking !== askedBy) {
    setAskedBy(asking);
    setPhase('ready');
    setAdded(null);
  }

  const amount = Number(usd);
  const near = nearFor(amount, where?.near_usd ?? null);

  const confirm = useCallback(
    async (p: PendingPay) => {
      const done = await confirmPay({ network: p.network, account_id: p.account, tx_hash: p.hash });
      keepPending(null);
      setPending(null);
      setAdded(String(done.added_near));
      setPhase('added');
      paid();
    },
    [paid],
  );

  const pay = useCallback(async () => {
    if (!where) {
      setPhase('failed');
      return;
    }
    setPhase('paying');
    try {
      // a transfer already out: confirm that one, never send again
      const out = pending ?? readPending();
      if (out) {
        await confirm(out);
        return;
      }
      const send = near ?? PAY_NEAR;
      const action = payAction(where, yoctoOf(send));
      const sent = sentBy(await sendAction(where.network, where.receiver, action));
      if (!sent) throw new Error('no transaction');
      const p: PendingPay = {
        network: where.network,
        account: sent.account,
        hash: sent.hash,
        near: send,
      };
      keepPending(p);
      setPending(p);
      await confirm(p);
    } catch {
      setPhase('failed');
    }
  }, [where, pending, near, confirm]);

  const label = pending
    ? payWords.confirm
    : near !== null
      ? payWords.buttonUsd(money(amount, where?.near_usd ?? null))
      : payWords.button(PAY_NEAR);

  return {
    /** The pay row that's live; earlier ones were answered or passed. */
    asking,
    phase,
    added,
    /** what the press says, and the dollars the person chose (none to choose while a transfer waits) */
    label,
    amount: pending || near === null ? null : { usd, label: payWords.amount, onUsd: setUsd },
    /** a transfer out and not confirmed yet: what the row says after a failed press */
    failedWords: pending ? payWords.pending : payWords.failed,
    canPay: Boolean(pending) || near === null || amount > 0,
    pay: () => void pay(),
  };
}

// Paying for Petals' agent (B): the one payment, which the wallet sends and the server checks on chain, to
// where GET /api/v1/pay says. That's read once, with the one balance (useFunds, in the layout), and handed in
// as `where`; `paid` reads both again once a payment lands. lib/pay.ts holds the arithmetic and the words.
import { useCallback, useState } from 'react';
import { confirmPay } from '../lib/agent-client.ts';
import { PAY_NEAR, type PayInfo, type PayPhase, payAction, sentBy, yoctoOf } from '../lib/pay.ts';
import { sendAction } from '../lib/wallet.ts';

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
  const [askedBy, setAskedBy] = useState(asking);
  // adjusted during render, as React allows: a new refusal is a new payment
  if (asking !== askedBy) {
    setAskedBy(asking);
    setPhase('ready');
    setAdded(null);
  }

  const pay = useCallback(async () => {
    if (!where) {
      setPhase('failed');
      return;
    }
    setPhase('paying');
    try {
      const action = payAction(where, yoctoOf(PAY_NEAR));
      const sent = sentBy(await sendAction(where.network, where.receiver, action));
      if (!sent) throw new Error('no transaction');
      const done = await confirmPay({
        network: where.network,
        account_id: sent.account,
        tx_hash: sent.hash,
      });
      setAdded(String(done.added_near));
      setPhase('added');
      paid();
    } catch {
      setPhase('failed');
    }
  }, [where, paid]);

  return {
    /** The pay row that's live; earlier ones were answered or passed. */
    asking,
    phase,
    added,
    pay: () => void pay(),
  };
}

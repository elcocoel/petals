// Paying for Petals' agent (B): the one payment, which the wallet sends and the server checks on chain, to
// where GET /api/v1/pay says, read when someone is signed in. The balance it changes is the one balance
// (useFunds, in the layout), which `paid` reads again once a payment lands. lib/pay.ts holds the arithmetic
// and the words.
import { useCallback, useEffect, useState } from 'react';
import { confirmPay, readPay } from '../lib/agent-client.ts';
import { PAY_NEAR, type PayInfo, type PayPhase, payAction, sentBy, yoctoOf } from '../lib/pay.ts';
import { sendAction } from '../lib/wallet.ts';

/** `asking` is the newest pay row's key: a new one starts a new payment. */
export function usePay(
  signedIn: boolean,
  busy: boolean,
  asking: string | null,
  /** The one balance's re-read, once a payment has landed. */
  paid: () => void,
) {
  const [info, setInfo] = useState<PayInfo | null>(null);
  const [phase, setPhase] = useState<PayPhase>('ready');
  const [added, setAdded] = useState<string | null>(null);
  const [askedBy, setAskedBy] = useState(asking);
  // adjusted during render, as React allows: a new refusal is a new payment
  if (asking !== askedBy) {
    setAskedBy(asking);
    setPhase('ready');
    setAdded(null);
  }

  useEffect(() => {
    if (!signedIn || busy) return;
    let gone = false;
    void readPay().then(
      (p) => {
        if (!gone) setInfo(p);
      },
      () => {},
    );
    return () => {
      gone = true;
    };
  }, [signedIn, busy]);

  const pay = useCallback(async () => {
    const where = info ?? (await readPay());
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
  }, [info, paid]);

  return {
    /** The pay row that's live; earlier ones were answered or passed. */
    asking,
    phase,
    added,
    pay: () => void pay(),
  };
}

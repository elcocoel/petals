// Paying for Petals' agent (B): the visitor's credit and NEAR's price, read when someone is signed in and
// again when a turn ends, with no timer; and the one payment, which the wallet sends and the server checks
// on chain. lib/pay.ts holds the arithmetic and the words.
import { useCallback, useEffect, useState } from 'react';
import { confirmPay, readCredit, readPay } from '../lib/agent-client.ts';
import {
  type Credit,
  nearLeft,
  PAY_NEAR,
  type PayInfo,
  type PayPhase,
  payAction,
  sentBy,
  yoctoOf,
} from '../lib/pay.ts';
import { sendAction } from '../lib/wallet.ts';

/** `asking` is the newest pay row's key: a new one starts a new payment. */
export function usePay(signedIn: boolean, busy: boolean, asking: string | null) {
  const [credit, setCredit] = useState<Credit | null>(null);
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
    void Promise.all([readCredit(), readPay()]).then(
      ([c, p]) => {
        if (gone) return;
        // with the contract, what it holds now, read from the chain, is the truer balance
        setCredit(p?.credit ?? c);
        setInfo(p);
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
      setCredit(done.credit);
      setAdded(String(done.added_near));
      setPhase('added');
    } catch {
      setPhase('failed');
    }
  }, [info]);

  return {
    balance: nearLeft(credit, info?.near_usd ?? null),
    /** The pay row that's live; earlier ones were answered or passed. */
    asking,
    phase,
    added,
    pay: () => void pay(),
  };
}

// The lobby's profile part, its money (Elco, 9 Nov): what the person holds in the credit contract, read
// when the lobby opens, and Withdraw, which takes all of it out. The person's own wallet calls the
// contract, and the server reads that transaction back and says what's left (POST /api/v1/pay). There is
// no timer. lib/lobby-view.ts holds the arithmetic and the words.
import { useCallback, useEffect, useState } from 'react';
import { confirmPay, readPay } from '../lib/agent-client.ts';
import { type HeldCredit, WITHDRAW_ALL, type WithdrawPhase, withdrawn } from '../lib/lobby-view.ts';
import { type PayInfo, sentBy } from '../lib/pay.ts';
import { sendAction } from '../lib/wallet.ts';

export function useFunds() {
  const [info, setInfo] = useState<PayInfo | null>(null);
  /** What the contract holds for the person, in yoctoNEAR; null when there's no contract to hold it. */
  const [held, setHeld] = useState<string | null>(null);
  const [phase, setPhase] = useState<WithdrawPhase>('ready');
  const [withdrew, setWithdrew] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    void readPay().then(
      (next) => {
        if (gone) return;
        setInfo(next);
        setHeld((next?.credit as HeldCredit | null | undefined)?.balance_yocto ?? null);
      },
      // no answer shows no balance
      () => {},
    );
    return () => {
      gone = true;
    };
  }, []);

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
        setHeld(left);
        setPhase('withdrew');
      } catch {
        setPhase('failed');
      }
    })();
  }, [info, held]);

  return { held, phase, withdrew, withdraw };
}

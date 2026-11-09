// The way to add credit for Petals' agent, where the person meets it in the chat (B): one line and one
// button, which opens the wallet. Props only: viewmodels/usePay.ts holds the payment. Words from
// lib/pay.ts, drafts.
import { PAY_NEAR, type PayPhase, payWords } from '../../lib/pay.ts';
import { Button } from '../ui/Button.tsx';

export function PayRow({
  phase,
  added,
  onPay,
}: {
  phase: PayPhase;
  /** What the last payment added, in NEAR, once it has. */
  added: string | null;
  onPay: () => void;
}) {
  if (phase === 'added' && added) {
    return <p className="my-0 type-body">{payWords.added(added)}</p>;
  }
  return (
    <div className="flex flex-col items-start gap-text-gap border border-hairline p-text-gap">
      <p className="my-0 type-body">{payWords.out}</p>
      <Button disabled={phase === 'paying'} onClick={onPay}>
        {phase === 'paying' ? payWords.paying : payWords.button(PAY_NEAR)}
      </Button>
      {phase === 'failed' && <p className="my-0 type-caption text-muted">{payWords.failed}</p>}
    </div>
  );
}

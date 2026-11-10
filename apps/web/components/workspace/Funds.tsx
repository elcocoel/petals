// The Balance card (Elco, 9 and 10 Nov; the redo's frame, "Build it"): the credit the person holds, in NEAR
// at today's price, in the pixel numerals amounts take; and Withdraw, the card's one action, which takes
// everything out of the credit contract through their own wallet while it holds something. Withdraw is
// quiet, as Disconnect is. Props only: viewmodels/useFunds.ts reads the credit and holds the withdrawal.
// Words from lib/lobby-view.ts, drafts.
import { canWithdraw, fundsWords, type WithdrawPhase } from '../../lib/lobby-view.ts';
import { Button } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';

export function Funds({
  balance,
  held,
  phase,
  withdrew,
  onWithdraw,
}: {
  /** The person's credit in NEAR, as /make shows it; null until it can be read. */
  balance: string | null;
  /** What the contract holds for the person, in yoctoNEAR; null when there's no contract to hold it. */
  held: string | null;
  phase: WithdrawPhase;
  /** What the last withdrawal took out, in NEAR, once it has. */
  withdrew: string | null;
  onWithdraw: () => void;
}) {
  const offer = held !== null && canWithdraw(held) && phase !== 'withdrew';
  return (
    <Card
      title={fundsWords.title}
      labelledBy="lobby-balance"
      action={
        offer ? (
          <Button variant="quiet" disabled={phase === 'withdrawing'} onClick={onWithdraw}>
            {phase === 'withdrawing' ? fundsWords.waiting : fundsWords.withdraw}
          </Button>
        ) : undefined
      }
    >
      {balance !== null ? (
        <p className="my-0 flex items-baseline gap-space-8">
          <span className="type-pixel-numeral">{balance}</span>
          <span className="type-label text-muted">{fundsWords.unit}</span>
        </p>
      ) : (
        <p className="my-0 type-caption text-muted">{fundsWords.unread}</p>
      )}
      <p className="my-0 type-caption text-muted">{fundsWords.note}</p>
      {phase === 'withdrew' && withdrew !== null && (
        <p className="my-0 type-caption text-muted">{fundsWords.withdrew(withdrew)}</p>
      )}
      {phase === 'failed' && <p className="my-0 type-caption text-muted">{fundsWords.failed}</p>}
    </Card>
  );
}

// The profile part's money (Elco, 9 and 10 Nov): the credit the person holds, in NEAR, in /make's own words,
// and Withdraw, which takes everything out of the credit contract through their own wallet while it holds
// something. Withdraw is quiet, as Disconnect is, so the part keeps its height whatever it says.
// Props only: viewmodels/useFunds.ts reads the credit and holds the withdrawal.
// Words from lib/lobby-view.ts and lib/pay.ts, drafts.
import { canWithdraw, fundsWords, type WithdrawPhase } from '../../lib/lobby-view.ts';
import { payWords } from '../../lib/pay.ts';
import { Button } from '../ui/Button.tsx';
import { Mono } from '../ui/Mono.tsx';

export function Funds({
  balance,
  held,
  phase,
  withdrew,
  onWithdraw,
}: {
  /** The person's credit in NEAR, as /make shows it; null until it's known. */
  balance: string | null;
  /** What the contract holds for the person, in yoctoNEAR; null when there's no contract to hold it. */
  held: string | null;
  phase: WithdrawPhase;
  /** What the last withdrawal took out, in NEAR, once it has. */
  withdrew: string | null;
  onWithdraw: () => void;
}) {
  if (balance === null && held === null) return null;
  return (
    <div className="flex flex-wrap items-center gap-text-gap">
      {balance !== null && <Mono as="span">{payWords.balance(balance)}</Mono>}
      {phase === 'withdrew' && withdrew !== null ? (
        <span className="type-caption text-muted">{fundsWords.withdrew(withdrew)}</span>
      ) : (
        held !== null &&
        canWithdraw(held) && (
          <Button variant="quiet" disabled={phase === 'withdrawing'} onClick={onWithdraw}>
            {phase === 'withdrawing' ? fundsWords.waiting : fundsWords.withdraw}
          </Button>
        )
      )}
      {phase === 'failed' && <span className="type-caption text-muted">{fundsWords.failed}</span>}
    </div>
  );
}

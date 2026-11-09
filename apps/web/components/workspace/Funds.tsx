// The profile part's money (Elco, 9 Nov): what the person holds in the credit contract, and Withdraw, which
// takes all of it out through their own wallet. Withdraw is quiet, as Disconnect beside it is, so the part
// keeps its height whatever it says. Props only: viewmodels/useFunds.ts holds the withdrawal.
// Words from lib/lobby-view.ts, drafts.
import { canWithdraw, fundsWords, nearOf, type WithdrawPhase } from '../../lib/lobby-view.ts';
import { Button } from '../ui/Button.tsx';
import { Mono } from '../ui/Mono.tsx';

export function Funds({
  held,
  phase,
  withdrew,
  onWithdraw,
}: {
  /** What the contract holds for the person, in yoctoNEAR; null when there's no contract to hold it. */
  held: string | null;
  phase: WithdrawPhase;
  /** What the last withdrawal took out, in NEAR, once it has. */
  withdrew: string | null;
  onWithdraw: () => void;
}) {
  if (held === null) return null;
  return (
    <div className="flex flex-wrap items-center gap-text-gap px-block-gap pt-text-gap">
      <Mono as="span">{fundsWords.held(nearOf(held))}</Mono>
      {phase === 'withdrew' && withdrew !== null ? (
        <span className="type-caption text-muted">{fundsWords.withdrew(withdrew)}</span>
      ) : (
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

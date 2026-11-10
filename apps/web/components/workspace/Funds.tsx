// The Balance card (Elco, 9 and 10 Nov; the redo's frame, "Build it"): the credit the person holds, dollars
// first in the pixel numerals amounts take, NEAR beside at today's price (wrapping under it when narrow); and Withdraw, the card's one action, which takes
// everything out of the credit contract through their own wallet while it holds something. Withdraw is
// quiet, as Disconnect is. Props only: viewmodels/useFunds.ts reads the credit and holds the withdrawal.
// Words from lib/lobby-view.ts, drafts.
import { canWithdraw, fundsWords, type WithdrawPhase } from '../../lib/lobby-view.ts';
import type { Money } from '../../lib/pay.ts';
import { Button } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';

export function Funds({
  balance,
  held,
  phase,
  withdrew,
  onWithdraw,
}: {
  /** What's left, dollars first and NEAR beside, as /make shows it; null until it can be read. */
  balance: Money | null;
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
        <p className="my-0 flex flex-wrap items-baseline gap-x-space-8">
          <span className="type-pixel-numeral whitespace-nowrap">${balance.usd}</span>
          {balance.near !== null && (
            <span className="type-label whitespace-nowrap text-muted">
              {fundsWords.near(balance.near)}
            </span>
          )}
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

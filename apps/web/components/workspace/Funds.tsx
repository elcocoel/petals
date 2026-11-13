// The Balance band's own side: the credit the person holds, dollars first in the display's size, as the landing
// sets its headline, NEAR beside at today's price, and what it is; then the band's two actions, as the
// landing's: Add funds, the black button, which unfolds the pay row's own flow under it (NEAR from a wallet, or
// any token through NEAR Intents); and Withdraw beside it while the credit contract holds something, which takes
// everything out through their own wallet. Under them, the tip, an optional donation to Petals on the price's
// scale (TipControl), once Petals has said what it is. Props only: viewmodels/useFunds.ts reads the credit and
// holds the withdrawal, viewmodels/usePay.ts and useTopUp.ts the payment (in `add`), viewmodels/useTip.ts the
// tip. Words from lib/lobby-view.ts and lib/tip.ts.
import type { ReactNode } from 'react';
import { canWithdraw, fundsWords, type WithdrawPhase } from '../../lib/lobby-view.ts';
import type { Money } from '../../lib/pay.ts';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Button } from '../ui/Button.tsx';
import { TipControl, type TipView } from './TipControl.tsx';

export function Funds({
  balance,
  held,
  phase,
  withdrew,
  onWithdraw,
  adding,
  onAdd,
  add,
  tip,
}: {
  /** What's left, dollars first and NEAR beside, as /make shows it; null until it can be read. */
  balance: Money | null;
  /** What the contract holds for the person, in yoctoNEAR; null when there's no contract to hold it. */
  held: string | null;
  phase: WithdrawPhase;
  /** What the last withdrawal took out, in NEAR, once it has. */
  withdrew: string | null;
  onWithdraw: () => void;
  /** The pay row is open under the balance. */
  adding?: boolean;
  /** Opens it, or folds it away. */
  onAdd?: () => void;
  /** The pay row itself, while it's open. */
  add?: ReactNode;
  /** The person's tip; absent where only the balance shows. */
  tip?: TipView;
}) {
  const offer = held !== null && canWithdraw(held) && phase !== 'withdrew';
  return (
    <div className="flex flex-col gap-block-gap">
      {balance !== null ? (
        <p className="my-0 flex flex-wrap items-baseline gap-x-block-gap">
          <span className="type-title whitespace-nowrap md:type-display-compact">
            ${balance.usd}
          </span>
          {balance.near !== null && (
            <span className="type-lead whitespace-nowrap text-muted">
              {fundsWords.near(balance.near)}
            </span>
          )}
        </p>
      ) : (
        <p className="my-0 type-lead text-muted">{fundsWords.unread}</p>
      )}
      <p className="my-0 type-body text-muted">{fundsWords.note}</p>
      {(onAdd || offer) && (
        <ActionRow>
          {onAdd && (
            <Button variant={adding ? 'secondary' : 'primary'} arrow={!adding} onClick={onAdd}>
              {adding ? fundsWords.closeAdd : fundsWords.add}
            </Button>
          )}
          {offer && (
            <Button variant="secondary" disabled={phase === 'withdrawing'} onClick={onWithdraw}>
              {phase === 'withdrawing' ? fundsWords.waiting : fundsWords.withdraw}
            </Button>
          )}
        </ActionRow>
      )}
      {adding && add}
      {phase === 'withdrew' && withdrew !== null && (
        <p className="my-0 type-caption text-muted">{fundsWords.withdrew(withdrew)}</p>
      )}
      {phase === 'failed' && <p className="my-0 type-caption text-muted">{fundsWords.failed}</p>}
      {tip && tip.percent !== null && tip.scale && (
        <div className="max-w-content-width border-t border-hairline pt-text-gap">
          <TipControl {...tip} />
        </div>
      )}
    </div>
  );
}

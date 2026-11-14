// The Balance band's own side: the credit the person holds, dollars first in the display's size, as the landing
// sets its headline, NEAR beside at today's price, and what it is; then the band's two actions, as the
// landing's: Add funds, the black button, which unfolds the pay row's own flow under it (NEAR from a wallet, or
// any token through NEAR Intents); and Withdraw beside it, always there with the credit contract, which takes
// everything the contract holds out through their own wallet, and says under it what it can take out and what it
// can't, and why (pressable only while the contract holds something). Under them, the tip, an optional donation to Petals on the price's
// scale (TipControl), once Petals has said what it is. Props only: viewmodels/useFunds.ts reads the credit and
// holds the withdrawal, viewmodels/usePay.ts and useTopUp.ts the payment (in `add`), viewmodels/useTip.ts the
// tip. Words from lib/lobby-view.ts and lib/tip.ts.
import type { ReactNode } from 'react';
import { fundsWords, type WithdrawPhase, type WithdrawView } from '../../lib/lobby-view.ts';
import { type Money, payWords } from '../../lib/pay.ts';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Button } from '../ui/Button.tsx';
import { TipControl, type TipView } from './TipControl.tsx';

export function Funds({
  balance,
  withdrawal,
  phase,
  withdrew,
  failedWhy = null,
  signer = null,
  onWithdraw,
  adding,
  onAdd,
  add,
  tip,
}: {
  /** What's left, dollars first and NEAR beside, as /make shows it; null until it can be read. */
  balance: Money | null;
  /** Withdraw: what it can and can't take out; null when there's no contract to hold anything. */
  withdrawal: WithdrawView | null;
  phase: WithdrawPhase;
  /** What the last withdrawal took out, in NEAR, once it has. */
  withdrew: string | null;
  /** Why the last withdrawal didn't go through, as the wallet or Petals said it. */
  failedWhy?: string | null;
  /** The NEAR account a deposit or a withdrawal is signed as, named before any press. */
  signer?: string | null;
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
      {(onAdd || withdrawal) && (
        <ActionRow>
          {onAdd && (
            <Button variant={adding ? 'secondary' : 'primary'} arrow={!adding} onClick={onAdd}>
              {adding ? fundsWords.closeAdd : fundsWords.add}
            </Button>
          )}
          {withdrawal && (
            <Button
              variant="secondary"
              disabled={!withdrawal.enabled || phase === 'withdrawing'}
              onClick={onWithdraw}
            >
              {phase === 'withdrawing' ? fundsWords.waiting : fundsWords.withdraw}
            </Button>
          )}
        </ActionRow>
      )}
      {signer && (onAdd || withdrawal) && (
        <p className="my-0 type-caption text-muted">{payWords.signsAs(signer)}</p>
      )}
      {withdrawal && (
        <div className="flex max-w-content-width flex-col gap-text-gap">
          <p className="my-0 type-caption text-muted">{withdrawal.can}</p>
          {withdrawal.cannot && <p className="my-0 type-caption text-muted">{withdrawal.cannot}</p>}
        </div>
      )}
      {adding && add}
      {phase === 'withdrew' && withdrew !== null && (
        <p className="my-0 type-caption text-muted">{fundsWords.withdrew(withdrew)}</p>
      )}
      {phase === 'failed' && <p className="my-0 type-body">{failedWhy ?? fundsWords.failed}</p>}
      {tip && tip.percent !== null && tip.scale && (
        <div className="max-w-content-width border-t border-hairline pt-text-gap">
          <TipControl {...tip} />
        </div>
      )}
    </div>
  );
}

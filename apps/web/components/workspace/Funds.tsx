// The Balance band's own side, every command under what it changes: the credit the person holds, dollars first
// in the display's size, NEAR beside at today's price; right under it the dollars to add, dragged on a slider,
// with the press that adds them (the pay row's own flow, laid out from the start: NEAR from a wallet, or any
// token through NEAR Intents) and the account the wallet signs as; then Withdraw, always there with the credit
// contract (pressable only while it holds something), with one short line each on what it takes out and what
// it can't; then the tip, in plain sight and set right there. Props only: viewmodels/useFunds.ts reads the
// credit and holds the withdrawal, viewmodels/usePay.ts and useTopUp.ts the payment (in `add`),
// viewmodels/useTip.ts the tip. Words from lib/lobby-view.ts, lib/pay.ts and lib/tip.ts.
import type { ReactNode } from 'react';
import { shortId } from '../../lib/flower-view.ts';
import { fundsWords, type WithdrawPhase, type WithdrawView } from '../../lib/lobby-view.ts';
import { type Money, payWords } from '../../lib/pay.ts';
import { Button } from '../ui/Button.tsx';
import { Mono } from '../ui/Mono.tsx';
import { TipControl, type TipView } from './TipControl.tsx';

export function Funds({
  balance,
  withdrawal,
  phase,
  withdrew,
  failedWhy = null,
  signer = null,
  onWithdraw,
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
  /** The pay row, laid out under the balance from the start. */
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
      {/* right under the balance: the dollars to add, dragged, with the press that adds them */}
      {add}
      {signer && (
        // as every address is shortened, whole on hover
        <p className="my-0" title={signer}>
          <Mono as="span" tone="muted">
            {payWords.fundsFor(shortId(signer))}
          </Mono>
        </p>
      )}
      {withdrawal && (
        <div className="flex flex-col items-start gap-space-4">
          <Button
            variant="secondary"
            disabled={!withdrawal.enabled || phase === 'withdrawing'}
            onClick={onWithdraw}
          >
            {phase === 'withdrawing' ? fundsWords.waiting : withdrawal.label}
          </Button>
          {withdrawal.cannot && (
            <Mono as="p" tone="muted">
              {withdrawal.cannot}
            </Mono>
          )}
        </div>
      )}
      {phase === 'withdrew' && withdrew !== null && (
        <p className="my-0 type-ui">{fundsWords.withdrew(withdrew)}</p>
      )}
      {phase === 'failed' && <p className="my-0 type-body">{failedWhy ?? fundsWords.failed}</p>}
      {/* the tip, in plain sight and set right here */}
      {tip && tip.percent !== null && tip.scale && <TipControl {...tip} inline />}
    </div>
  );
}

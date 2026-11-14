// The lobby's one money panel, the same controls in every state: the balance, dollars first in the display's
// size and NEAR beside at today's price; one amount, on a slider and in its field; Add and Withdraw side by side,
// both acting on that amount (Add into the signed-in person's balance from any NEAR wallet, Withdraw that much of
// the wallet's own balance back to it, greyed only past what's held); paying with another token, laid out; the
// tip, in plain sight; and one short line saying what the last action did, which never hides a control and
// clears on the next. Props only: viewmodels/useLobby.ts holds it. Words from lib/lobby-view.ts and lib/pay.ts.

import type { TopUpView } from '../../lib/intents.ts';
import { fundsWords } from '../../lib/lobby-view.ts';
import { type Money, PAY_USD_MAX } from '../../lib/pay.ts';
import { TopUpFields } from '../chat/PayRow.tsx';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Button } from '../ui/Button.tsx';
import { Field } from '../ui/Field.tsx';
import { Mono } from '../ui/Mono.tsx';
import { Range } from '../ui/Range.tsx';
import { TipControl, type TipView } from './TipControl.tsx';

/** A press in the panel: its words, and whether it can be pressed now. */
export interface MoneyPress {
  label: string;
  /** greyed: Add with no amount, Withdraw past what's held, either while its wallet is asked */
  canPress: boolean;
  onPress: () => void;
}

export function Funds({
  balance,
  held = null,
  allowance = false,
  amount,
  add,
  withdraw,
  line,
  topUp,
  tip,
  status,
}: {
  /** What's left, dollars first and NEAR beside, as /make shows it; null until it can be read. */
  balance: Money | null;
  /** What the contract holds for the person, in NEAR as the chain says it; null with no contract. */
  held?: string | null;
  /** Part of the balance is Petals' allowance, off the contract: the one figure is then the dollars usable. */
  allowance?: boolean;
  /** The one amount both presses act on, in dollars; null until there's a price to set it against. */
  amount: { usd: string; label: string; onUsd: (usd: string) => void } | null;
  add: MoneyPress;
  /** Withdraw, with the credit contract; null without one. */
  withdraw: MoneyPress | null;
  /** Under the presses: whose balance Add funds, and who may pay. */
  line?: string | null;
  /** Paying with another token through NEAR Intents, laid out. */
  topUp?: TopUpView;
  /** The person's tip; absent where only the balance shows. */
  tip?: TipView;
  /** What the last action did, in one line; null before any. */
  status?: string | null;
}) {
  const usd = Number(amount?.usd.replace(/,/g, '')) || 0;
  return (
    <div className="flex flex-col gap-block-gap">
      {balance !== null && held !== null && allowance ? (
        // one figure: what the person can use, saying in a few words that Petals' allowance is in it
        <p className="my-0 flex flex-wrap items-baseline gap-x-block-gap">
          <span className="type-title whitespace-nowrap md:type-display-compact">
            ${balance.usd}
          </span>
          <span className="type-lead whitespace-nowrap text-muted">{fundsWords.withAllowance}</span>
        </p>
      ) : balance !== null && held !== null ? (
        // the contract's own NEAR, as the chain says it, and the balance in dollars beside
        <p className="my-0 flex flex-wrap items-baseline gap-x-block-gap">
          <span className="type-title whitespace-nowrap md:type-display-compact">
            {fundsWords.near(held)}
          </span>
          <span className="type-lead whitespace-nowrap text-muted">${balance.usd}</span>
        </p>
      ) : balance !== null ? (
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
      {amount && (
        <div className="flex w-full flex-wrap items-end gap-text-gap">
          <span className="min-w-0 basis-full sm:basis-2/5">
            <Range
              label={amount.label}
              min={0}
              max={Math.max(PAY_USD_MAX, Math.ceil(usd))}
              step={1}
              value={Math.min(usd, Math.max(PAY_USD_MAX, Math.ceil(usd)))}
              shown=""
              onChange={(v) => amount.onUsd(String(v))}
              onSet={() => {}}
            />
          </span>
          <Field
            id="money-usd"
            label={amount.label}
            value={amount.usd}
            onChange={amount.onUsd}
            scale="app"
          />
        </div>
      )}
      <ActionRow gap="tight">
        <Button variant="primary" disabled={!add.canPress} onClick={add.onPress}>
          {add.label}
        </Button>
        {withdraw && (
          <Button variant="secondary" disabled={!withdraw.canPress} onClick={withdraw.onPress}>
            {withdraw.label}
          </Button>
        )}
      </ActionRow>
      {line && (
        <Mono as="p" tone="muted">
          {line}
        </Mono>
      )}
      {status && <p className="my-0 type-body">{status}</p>}
      {topUp && (
        <div className="flex w-full flex-col gap-text-gap border-t border-hairline pt-text-gap">
          <span className="type-label">{fundsWords.otherToken}</span>
          <TopUpFields topUp={topUp} />
        </div>
      )}
      {tip && tip.percent !== null && tip.scale && <TipControl {...tip} inline />}
    </div>
  );
}

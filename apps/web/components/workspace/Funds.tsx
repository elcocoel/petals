// The Balance card (Elco, 9 and 10 Nov; the redo's frame, "Build it"): the credit the person holds, dollars
// first (in the heading's size since Elco, 11 Nov: "the balance card feels gross and huge and large"), NEAR beside at today's price (wrapping under it when narrow); and Withdraw, the card's one action, which takes
// everything out of the credit contract through their own wallet while it holds something. Withdraw is
// quiet, as Disconnect is. Props only: viewmodels/useFunds.ts reads the credit and holds the withdrawal.
// Words from lib/lobby-view.ts, drafts.
import { canWithdraw, fundsWords, type WithdrawPhase } from '../../lib/lobby-view.ts';
import type { Money } from '../../lib/pay.ts';
import type { PowerQuoteItem } from '../../lib/power-quotes.ts';
import { type UsageView, usageWords } from '../../lib/profile-view.ts';
import { PowerQuote } from '../PowerQuote.tsx';
import { Badge } from '../ui/Badge.tsx';
import { Button } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import { Mono } from '../ui/Mono.tsx';

export function Funds({
  balance,
  held,
  phase,
  withdrew,
  onWithdraw,
  usage,
  quote,
}: {
  /** What's left, dollars first and NEAR beside, as /make shows it; null until it can be read. */
  balance: Money | null;
  /** What the contract holds for the person, in yoctoNEAR; null when there's no contract to hold it. */
  held: string | null;
  phase: WithdrawPhase;
  /** What the last withdrawal took out, in NEAR, once it has. */
  withdrew: string | null;
  onWithdraw: () => void;
  /**
   * Every call charged to the person, newest first (usage/v1; Elco, 11 Nov: "turn the balance widget into
   * like a full-blown professional usages widget"); absent where only the balance shows.
   */
  usage?: UsageView | 'reading' | 'unread';
  /** An illustrated power quote for when there's no usage yet (#89, wave 7). */
  quote?: PowerQuoteItem | null;
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
          <span className="type-heading whitespace-nowrap">${balance.usd}</span>
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
      {usage !== undefined && (
        <div className="flex flex-col gap-space-8 border-t border-hairline pt-text-gap">
          <h3 className="m-0 type-label">{usageWords.title}</h3>
          {typeof usage === 'string' ? (
            <p className="my-0 type-caption text-muted">
              {usage === 'reading' ? usageWords.reading : usageWords.unread}
            </p>
          ) : usage.rows.length === 0 ? (
            <>
              <p className="my-0 type-caption text-muted">{usageWords.none}</p>
              {quote && (
                <div className="flex justify-center">
                  <PowerQuote quote={quote} />
                </div>
              )}
            </>
          ) : (
            <>
              <p className="my-0 type-caption text-muted">{usage.summary}</p>
              {/* a set height, scrolling inside, as the other widgets' lists */}
              <ul className="m-0 flex max-h-figure-height list-none flex-col overflow-y-auto overscroll-none p-0">
                {usage.rows.map((r) => (
                  <li
                    key={r.key}
                    className="flex flex-col gap-space-4 border-t border-hairline py-space-8"
                  >
                    <div className="flex items-baseline gap-text-gap">
                      <span className="min-w-0 flex-1 type-caption wrap-anywhere">{r.model}</span>
                      <span className="shrink-0 type-caption whitespace-nowrap">${r.cost.usd}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-text-gap">
                      <Mono as="span" tone="muted">
                        {`${r.when}  ·  ${r.tokens}`}
                      </Mono>
                      <Badge>{r.billed ? usageWords.billed : usageWords.counted}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

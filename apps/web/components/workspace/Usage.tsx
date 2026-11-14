// The Usage card, beside the balance in the lobby's Balance band: every call charged to the person (usage/v1),
// newest first, as a professional usage widget: a summary line, then each call with its model and cost, when
// it was and its tokens, and whether it was billed or only counted, in a set height that scrolls. With none
// yet, what goes there. Under its line, the tip: a share of each answer's AI cost, so it sits with the costs.
// Props only: viewmodels/useLobby.ts reads it. Words from lib/profile-view.ts.
import { type UsageView, usageWords } from '../../lib/profile-view.ts';
import { Badge } from '../ui/Badge.tsx';
import { Card } from '../ui/Card.tsx';
import { Mono } from '../ui/Mono.tsx';
import { TipControl, type TipView } from './TipControl.tsx';

export function Usage({
  usage,
  tip,
}: {
  usage: UsageView | 'reading' | 'unread';
  /** The person's tip on each answer's cost; absent where only the usage shows. */
  tip?: TipView;
}) {
  const tipped = tip && tip.percent !== null && tip.scale ? <TipControl {...tip} inline /> : null;
  return (
    <Card title={usageWords.title} labelledBy="lobby-usage">
      {typeof usage === 'string' ? (
        <>
          <p className="my-0 type-caption text-muted">
            {usage === 'reading' ? usageWords.reading : usageWords.unread}
          </p>
          {tipped}
        </>
      ) : usage.rows.length === 0 ? (
        <>
          <p className="my-0 type-body text-muted">{usageWords.none}</p>
          {tipped}
        </>
      ) : (
        <>
          <p className="my-0 type-caption text-muted">{usage.summary}</p>
          {tipped}
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
    </Card>
  );
}

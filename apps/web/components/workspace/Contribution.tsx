// The Contribution widget, how much a person helps the map: three plain counts, readable at a glance, each a
// number in the heading's size with what it counts under it: facts added to the map first, facts confirmed,
// accounts that built on the person's work; then the layers they published, what each is about and when, in a set
// height that scrolls. With nothing yet, what goes there and a quote. Props only: viewmodels/useLobby.ts reads the
// record (credit/v1). Words from lib/contribution-view.ts.
import { type ContributionView, contributionWords } from '../../lib/contribution-view.ts';
import type { PowerQuoteItem } from '../../lib/power-quotes.ts';
import { PowerQuote } from '../PowerQuote.tsx';
import { Badge } from '../ui/Badge.tsx';
import { Card } from '../ui/Card.tsx';
import { Mono } from '../ui/Mono.tsx';

export function Contribution({
  contribution,
  quote,
}: {
  contribution: ContributionView | 'reading' | 'unread';
  /** An illustrated power quote for when there's nothing yet. */
  quote?: PowerQuoteItem | null;
}) {
  const view = typeof contribution === 'string' ? null : contribution;
  return (
    <Card title={contributionWords.title} labelledBy="profile-contribution">
      {contribution === 'reading' && (
        <p className="my-0 type-caption text-muted">{contributionWords.reading}</p>
      )}
      {contribution === 'unread' && (
        <p className="my-0 type-caption text-muted">{contributionWords.unread}</p>
      )}
      {view && (
        <dl className="m-0 grid grid-cols-1 gap-block-gap sm:grid-cols-3">
          {view.counts.map((c) => (
            <div key={c.key} className="flex flex-col gap-space-4">
              <dt className="order-2 type-caption text-muted">{c.label}</dt>
              <dd className="order-1 m-0 type-heading">{c.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {view && view.layers.length > 0 && (
        <div className="flex flex-col gap-space-8">
          <h3 className="m-0 type-label">{contributionWords.layers}</h3>
          <ul className="m-0 flex max-h-figure-height list-none flex-col overflow-y-auto overscroll-none p-0">
            {view.layers.map((l) => (
              <li
                key={l.key}
                className="flex flex-wrap items-center gap-text-gap border-t border-hairline py-text-gap"
              >
                <span className="min-w-0 flex-1 type-body wrap-anywhere">{l.title}</span>
                <span title={l.about.full}>
                  <Mono as="span" tone="muted">
                    {l.about.shown}
                  </Mono>
                </span>
                {l.about.chain && <Badge>{l.about.chain}</Badge>}
                {l.when && (
                  <Mono as="span" tone="muted">
                    {l.when}
                  </Mono>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {view?.empty && (
        <>
          <p className="my-0 type-body">{contributionWords.none}</p>
          {quote && (
            <div className="flex justify-center">
              <PowerQuote quote={quote} />
            </div>
          )}
        </>
      )}
    </Card>
  );
}

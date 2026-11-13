// How much a person helps the map, at the head of the lobby's Your work band: three plain counts, each a number
// in the title's size with what it counts under it, readable at a glance as the landing's figures are: facts added
// to the map first, facts confirmed, accounts that built on the person's work. What they published, and what
// goes there while there's nothing yet, is its own card (Published). Props only: viewmodels/useLobby.ts reads
// the record (credit/v1). Words from lib/contribution-view.ts.
import { type ContributionView, contributionWords } from '../../lib/contribution-view.ts';

export function Contribution({
  contribution,
}: {
  contribution: ContributionView | 'reading' | 'unread';
}) {
  if (contribution === 'reading' || contribution === 'unread') {
    return (
      <p className="my-0 type-caption text-muted">
        {contribution === 'reading' ? contributionWords.reading : contributionWords.unread}
      </p>
    );
  }
  return (
    <dl
      aria-label={contributionWords.title}
      className="m-0 grid grid-cols-1 gap-block-gap sm:grid-cols-3"
    >
      {contribution.counts.map((c) => (
        <div key={c.key} className="flex flex-col gap-space-8 border-t border-primary pt-text-gap">
          <dt className="order-2 type-body text-muted">{c.label}</dt>
          <dd className="order-1 m-0 type-title md:type-display-compact">{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}

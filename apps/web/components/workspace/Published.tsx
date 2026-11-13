// The Published card, in the lobby's Your work band: the layers the person published to the map, newest first,
// what each is about and when, in a set height that scrolls. With none yet, what goes there. Props only:
// viewmodels/useLobby.ts reads the record (credit/v1). Words from lib/contribution-view.ts.
import { type ContributionView, contributionWords } from '../../lib/contribution-view.ts';
import { Badge } from '../ui/Badge.tsx';
import { Card } from '../ui/Card.tsx';
import { Mono } from '../ui/Mono.tsx';

export function Published({
  contribution,
}: {
  contribution: ContributionView | 'reading' | 'unread';
}) {
  const layers = typeof contribution === 'string' ? [] : contribution.layers;
  return (
    <Card
      title={contributionWords.layers}
      labelledBy="lobby-published"
      badge={layers.length > 0 ? <Badge>{layers.length}</Badge> : undefined}
    >
      {typeof contribution === 'string' ? (
        <p className="my-0 type-caption text-muted">
          {contribution === 'reading' ? contributionWords.reading : contributionWords.unread}
        </p>
      ) : layers.length === 0 ? (
        <p className="my-0 type-body text-muted">{contributionWords.none}</p>
      ) : (
        <ul className="m-0 flex max-h-figure-height list-none flex-col overflow-y-auto overscroll-none p-0">
          {layers.map((l) => (
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
      )}
    </Card>
  );
}

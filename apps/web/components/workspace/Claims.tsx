// The Claims card (#79, the profile page as the investigator's card; the annotations layer,
// coordinator/annotation-layer.md): everything the person and their agents have kept about accounts, from
// all their projects, by the account it's about, newest first. Over them, how many of each kind (observed,
// sourced, stated, inferred: how each is known, never "verified"). Each claim as a petal's details say it:
// what it says, how it's known, where it rests and who said it, with its source. Props only:
// viewmodels/useLobby.ts reads it. Words from lib/profile-view.ts and lib/claim-lines.ts, drafts.
import { claimWords } from '../../lib/claim-lines.ts';
import type { PowerQuoteItem } from '../../lib/power-quotes.ts';
import { type ClaimsView, profilePageWords } from '../../lib/profile-view.ts';
import { PowerQuote } from '../PowerQuote.tsx';
import { Badge } from '../ui/Badge.tsx';
import { Card } from '../ui/Card.tsx';
import { Mono } from '../ui/Mono.tsx';
import { TextLink } from '../ui/TextLink.tsx';

export function Claims({
  claims,
  quote,
}: {
  claims: ClaimsView | 'reading' | 'unread';
  /** An illustrated power quote for when there's nothing yet (#89, wave 7). */
  quote?: PowerQuoteItem | null;
}) {
  const view = typeof claims === 'string' ? null : claims;
  return (
    <Card
      title={profilePageWords.claims}
      labelledBy="profile-claims"
      badge={view && view.total > 0 ? <Badge>{view.total}</Badge> : undefined}
    >
      {claims === 'reading' && (
        <p className="my-0 type-caption text-muted">{profilePageWords.reading}</p>
      )}
      {claims === 'unread' && (
        <p className="my-0 type-caption text-muted">{profilePageWords.unread}</p>
      )}
      {view && view.total === 0 && (
        <>
          <p className="my-0 type-body">{profilePageWords.claimsNone}</p>
          {quote && (
            <div className="flex justify-center">
              <PowerQuote quote={quote} />
            </div>
          )}
        </>
      )}
      {view && view.total > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-text-gap">
            <span className="type-caption text-muted">
              {profilePageWords.about(view.groups.length)}
            </span>
            {view.kinds.map((k) => (
              <Badge key={k.kind}>{`${k.count} ${k.kind}`}</Badge>
            ))}
          </div>
          {/* a set height, scrolling inside, as the map's claims box does (Elco, 11 Nov: "I don't like the
              idea that the claims widget is infinite") */}
          <ul className="m-0 flex max-h-figure-height list-none flex-col overflow-y-auto overscroll-none p-0">
            {view.groups.map((g) => (
              <li
                key={g.key}
                className="flex flex-col gap-text-gap border-t border-hairline py-text-gap"
              >
                <div className="flex flex-wrap items-center gap-text-gap">
                  <span title={g.subject.full} className="min-w-0 wrap-anywhere">
                    <Mono as="span">{g.subject.shown}</Mono>
                  </span>
                  {g.subject.chain && <Badge>{g.subject.chain}</Badge>}
                </div>
                <ul className="m-0 flex list-none flex-col gap-text-gap p-0">
                  {g.lines.map((l) => (
                    <li key={l.key} className="flex flex-col gap-space-4">
                      <p className="my-0 type-body wrap-anywhere">
                        {l.link ? (
                          <TextLink href={l.link} rel="noreferrer" target="_blank">
                            {l.link}
                          </TextLink>
                        ) : (
                          l.says
                        )}
                      </p>
                      <Mono as="span" tone="muted">
                        {[l.kind, l.rests, claimWords.by(l.who)].filter(Boolean).join('  ·  ')}
                        {l.source && (
                          <>
                            {'  ·  '}
                            <TextLink
                              variant="mono"
                              href={l.source}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {claimWords.source}
                            </TextLink>
                          </>
                        )}
                      </Mono>
                      {l.quote && (
                        <p className="my-0 type-caption text-muted wrap-anywhere">“{l.quote}”</p>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

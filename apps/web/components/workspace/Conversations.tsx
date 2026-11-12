// The Conversations card (#79, the profile page as the investigator's card): the person's conversations,
// newest first, the networks they've mapped, each opening where it's held, with when it last moved, in a set
// height that scrolls inside, as the Claims widget's does. The
// same list the side panel reads (viewmodels/useWorkPanel.ts), so both say the same. Props only. Words from
// lib/profile-view.ts, drafts.
import type { ConversationRow } from '../../lib/conversation-list.ts';
import type { PowerQuoteItem } from '../../lib/power-quotes.ts';
import { profilePageWords } from '../../lib/profile-view.ts';
import { PowerQuote } from '../PowerQuote.tsx';
import { Badge } from '../ui/Badge.tsx';
import { Card } from '../ui/Card.tsx';
import { TextLink } from '../ui/TextLink.tsx';

export function Conversations({
  rows,
  quote,
}: {
  rows: ConversationRow[];
  /** An illustrated power quote for when there's nothing yet (#89, wave 7). */
  quote?: PowerQuoteItem | null;
}) {
  return (
    <Card
      title={profilePageWords.conversations}
      labelledBy="profile-conversations"
      badge={rows.length > 0 ? <Badge>{rows.length}</Badge> : undefined}
    >
      {rows.length === 0 ? (
        <>
          <p className="my-0 type-body">{profilePageWords.conversationsNone}</p>
          {quote && (
            <div className="flex justify-center">
              <PowerQuote quote={quote} />
            </div>
          )}
        </>
      ) : (
        <ul className="m-0 flex max-h-figure-height list-none flex-col overflow-y-auto overscroll-none p-0">
          {rows.map((r) => (
            <li
              key={r.key}
              className="flex items-center gap-text-gap border-t border-hairline py-text-gap"
            >
              <span className="min-w-0 flex-1 type-body wrap-anywhere">
                <TextLink href={r.href} inPlace>
                  {r.title}
                </TextLink>
              </span>
              <span className="shrink-0 type-caption text-muted">{r.when}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

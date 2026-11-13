// The Conversations card (the profile page as the investigator's card): the person's conversations,
// newest first, the networks they've mapped, each opening where it's held, with when it last moved, in a set
// height that scrolls inside, as the Claims widget's does. The
// same list the side panel reads (viewmodels/useWorkPanel.ts), so both say the same. Props only. Words from
// lib/profile-view.ts.
import type { ConversationRow } from '../../lib/conversation-list.ts';
import { profilePageWords } from '../../lib/profile-view.ts';
import { Badge } from '../ui/Badge.tsx';
import { Card } from '../ui/Card.tsx';
import { TextLink } from '../ui/TextLink.tsx';

export function Conversations({ rows }: { rows: ConversationRow[] }) {
  return (
    <Card
      title={profilePageWords.conversations}
      labelledBy="profile-conversations"
      badge={rows.length > 0 ? <Badge>{rows.length}</Badge> : undefined}
    >
      {rows.length === 0 ? (
        <p className="my-0 type-body text-muted">{profilePageWords.conversationsNone}</p>
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

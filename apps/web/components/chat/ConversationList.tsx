// A person's conversations, one row each. A row is a link: opening one is opening its address. The words
// and the addresses come from conversationRows in lib/conversation-list.ts.
import type { ConversationRow } from '../../lib/conversation-list.ts';
import { Button } from '../ui/Button.tsx';
import { Mono } from '../ui/Mono.tsx';

export function ConversationList({ rows }: { rows: ConversationRow[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-space-8 p-block-gap">
      {rows.map((row) => (
        <li key={row.key}>
          <Button variant="row" href={row.href} current={row.current}>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate type-label">{row.title}</span>
              <Mono as="span" tone="muted">
                {row.sub}
              </Mono>
            </span>
          </Button>
        </li>
      ))}
    </ul>
  );
}

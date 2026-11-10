// A person's conversations in the side panel, one row each. A row is a link: opening one is opening its
// address. Who it's with is its icon, and said in full on hover. The words and the addresses come from
// conversationRows in lib/conversation-list.ts; the panel's own words from lib/panel-words.ts.
import type { ConversationRow } from '../../lib/conversation-list.ts';
import { panelWords } from '../../lib/panel-words.ts';
import { NavItem } from '../ui/NavItem.tsx';

export function ConversationList({
  rows,
  depth = 0,
}: {
  rows: ConversationRow[];
  /** 1 when the rows sit in a project. */
  depth?: 0 | 1;
}) {
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {rows.map((row) => {
        const who = row.by === 'petals' ? panelWords.withPetals : panelWords.withOwn;
        return (
          <li key={row.key}>
            <NavItem
              href={row.href}
              current={row.current}
              icon={row.by === 'petals' ? 'petals' : 'agent'}
              label={row.title}
              title={`${row.title}\n${who}`}
              trail={row.when}
              {...(row.working ? { working: panelWords.working } : {})}
              depth={depth}
            />
          </li>
        );
      })}
    </ul>
  );
}

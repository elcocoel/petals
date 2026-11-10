// A person's conversations in the side panel, one row each. A row is a link: opening one is opening its
// address. Who it's with is its icon, and said in full on hover. With `move`, a row's end holds the way to
// put it in a project, shown where the pointer or the keyboard is, in the trail's place; it opens the
// projects under the row, as a project opens its conversations. The words and the addresses come from
// conversationRows in lib/conversation-list.ts; the panel's own words from lib/panel-words.ts.
import type { ConversationRow } from '../../lib/conversation-list.ts';
import { panelWords } from '../../lib/panel-words.ts';
import { IconButton } from '../ui/IconButton.tsx';
import { NavItem } from '../ui/NavItem.tsx';

/** Putting a conversation in a project: where it can go, which row is choosing, and the choice. */
export interface MoveRows {
  projects: { key: string; name: string }[];
  /** The row whose choices are open, by key. */
  open: string | null;
  toggle: (row: string) => void;
  to: (row: string, project: string | null) => void;
}

export function ConversationList({
  rows,
  depth = 0,
  move,
}: {
  rows: ConversationRow[];
  /** 1 when the rows sit in a project. */
  depth?: 0 | 1;
  move?: MoveRows;
}) {
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {rows.map((row) => {
        const who = row.by === 'petals' ? panelWords.withPetals : panelWords.withOwn;
        const elsewhere = move?.projects.filter((p) => p.key !== row.project) ?? [];
        const movable = move && (elsewhere.length > 0 || row.project !== null);
        const choosing = movable && move.open === row.key;
        return (
          <li key={row.key} className="group relative">
            <NavItem
              href={row.href}
              current={row.current}
              icon={row.by === 'petals' ? 'petals' : 'agent'}
              label={row.title}
              title={`${row.title}\n${who}`}
              trail={row.when}
              {...(row.working ? { working: panelWords.working } : {})}
              depth={depth}
              trailGivesWay={Boolean(movable)}
            />
            {movable && (
              <span
                className={`absolute top-0 right-0 flex ${choosing ? '' : 'invisible group-focus-within:visible group-hover:visible'}`}
              >
                <IconButton
                  icon="project"
                  label={panelWords.moveTo(row.title)}
                  onClick={() => move.toggle(row.key)}
                  expanded={Boolean(choosing)}
                />
              </span>
            )}
            {choosing && (
              <ul className="m-0 flex list-none flex-col p-0">
                {elsewhere.map((p) => (
                  <li key={p.key}>
                    <NavItem
                      onClick={() => move.to(row.key, p.key)}
                      icon="project"
                      label={p.name}
                      depth={depth === 0 ? 1 : 2}
                    />
                  </li>
                ))}
                {row.project !== null && (
                  <li>
                    <NavItem
                      onClick={() => move.to(row.key, null)}
                      icon="close"
                      label={panelWords.outOfProject}
                      muted
                      depth={depth === 0 ? 1 : 2}
                    />
                  </li>
                )}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

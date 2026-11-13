// A person's conversations in the side panel, one row each. A row is a link: opening one is opening its
// address. Who it's with is its icon, and said in full on hover. With `actions`, a row's end holds its ⋯
// menu, shown where the pointer or the keyboard is, in the trail's place, and the row can be dragged
// onto a project; the row just moved takes a soft fill. The words and the addresses come from
// conversationRows in lib/conversation-list.ts; the panel's own words from lib/panel-words.ts.
import type { DragEvent } from 'react';
import type { ConversationRow } from '../../lib/conversation-list.ts';
import { panelWords } from '../../lib/panel-words.ts';
import { IconButton } from '../ui/IconButton.tsx';
import { Menu, type MenuItem } from '../ui/Menu.tsx';
import { NavItem } from '../ui/NavItem.tsx';

/** What can be done with a row: its menu, dragging it, and which one was just moved. */
export interface RowActions {
  /** The row whose menu is open, by key. */
  menuFor: string | null;
  toggleMenu: (key: string) => void;
  closeMenu: () => void;
  /** The menu's items for a row. */
  itemsFor: (row: ConversationRow) => MenuItem[];
  /** Dragging a row onto a project; absent where rows can't be dragged. */
  drag?: { start: (key: string) => void; end: () => void };
  /** The row just moved into a project. */
  justMoved: string | null;
}

export function ConversationList({
  rows,
  depth = 0,
  actions,
}: {
  rows: ConversationRow[];
  /** 1 when the rows sit in a project. */
  depth?: 0 | 1;
  actions?: RowActions;
}) {
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {rows.map((row) => {
        const who = row.by === 'petals' ? panelWords.withPetals : panelWords.withOwn;
        const open = actions?.menuFor === row.key;
        const drag = actions?.drag;
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
              trailGivesWay={Boolean(actions)}
              moved={actions?.justMoved === row.key}
              {...(drag
                ? {
                    drag: {
                      onDragStart: (e: DragEvent<HTMLElement>) => {
                        e.dataTransfer.setData('text/plain', row.title);
                        e.dataTransfer.effectAllowed = 'move';
                        drag.start(row.key);
                      },
                      onDragEnd: drag.end,
                    },
                  }
                : {})}
            />
            {actions && (
              <span
                className={`absolute top-0 right-0 flex ${open ? '' : 'invisible group-focus-within:visible group-hover:visible'}`}
              >
                <IconButton
                  icon="more"
                  label={panelWords.more(row.title)}
                  onClick={() => actions.toggleMenu(row.key)}
                  expanded={open}
                />
                {open && (
                  <Menu
                    label={panelWords.more(row.title)}
                    items={actions.itemsFor(row)}
                    onClose={actions.closeMenu}
                  />
                )}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

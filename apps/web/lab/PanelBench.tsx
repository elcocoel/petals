'use client';
// The side panel at its real size, on a page of its own (/lab/panel), in each of its states. Its hands
// work here as on the pages: fold it, open a project, make one, copy the prompt. Nothing leaves the page.
import { useState } from 'react';
import { Mono } from '../components/ui/Mono.tsx';
import { NavItem } from '../components/ui/NavItem.tsx';
import { WorkMenu, type WorkMenuView } from '../components/workspace/WorkMenu.tsx';
import type { CopiedAt } from '../lib/agents.ts';
import type { ListedProject, RowRef } from '../lib/conversation-list.ts';
import { panelWords, type SectionKey } from '../lib/panel-words.ts';
import { usePanelWidth } from '../viewmodels/usePanelWidth.ts';
import { PANEL_STATES, type PanelState } from './panel-fixtures.ts';

export function PanelBench({ state }: { state: PanelState }) {
  const fixture = PANEL_STATES[state];
  const [open, setOpen] = useState(fixture.section !== null);
  const [jump, setJump] = useState<{ key: SectionKey; n: number } | null>(
    fixture.section ? { key: fixture.section, n: 1 } : null,
  );
  const width = usePanelWidth();
  const [projects, setProjects] = useState<ListedProject[]>(fixture.projects);
  const [opened, setOpened] = useState<string[]>(fixture.opened);
  const [copied, setCopied] = useState<CopiedAt | null>(null);
  const [naming, setNaming] = useState(false);
  const [placed, setPlaced] = useState<Record<string, string | null>>({});
  // the row's menu, its dialogs and dragging, saved nowhere: the bench only shows them
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [moving, setMoving] = useState<RowRef | null>(null);
  const [query, setQuery] = useState('');
  const [removing, setRemoving] = useState<RowRef | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [justMoved, setJustMoved] = useState<string | null>(null);
  const [said, setSaid] = useState('');
  const [folded, setFolded] = useState<SectionKey[]>([]);
  const menu: WorkMenuView = {
    open,
    toggleOpen: () => setOpen((now) => !now),
    jump,
    jumpTo: (key) => {
      setOpen(true);
      setFolded((now) => now.filter((k) => k !== key));
      setJump((now) => ({ key, n: (now?.n ?? 0) + 1 }));
    },
    folded,
    fold: (key) =>
      setFolded((now) => (now.includes(key) ? now.filter((k) => k !== key) : [...now, key])),
    projects,
    opened,
    toggle: (key) =>
      setOpened((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key])),
    naming,
    newProject: () => setNaming(true),
    nameProject: (name) => {
      setNaming(false);
      const id = `new${projects.length}`;
      setProjects((list) => [...list, { id, name, parent: null, position: list.length }]);
      setOpened((keys) => [...keys, id]);
    },
    stopNaming: () => setNaming(false),
    menuFor,
    toggleMenu: (key) => setMenuFor((now) => (now === key ? null : key)),
    closeMenu: () => setMenuFor(null),
    moving,
    startMove: (row) => {
      setQuery('');
      setMoving(row);
    },
    stopMove: () => setMoving(null),
    query,
    setQuery,
    moveTo: (row, project) => {
      setMoving(null);
      setPlaced((now) => ({ ...now, [row.key]: project?.key ?? null }));
      if (project)
        setOpened((keys) => (keys.includes(project.key) ? keys : [...keys, project.key]));
      setJustMoved(row.key);
      setSaid(panelWords.moved(row.title, project?.name ?? null));
    },
    archive: () => {},
    unarchive: () => {},
    archived: [],
    archivedOpen: false,
    toggleArchived: () => {},
    removing,
    startRemove: setRemoving,
    stopRemove: () => setRemoving(null),
    remove: () => setRemoving(null),
    removeFailed: null,
    dragging,
    dragStart: setDragging,
    dragEnd: () => {
      setDragging(null);
      setDropOn(null);
    },
    dropOn,
    dragOver: setDropOn,
    justMoved,
    said,
    placed,
    agents: fixture.agents,
    copied,
    copy: (at) => {
      setCopied(at);
      setTimeout(() => setCopied(null), 2400);
    },
    disconnect: () => {},
    disconnectAll: () => {},
  };
  return (
    <main data-workspace="" data-surface="ground" className="flex h-dvh bg-surface">
      <WorkMenu conversations={fixture.rows} menu={menu} width={width.hand} />
      <div className="flex min-w-0 flex-1 flex-col gap-text-gap p-column-gap">
        <Mono tone="muted">The side panel, in the lab</Mono>
        <ul className="m-0 flex w-sidebar-width list-none flex-col p-0">
          {(Object.keys(PANEL_STATES) as PanelState[]).map((key) => (
            <li key={key}>
              <NavItem
                href={`/lab/panel?state=${key}`}
                current={key === state}
                label={PANEL_STATES[key].name}
              />
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

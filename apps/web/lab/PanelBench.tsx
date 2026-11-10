'use client';
import type { View } from '@petal/core/types';
import { DEFAULT_VIEW, type Dimension, EVERY_FLOWER } from '@petal/core/view';
// The side panel at its real size, on a page of its own (/lab/panel), in each of its states. Its hands
// work here as on the pages: fold it, open a project, make one, copy the prompt. Nothing leaves the page.
import { useState } from 'react';
import { Mono } from '../components/ui/Mono.tsx';
import { NavItem } from '../components/ui/NavItem.tsx';
import { WorkMenu, type WorkMenuView } from '../components/workspace/WorkMenu.tsx';
import type { ListedProject } from '../lib/conversation-list.ts';
import type { SectionKey } from '../lib/panel-words.ts';
import { viewChoices } from '../lib/person-view.ts';
import { isDefault, withData, withScale } from '../lib/view-edit.ts';
import { PANEL_STATES, type PanelState } from './panel-fixtures.ts';

export function PanelBench({ state }: { state: PanelState }) {
  const fixture = PANEL_STATES[state];
  const [section, setSection] = useState<SectionKey | null>(fixture.section);
  const [projects, setProjects] = useState<ListedProject[]>(fixture.projects);
  const [opened, setOpened] = useState<string[]>(fixture.opened);
  const [copied, setCopied] = useState(false);
  const [naming, setNaming] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Record<string, string | null>>({});
  // Settings, saved nowhere: the bench keeps the view it's shown
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [openDimension, setOpenDimension] = useState<Dimension | null>('colour');
  const menu: WorkMenuView = {
    section,
    choose: (key) => setSection((now) => (now === key ? null : key)),
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
    moving,
    toggleMoving: (row) => setMoving((now) => (now === row ? null : row)),
    moveTo: (row, project) => {
      setMoving(null);
      setPlaced((now) => ({ ...now, [row]: project }));
      if (project) setOpened((keys) => (keys.includes(project) ? keys : [...keys, project]));
    },
    placed,
    agents: fixture.agents,
    copied,
    copy: () => setCopied(true),
    disconnect: () => {},
  };
  return (
    <main data-workspace="" data-surface="ground" className="flex h-dvh bg-surface">
      <WorkMenu
        conversations={fixture.rows}
        menu={menu}
        you={{ ...fixture.you, leave: () => {} }}
        settings={{
          view,
          defaults: DEFAULT_VIEW,
          choices: viewChoices(),
          pieces: EVERY_FLOWER,
          open: openDimension,
          onOpen: (d) => setOpenDimension((now) => (now === d ? null : d)),
          onPick: (d, data) => setView(withData(view, d, data, EVERY_FLOWER, DEFAULT_VIEW)),
          onScale: (d, scale) => setView(withScale(view, d, scale)),
          onReset: isDefault(view, DEFAULT_VIEW) ? undefined : () => setView(DEFAULT_VIEW),
          failed: null,
        }}
      />
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

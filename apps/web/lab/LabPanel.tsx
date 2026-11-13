'use client';
// The side panel's parts in the lab, where their hands are live: a control's hand is a function, and only
// a client component can hold one, so the registry draws these instead of the parts with empty hands.
import { useState } from 'react';
import { ConversationList } from '../components/chat/ConversationList.tsx';
import { IconButton } from '../components/ui/IconButton.tsx';
import { NavItem } from '../components/ui/NavItem.tsx';
import { SectionHead } from '../components/ui/SectionHead.tsx';
import { type RailSection, SideRail } from '../components/ui/SideRail.tsx';
import { agentWords } from '../lib/agents.ts';
import { usePanelWidth } from '../viewmodels/usePanelWidth.ts';
import { PANEL_STATES } from './panel-fixtures.ts';

/** The bar's sections, as WorkMenu gives them, each with a first afternoon's rows or a line. */
const SECTIONS: RailSection[] = [
  {
    key: 'conversations',
    icon: 'conversation',
    label: 'Conversations',
    content: (
      <section className="flex flex-col">
        <SectionHead size="panel" title="Conversations" />
        <ConversationList rows={PANEL_STATES.five.rows} />
      </section>
    ),
  },
  ...(
    [
      ['projects', 'project', 'Projects'],
      ['agents', 'agent', 'Your agents'],
    ] as const
  ).map(([key, icon, label]) => ({
    key,
    icon,
    label,
    content: <SectionHead size="panel" title={label} />,
  })),
];

/** The panel, open or collapsed to the bar, its width sized at its edge (all of it: /lab/panel). */
export function LabRail({ open: initial }: { open: boolean }) {
  const [open, setOpen] = useState(initial);
  const [jump, setJump] = useState<{ key: string; n: number } | null>(null);
  const width = usePanelWidth();
  return (
    <SideRail
      label="Your work"
      sections={SECTIONS}
      open={open}
      toggleLabel={open ? 'Hide the panel' : 'Show the panel'}
      onToggle={() => setOpen((now) => !now)}
      onJump={(key) => {
        setOpen(true);
        setJump((now) => ({ key, n: (now?.n ?? 0) + 1 }));
      }}
      jump={jump}
      width={width.hand}
      account={{ href: '/lobby', label: 'Lobby', current: false }}
    />
  );
}

/** A project's row, which opens and folds. */
export function LabProject() {
  const [shown, setShown] = useState(true);
  return (
    <NavItem
      onClick={() => setShown((s) => !s)}
      expanded={shown}
      icon="chevron"
      label="NEAR stake"
      trail="6"
    />
  );
}

/** An agent's line, with the control that ends it. */
export function LabAgent() {
  return (
    <NavItem
      icon="agent"
      label="Codex"
      trail="waiting"
      action={<IconButton icon="close" label="Disconnect Codex" onClick={() => {}} />}
    />
  );
}

/** A group's one action, its last row. */
export function LabAction() {
  const [copied, setCopied] = useState(false);
  return (
    <NavItem
      onClick={() => setCopied(true)}
      icon="plus"
      label={copied ? agentWords.copied : agentWords.copy}
      muted
    />
  );
}

/** The fold. */
export function LabFold() {
  const [open, setOpen] = useState(true);
  return (
    <IconButton
      icon="sidebar"
      label={open ? 'Hide the panel' : 'Show the panel'}
      onClick={() => setOpen((o) => !o)}
      expanded={open}
    />
  );
}

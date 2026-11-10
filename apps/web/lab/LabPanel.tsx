'use client';
// The side panel's parts in the lab, where their hands are live: a control's hand is a function, and only
// a client component can hold one, so the registry draws these instead of the parts with empty hands.
import { useState } from 'react';
import { ConversationList } from '../components/chat/ConversationList.tsx';
import { IconButton } from '../components/ui/IconButton.tsx';
import { NavItem } from '../components/ui/NavItem.tsx';
import { SectionHead } from '../components/ui/SectionHead.tsx';
import { type RailItem, SideRail } from '../components/ui/SideRail.tsx';
import { PANEL_STATES } from './panel-fixtures.ts';

/** The panel's places, as WorkMenu gives them. */
const ITEMS: RailItem[] = [
  { key: 'new', icon: 'plus', label: 'New conversation', href: '#new' },
  { key: 'lobby', icon: 'home', label: 'Lobby', href: '#lobby' },
];

/** The panel, open or folded, with a first afternoon in it (all of it: /lab/panel). */
export function LabRail({ open: initial }: { open: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <SideRail
      label="Your work"
      open={open}
      foldLabel="Hide the panel"
      unfoldLabel="Show the panel"
      onFold={() => setOpen(false)}
      onUnfold={() => setOpen(true)}
      items={ITEMS}
    >
      <section className="flex flex-col">
        <SectionHead size="panel" title="Conversations" />
        <ConversationList rows={PANEL_STATES.five.rows} />
      </section>
    </SideRail>
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
      label={copied ? 'Copied. Paste it in an agent' : 'Connect an agent'}
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

// The work menu's own state, the same on the lobby and the workspace (WorkMenu): open or folded, the
// person's projects and which of them are showing their conversations (Elco, 10 Nov), the person's agents
// and what each is doing, and the one prompt that connects another (Elco, 9 Nov, the first full test).
// The agents and the projects are read when the page opens and again whenever `fresh` changes: a run
// ending, or a conversation's change signal. No timer.
import { useCallback, useEffect, useState } from 'react';
import {
  disconnectAgent,
  listProjects,
  newProject as makeProject,
  mintAgentLink,
  readAgents,
} from '../lib/agent-client.ts';
import { agentRows, agentWords, type ConnectedAgent } from '../lib/agents.ts';
import type { ListedProject } from '../lib/conversation-list.ts';
import { panelWords } from '../lib/panel-words.ts';

export function useWorkMenu(signedIn: boolean, fresh: unknown = null) {
  // box.fold: the menu starts open, as an IDE's does, and folds away by hand
  const [open, setOpen] = useState(true);
  const [agents, setAgents] = useState<ConnectedAgent[]>([]);
  const [projects, setProjects] = useState<ListedProject[]>([]);
  const [opened, setOpened] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  // a read again after a disconnect, so the list says what's true
  const [reads, setReads] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `fresh` is the signal to read again
  useEffect(() => {
    if (!signedIn) return;
    let gone = false;
    void readAgents().then(
      (list) => {
        if (!gone) setAgents(list);
      },
      () => {},
    );
    void listProjects().then(
      (list) => {
        if (!gone) setProjects(list);
      },
      () => {},
    );
    return () => {
      gone = true;
    };
  }, [signedIn, fresh, reads]);

  // each copy carries a new link of its own, so pasting into one more agent never cuts off another
  const copy = useCallback(async () => {
    const { token } = await mintAgentLink();
    await navigator.clipboard.writeText(agentWords.prompt(window.location.origin, token));
    setCopied(true);
  }, []);

  const disconnect = useCallback(async (name: string) => {
    await disconnectAgent(name).catch(() => null);
    setReads((n) => n + 1);
  }, []);

  // a new project comes in open, so what goes in it next has somewhere to show
  const newProject = useCallback(async () => {
    const made = await makeProject(panelWords.newProject);
    if (!made) return;
    setProjects((list) => [...list, made]);
    setOpened((keys) => [...keys, made.id]);
  }, []);

  return {
    open,
    projects,
    opened,
    toggle: (key: string) =>
      setOpened((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key])),
    newProject: () => void newProject().catch(() => {}),
    fold: () => setOpen(false),
    unfold: () => setOpen(true),
    agents: agentRows(agents),
    copied,
    copy: () => void copy().catch(() => {}),
    disconnect: (name: string) => void disconnect(name),
  };
}

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
  moveConversation,
  readAgents,
} from '../lib/agent-client.ts';
import { agentRows, agentWords, type ConnectedAgent } from '../lib/agents.ts';
import type { ListedProject } from '../lib/conversation-list.ts';
import type { SectionKey } from '../lib/panel-words.ts';

export function useWorkMenu(signedIn: boolean, fresh: unknown = null) {
  // box.fold: the panel starts open on its conversations, as an IDE's does; the open section's icon folds
  // it to the bar, and another switches
  const [section, setSection] = useState<SectionKey | null>('conversations');
  const [agents, setAgents] = useState<ConnectedAgent[]>([]);
  const [projects, setProjects] = useState<ListedProject[]>([]);
  const [opened, setOpened] = useState<string[]>([]);
  // a new project's row, waiting for its name
  const [naming, setNaming] = useState(false);
  // the conversation whose projects are open to choose from, and where each moved one is now, until the
  // list is read again and says so itself
  const [moving, setMoving] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Record<string, string | null>>({});
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
  const nameProject = useCallback(async (name: string) => {
    setNaming(false);
    const made = await makeProject(name);
    if (!made) return;
    setProjects((list) => [...list, made]);
    setOpened((keys) => [...keys, made.id]);
  }, []);

  // the project it goes into opens, so the row is seen where it went
  const moveTo = useCallback(async (row: string, project: string | null) => {
    setMoving(null);
    if (!(await moveConversation(row, project))) return;
    setPlaced((now) => ({ ...now, [row]: project }));
    if (project) setOpened((keys) => (keys.includes(project) ? keys : [...keys, project]));
  }, []);

  return {
    section,
    choose: (key: SectionKey) => setSection((now) => (now === key ? null : key)),
    projects,
    opened,
    toggle: (key: string) =>
      setOpened((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key])),
    naming,
    newProject: () => setNaming(true),
    nameProject: (name: string) => void nameProject(name).catch(() => {}),
    stopNaming: () => setNaming(false),
    moving,
    toggleMoving: (row: string) => setMoving((now) => (now === row ? null : row)),
    moveTo: (row: string, project: string | null) => void moveTo(row, project).catch(() => {}),
    placed,
    agents: agentRows(agents),
    copied,
    copy: () => void copy().catch(() => {}),
    disconnect: (name: string) => void disconnect(name),
  };
}

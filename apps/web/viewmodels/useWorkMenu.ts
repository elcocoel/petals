// The work menu's own state, the same on the lobby and the workspace (WorkMenu): open or folded, the
// person's projects and which of them are showing their conversations (Elco, 10 Nov), the person's agents
// and what each is doing, and the one prompt that connects another (Elco, 9 Nov, the first full test).
// The agents and the projects are read when the page opens and again whenever `fresh` changes: a run
// ending, or a conversation's change signal. No timer.
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  archiveConversation,
  deleteConversation,
  disconnectAgent,
  listArchived,
  listProjects,
  newProject as makeProject,
  mintAgentLink,
  moveConversation,
  readAgents,
} from '../lib/agent-client.ts';
import { agentRows, agentWords, type ConnectedAgent } from '../lib/agents.ts';
import type { ListedConversation, ListedProject, RowRef } from '../lib/conversation-list.ts';
import { panelWords, type SectionKey } from '../lib/panel-words.ts';

/** Folded sections, kept in this browser, as the width is (design/side-panel.md, line 41). */
const FOLDED = 'petals:panel-folded';
const SECTIONS: readonly SectionKey[] = [
  'conversations',
  'projects',
  'agents',
  'lobby',
  'profile',
  'settings',
];

function keptFolds(): SectionKey[] {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(FOLDED) ?? '[]');
    return Array.isArray(raw) ? SECTIONS.filter((k) => raw.includes(k)) : [];
  } catch {
    return [];
  }
}

function keepFolds(keys: readonly SectionKey[]) {
  try {
    window.localStorage.setItem(FOLDED, JSON.stringify(keys));
  } catch {
    // a browser that keeps nothing starts with every section open
  }
}

export function useWorkMenu(
  signedIn: boolean,
  fresh: unknown = null,
  /** Reads the list of conversations again, after an archive, an unarchive or a delete. */
  reread: () => void = () => {},
) {
  const router = useRouter();
  // box.fold: the panel starts open, as an IDE's does (design/side-panel.md); the one collapse control
  // hides it to the bar and shows it again; a section's icon opens it, if need be, and asks for that section
  const [open, setOpen] = useState(true);
  const [jump, setJump] = useState<{ key: SectionKey; n: number } | null>(null);
  // sections folded to their heads; read after the first paint, so the server's page and the browser's agree
  const [folded, setFolded] = useState<SectionKey[]>([]);
  useEffect(() => setFolded(keptFolds()), []);
  const fold = useCallback((key: SectionKey) => {
    setFolded((now) => {
      const next = now.includes(key) ? now.filter((k) => k !== key) : [...now, key];
      keepFolds(next);
      return next;
    });
  }, []);
  const [agents, setAgents] = useState<ConnectedAgent[]>([]);
  const [projects, setProjects] = useState<ListedProject[]>([]);
  const [opened, setOpened] = useState<string[]>([]);
  // a new project's row, waiting for its name
  const [naming, setNaming] = useState(false);
  // where each moved conversation is now, until the list is read again and says so itself
  const [placed, setPlaced] = useState<Record<string, string | null>>({});
  // a row's menu (design/side-panel.md, lines 24 to 29): the one open, the move dialog and its search,
  // the delete dialog and why it last failed
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [moving, setMoving] = useState<RowRef | null>(null);
  const [query, setQuery] = useState('');
  const [removing, setRemoving] = useState<RowRef | null>(null);
  const [removeFailed, setRemoveFailed] = useState<string | null>(null);
  // dragging a row onto a project (lines 30 to 32), and what a move leaves behind (line 31)
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [justMoved, setJustMoved] = useState<string | null>(null);
  const [said, setSaid] = useState('');
  // archived conversations (lines 27 and 28)
  const [archived, setArchived] = useState<ListedConversation[]>([]);
  const [archivedOpen, setArchivedOpen] = useState(false);
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
    void listArchived().then(
      (list) => {
        if (!gone) setArchived(list);
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

  // the project it goes into opens, its row there takes a soft fill, and a screen reader hears where
  const moveTo = useCallback(
    async (row: { key: string; title: string }, project: { key: string; name: string } | null) => {
      setMoving(null);
      setQuery('');
      if (!(await moveConversation(row.key, project?.key ?? null))) return;
      setPlaced((now) => ({ ...now, [row.key]: project?.key ?? null }));
      if (project)
        setOpened((keys) => (keys.includes(project.key) ? keys : [...keys, project.key]));
      setJustMoved(row.key);
      setSaid(panelWords.moved(row.title, project?.name ?? null));
    },
    [],
  );

  const archive = useCallback(
    async (key: string, out: boolean) => {
      if (!(await archiveConversation(key, out))) return;
      setReads((n) => n + 1);
      reread();
    },
    [reread],
  );

  // a conversation deleted while it's open leaves for a new one
  const remove = useCallback(async () => {
    if (!removing) return;
    const failed = await deleteConversation(removing.key);
    if (failed) {
      setRemoveFailed(failed);
      return;
    }
    setRemoving(null);
    setRemoveFailed(null);
    setReads((n) => n + 1);
    reread();
    if (removing.current) router.push('/make');
  }, [removing, reread, router]);

  return {
    open,
    toggleOpen: () => setOpen((now) => !now),
    jump,
    jumpTo: (key: SectionKey) => {
      setOpen(true);
      setFolded((now) => {
        if (!now.includes(key)) return now;
        const next = now.filter((k) => k !== key);
        keepFolds(next);
        return next;
      });
      setJump((now) => ({ key, n: (now?.n ?? 0) + 1 }));
    },
    folded,
    fold,
    projects,
    opened,
    toggle: (key: string) =>
      setOpened((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key])),
    naming,
    newProject: () => setNaming(true),
    nameProject: (name: string) => void nameProject(name).catch(() => {}),
    stopNaming: () => setNaming(false),
    placed,
    menuFor,
    toggleMenu: (key: string) => setMenuFor((now) => (now === key ? null : key)),
    closeMenu: () => setMenuFor(null),
    moving,
    startMove: (row: RowRef) => {
      setQuery('');
      setMoving(row);
    },
    stopMove: () => setMoving(null),
    query,
    setQuery,
    moveTo: (row: { key: string; title: string }, project: { key: string; name: string } | null) =>
      void moveTo(row, project).catch(() => {}),
    archive: (key: string) => void archive(key, true).catch(() => {}),
    unarchive: (key: string) => void archive(key, false).catch(() => {}),
    archived,
    archivedOpen,
    toggleArchived: () => setArchivedOpen((now) => !now),
    removing,
    startRemove: (row: RowRef) => {
      setRemoveFailed(null);
      setRemoving(row);
    },
    stopRemove: () => setRemoving(null),
    remove: () => void remove().catch(() => {}),
    removeFailed,
    dragging,
    dragStart: (key: string) => setDragging(key),
    dragEnd: () => {
      setDragging(null);
      setDropOn(null);
    },
    dropOn,
    dragOver: (project: string | null) => setDropOn(project),
    justMoved,
    said,
    agents: agentRows(agents),
    copied,
    copy: () => void copy().catch(() => {}),
    disconnect: (name: string) => void disconnect(name),
  };
}

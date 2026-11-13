// The work menu's own state, the same on the lobby and the workspace (WorkMenu): open or folded, the
// person's projects and which of them are showing their conversations, the person's agents
// and what each is doing, and the one prompt that connects another.
// The agents and the projects are read when the page opens, again whenever `fresh` changes (a run ending, or a
// conversation's change signal), and when the window comes back into focus. One timer: after
// Connect an agent, a watch for the agent joining.
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { agentRows, agentWords, type ConnectedAgent, type CopiedAt } from '../lib/agents.ts';
import type { ListedConversation, ListedProject, RowRef } from '../lib/conversation-list.ts';
import { panelWords, type SectionKey } from '../lib/panel-words.ts';

/** Folded sections, kept in this browser, as the width is. */
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
    const kept = window.localStorage.getItem(FOLDED);
    // Settings starts folded until the person opens it once
    if (kept === null) return ['settings'];
    const raw: unknown = JSON.parse(kept);
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

/** How long Connect an agent's Copied shows. */
const COPIED_SHOWS_MS = 2400;
/**
 * After Connect an agent is pressed, the panel watches for the agent joining, so it shows without a reload: it
 * looks every five seconds for ten minutes, and stops the moment a new one shows. Codex took two and a half
 * minutes from the copy to joining in a test; ten leaves room for a slow install.
 */
const WATCH_AFTER_COPY_MS = 10 * 60_000;
const WATCH_EVERY_MS = 5_000;
/** One worker of one agent, as the list names it. */
const workerOf = (a: ConnectedAgent) => `${a.name}\u0000${a.worker ?? ''}`;

export function useWorkMenu(
  signedIn: boolean,
  fresh: unknown = null,
  /** Reads the list of conversations again, after an archive, an unarchive or a delete. */
  reread: () => void = () => {},
) {
  const router = useRouter();
  // box.fold: the panel starts open, as an IDE's does; the one collapse control
  // hides it to the bar and shows it again; a section's icon opens it, if need be, and asks for that section
  const [open, setOpen] = useState(true);
  // a narrow window folds it back to the bar (useWorkPanel.ts)
  const shut = useCallback(() => setOpen(false), []);
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
  // a row's menu: the one open, the move dialog and its search,
  // the delete dialog and why it last failed
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [moving, setMoving] = useState<RowRef | null>(null);
  const [query, setQuery] = useState('');
  const [removing, setRemoving] = useState<RowRef | null>(null);
  const [removeFailed, setRemoveFailed] = useState<string | null>(null);
  // dragging a row onto a project, and what a move leaves behind
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [justMoved, setJustMoved] = useState<string | null>(null);
  const [said, setSaid] = useState('');
  // archived conversations
  const [archived, setArchived] = useState<ListedConversation[]>([]);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [copied, setCopied] = useState<CopiedAt | null>(null);
  // Copied shows for a moment, then goes
  useEffect(() => {
    if (!copied) return;
    const gone = setTimeout(() => setCopied(null), COPIED_SHOWS_MS);
    return () => clearTimeout(gone);
  }, [copied]);
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
  // after each copy, a watch for the agent it brings: every few seconds until a worker that wasn't listed shows
  const listed = useRef(agents);
  listed.current = agents;
  const [watches, setWatches] = useState(0);
  useEffect(() => {
    if (!signedIn || !watches) return;
    const known = new Set(listed.current.map(workerOf));
    const until = Date.now() + WATCH_AFTER_COPY_MS;
    let gone = false;
    const look = setInterval(() => {
      if (Date.now() > until) {
        clearInterval(look);
        return;
      }
      void readAgents().then(
        (list) => {
          if (gone) return;
          setAgents(list);
          if (list.some((a) => !known.has(workerOf(a)))) clearInterval(look);
        },
        () => {},
      );
    }, WATCH_EVERY_MS);
    return () => {
      gone = true;
      clearInterval(look);
    };
  }, [signedIn, watches]);
  // and again when the person comes back to this window: an agent they connect is pasted into another window and
  // joins while this one is away (a Codex agent didn't show up without it). An event, not a timer.
  useEffect(() => {
    if (!signedIn) return;
    const back = () => setReads((n) => n + 1);
    window.addEventListener('focus', back);
    return () => window.removeEventListener('focus', back);
  }, [signedIn]);

  // each copy carries a new link of its own, so pasting into one more agent never cuts off another
  const copy = useCallback(async (at: CopiedAt) => {
    const { token } = await mintAgentLink();
    await navigator.clipboard.writeText(agentWords.prompt(window.location.origin, token));
    setCopied(at);
    setWatches((n) => n + 1);
  }, []);

  const disconnect = useCallback(async (name: string) => {
    await disconnectAgent(name).catch(() => null);
    setReads((n) => n + 1);
  }, []);

  // every agent, all its workers, at once (line 46)
  const disconnectAll = useCallback(async () => {
    const names = [...new Set(agents.map((a) => a.name))];
    await Promise.all(names.map((name) => disconnectAgent(name).catch(() => null)));
    setReads((n) => n + 1);
  }, [agents]);

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
    shut,
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
    copy: (at: CopiedAt) => void copy(at).catch(() => {}),
    disconnect: (name: string) => void disconnect(name),
    disconnectAll: () => void disconnectAll(),
  };
}

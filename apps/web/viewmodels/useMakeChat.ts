// The ViewModel of the maker chat (T065, T166, T178). A chat reads like every AI chat: the run_id
// from the first `run` event goes into the URL (/make?run=<id>); the next message sends it, so the
// server continues the run and the model keeps what it read. Opening that URL loads the stored run.
//
// The flows are plain async functions over an injected adapter, store and dispatch, tested without a
// browser. The hook only wires them to React. There is no actions.stop: packages/agent has no abort,
// so Stop needs server work first, and a button here would claim what nothing can witness.
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { type AgentClient, agentClient, refusalCode } from '../lib/agent-client.ts';
import { withAbout } from '../lib/ask-about.ts';
import type { Settings } from '../lib/composer-options.ts';
import {
  type ChatAction,
  type ChatState,
  chatReducer,
  initialChat,
  type Opened,
  type QuestionStore,
  questionBackup,
} from '../lib/thread.ts';
import { RECORDED_QUESTION, threadView } from '../lib/thread-view.ts';
import { usePersonView } from './usePersonView.ts';

export interface ChatDeps {
  client: AgentClient;
  store: QuestionStore | null;
  dispatch: (action: ChatAction) => void;
  /** a `run` event named this run */
  onRun: (runId: string) => void;
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * One question to the server. The box empties at once, and the words wait in the backup until a
 * `run` event says the server took them. Any failure before that puts them back; after it, a stream
 * that ends without `done` is a lost turn, not an error: the question landed and the run goes on.
 */
export async function sendQuestion(
  deps: ChatDeps,
  q: {
    text: string;
    recorded: boolean;
    greeting?: string | undefined;
    runId: string | null;
    /** what it's about (lib/ask-about.ts): it goes with the words, and a failure gives back only them */
    about?: string | undefined;
    /** a pick the server should hold from this message on */
    settings?: Settings | undefined;
  },
): Promise<void> {
  // a recorded run can't go on from what was said: each play starts over, with no words of its own
  const continuing = q.recorded ? null : q.runId;
  const backup = q.recorded ? null : questionBackup(deps.store, continuing);
  backup?.keep(q.text);
  const said = q.about && !q.recorded ? withAbout(q.about, q.text) : q.text;
  deps.dispatch({ type: 'sent', text: said, startOver: q.recorded });
  let accepted = false;
  let failure: string | null = null;
  let failureCode: string | null = null;
  try {
    const events = deps.client.chat({
      messages: [
        // the model should know what it has already said to this person
        ...(q.greeting && !continuing ? [{ role: 'assistant' as const, content: q.greeting }] : []),
        // only what is new: the server holds the conversation
        { role: 'user' as const, content: said },
      ],
      ...(continuing ? { run_id: continuing } : {}),
      ...(q.settings && !q.recorded ? { settings: q.settings } : {}),
    });
    for await (const event of events) {
      if (event.event === 'run') {
        accepted = true;
        backup?.clear();
        deps.onRun(event.data.run_id);
      }
      deps.dispatch({ type: 'event', event });
    }
  } catch (e) {
    failure = messageOf(e);
    failureCode = refusalCode(e);
  }
  if (accepted) deps.dispatch({ type: 'ended', again: false });
  else {
    deps.dispatch({
      type: 'refused',
      text: q.recorded ? null : q.text,
      message: failure ?? 'The connection closed before the server accepted your question.',
      ...(failureCode ? { code: failureCode } : {}),
    });
  }
}

/**
 * A stored run: what it holds now, then, if it is still going, the rest as it happens. Opening a link
 * and following a lost turn again are the same thing. Whatever ends the stream, `ended` decides.
 */
export async function openRun(
  deps: ChatDeps,
  runId: string,
  o: { again?: boolean; gone?: () => boolean } = {},
): Promise<void> {
  const gone = o.gone ?? (() => false);
  deps.dispatch({ type: 'opening' });
  let read: Awaited<ReturnType<AgentClient['readRun']>>;
  try {
    read = await deps.client.readRun(runId);
  } catch (e) {
    if (!gone()) deps.dispatch({ type: 'unreadable', code: 'client', message: messageOf(e) });
    return;
  }
  if (gone()) return;
  if (!read.ok) {
    deps.dispatch({ type: 'unreadable', code: read.code, message: read.message });
    return;
  }
  deps.dispatch({ type: 'opened', run: read.run });
  if (read.run.status === 'running') {
    try {
      for await (const event of deps.client.followRun(runId, read.run.events.length)) {
        if (gone()) return;
        if (event.event === 'run') deps.onRun(event.data.run_id);
        deps.dispatch({ type: 'event', event });
      }
    } catch {
      // the same as the stream ending: `ended` says what that means for this turn
    }
    if (gone()) return;
  }
  deps.dispatch({ type: 'ended', again: o.again ?? false });
}

/**
 * A reload before acceptance: the words that were on their way. A question the address brought to a new
 * conversation wins over them, so it arrives once and with nothing older stuck to it. In a run the
 * backup belongs to that conversation, so it stays, and joining the same words twice is joining them once.
 */
export function restoreQuestion(
  deps: Pick<ChatDeps, 'store' | 'dispatch'>,
  runId: string | null,
  asked: string | null = null,
) {
  if (asked && !runId) return;
  const text = questionBackup(deps.store, runId).read();
  if (text) deps.dispatch({ type: 'restored', text });
}

/** The box changed. A restored question was never accepted, so its backup follows the box. */
export function typeQuestion(
  deps: Pick<ChatDeps, 'store' | 'dispatch'>,
  s: Pick<ChatState, 'restored' | 'runId'>,
  text: string,
) {
  deps.dispatch({ type: 'typed', text });
  if (!s.restored) return;
  const backup = questionBackup(deps.store, s.runId);
  if (text.trim()) backup.keep(text);
  else backup.clear();
}

/** This page was reloaded, rather than reached by a link, New or the address bar. */
function cameByReload(): boolean {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    // The document's one load. Since the side panel moves inside the page (app/(work)/layout.tsx), a move
    // after a reload isn't one: only the address the browser itself reloaded counts.
    return nav?.type === 'reload' && nav.name === window.location.href;
  } catch {
    return false;
  }
}

function browserStore(): QuestionStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null; // a sandboxed page may refuse even the question
  }
}

export function useMakeChat({
  initialRun,
  initialQuestion = null,
  recorded = false,
  opening,
  initialOpen,
  initialPetal,
}: {
  initialRun?: string | undefined;
  /** the words in the address (?q=). A recorded run has its own saved question, so it ignores them. */
  initialQuestion?: string | null;
  recorded?: boolean;
  /** what the agent says first, on a new chat: written text, so opening the app costs no model call */
  opening?: string | undefined;
  initialOpen?: Opened;
  initialPetal?: string | null;
}) {
  const greeting = opening && !initialRun && !recorded ? opening : undefined;
  const asked = recorded ? null : initialQuestion;
  const [chat, dispatch] = useReducer(
    chatReducer,
    {
      ...(initialRun ? { initialRun } : {}),
      ...(asked ? { question: asked } : {}),
      ...(greeting ? { greeting } : {}),
      ...(initialOpen ? { open: initialOpen } : {}),
      ...(initialPetal ? { petal: initialPetal } : {}),
    },
    initialChat,
  );
  const box = useRef<HTMLTextAreaElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const deps = useMemo<ChatDeps>(
    // the address follows the state (useWorkspace), so there is nothing to do on a run here
    () => ({ client: agentClient, store: browserStore(), dispatch, onRun: () => {} }),
    [],
  );

  useEffect(() => {
    const el = box.current;
    if (recorded || !el) return;
    el.focus();
    // Words the address brought: the caret after them. However long they are, their end and the button
    // stay in sight, in the field and in whatever box holds it.
    el.setSelectionRange(el.value.length, el.value.length);
    el.scrollTop = el.scrollHeight;
    el.form?.scrollIntoView({ block: 'end' });
  }, [recorded]);

  // New is new: words that were on their way come back only on a
  // reload of this same page; arriving by New or a link starts clean, and forgets them.
  useEffect(() => {
    if (recorded) return;
    if (cameByReload()) restoreQuestion(deps, initialRun ?? null, asked);
    else questionBackup(deps.store, initialRun ?? null).clear();
  }, [deps, initialRun, recorded, asked]);

  useEffect(() => {
    if (!initialRun) return;
    let gone = false;
    void openRun(deps, initialRun, { gone: () => gone });
    return () => {
      gone = true;
    };
  }, [deps, initialRun]);

  const { items, busy, runId, turn, lostAgain, question, open } = chat;
  const { view } = usePersonView();
  const rows = useMemo(
    () => threadView({ items, busy, runId, turn, lostAgain, recorded, open, view }),
    [items, busy, runId, turn, lostAgain, recorded, open, view],
  );

  return {
    state: { ...chat, rows, recorded },
    dispatch,
    actions: {
      setQuestion: (text: string) => typeQuestion(deps, chat, text),
      /** `words`, when given, are sent in place of what's in the field (a shortcut's ask) */
      send: async (about?: string, settings?: Settings, words?: string) => {
        const text = recorded ? RECORDED_QUESTION : (words ?? question).trim();
        if (!text || busy) return;
        following.current = true;
        await sendQuestion(deps, { text, recorded, greeting, runId, about, settings });
        box.current?.focus();
      },
      refollow: () => {
        if (runId && !busy) void openRun(deps, runId, { again: true });
      },
      /** The server started a turn of its own (a report Petals' agent takes up): read it and follow it. */
      follow: () => {
        if (runId && !busy) void openRun(deps, runId);
      },
    },
    refs: { box, thread, following },
  };
}

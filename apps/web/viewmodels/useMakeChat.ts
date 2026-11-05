// The ViewModel of the maker chat (T065, T166, T178). A chat reads like every AI chat: the run_id
// from the first `run` event goes into the URL (/make?run=<id>); the next message sends it, so the
// server continues the run and the model keeps what it read. Opening that URL loads the stored run.
//
// The flows are plain async functions over an injected adapter, store and dispatch, tested without a
// browser. The hook only wires them to React. There is no actions.stop: packages/agent has no abort,
// so Stop needs server work first, and a button here would claim what nothing can witness.
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { type AgentClient, agentClient } from '../lib/agent-client.ts';
import {
  type ChatAction,
  type ChatState,
  chatReducer,
  initialChat,
  type QuestionStore,
  questionBackup,
} from '../lib/thread.ts';
import { composerView, RECORDED_QUESTION, threadView } from '../lib/thread-view.ts';

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
  q: { text: string; recorded: boolean; greeting?: string; runId: string | null },
): Promise<void> {
  // a recorded run can't go on from what was said: each play starts over, with no words of its own
  const continuing = q.recorded ? null : q.runId;
  const backup = q.recorded ? null : questionBackup(deps.store, continuing);
  backup?.keep(q.text);
  deps.dispatch({ type: 'sent', text: q.text, startOver: q.recorded });
  let accepted = false;
  let failure: string | null = null;
  try {
    const events = deps.client.chat({
      messages: [
        // the model should know what it has already said to this person
        ...(q.greeting && !continuing ? [{ role: 'assistant' as const, content: q.greeting }] : []),
        // only what is new: the server holds the conversation
        { role: 'user' as const, content: q.text },
      ],
      ...(continuing ? { run_id: continuing } : {}),
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
  }
  if (accepted) deps.dispatch({ type: 'ended', again: false });
  else {
    deps.dispatch({
      type: 'refused',
      text: q.recorded ? null : q.text,
      message: failure ?? 'The connection closed before the server accepted your question.',
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

/** A reload before acceptance: the words that were on their way. */
export function restoreQuestion(deps: Pick<ChatDeps, 'store' | 'dispatch'>, runId: string | null) {
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

function browserStore(): QuestionStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null; // a sandboxed page may refuse even the question
  }
}

const showRunInUrl = (runId: string) => {
  window.history.replaceState(null, '', `/make?run=${encodeURIComponent(runId)}`);
};

export function useMakeChat({
  initialRun,
  recorded = false,
  opening,
}: {
  initialRun?: string;
  recorded?: boolean;
  /** what the agent says first, on a new chat: written text, so opening the app costs no model call */
  opening?: string;
}) {
  const greeting = opening && !initialRun && !recorded ? opening : undefined;
  const [chat, dispatch] = useReducer(chatReducer, { initialRun, greeting }, initialChat);
  const box = useRef<HTMLTextAreaElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const deps = useMemo<ChatDeps>(
    () => ({ client: agentClient, store: browserStore(), dispatch, onRun: showRunInUrl }),
    [],
  );

  useEffect(() => {
    if (!recorded) box.current?.focus();
  }, [recorded]);

  useEffect(() => {
    if (!recorded) restoreQuestion(deps, initialRun ?? null);
  }, [deps, initialRun, recorded]);

  useEffect(() => {
    if (!initialRun) return;
    let gone = false;
    void openRun(deps, initialRun, { gone: () => gone });
    return () => {
      gone = true;
    };
  }, [deps, initialRun]);

  const { items, busy, runId, turn, lostAgain, question } = chat;
  const rows = useMemo(
    () => threadView({ items, busy, runId, turn, lostAgain, recorded }),
    [items, busy, runId, turn, lostAgain, recorded],
  );

  return {
    state: { ...chat, rows, composer: composerView({ question, runId, busy, recorded }) },
    actions: {
      setQuestion: (text: string) => typeQuestion(deps, chat, text),
      send: async () => {
        const text = recorded ? RECORDED_QUESTION : question.trim();
        if (!text || busy) return;
        following.current = true;
        await sendQuestion(deps, { text, recorded, greeting, runId });
        box.current?.focus();
      },
      refollow: () => {
        if (runId && !busy) void openRun(deps, runId, { again: true });
      },
    },
    refs: { box, thread, following },
  };
}

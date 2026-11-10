// The conversation on /make as a list of items, folded from the agent's events (http-api.md, Agent
// chat), live or from a stored run. Pure, so a reload and a live chat read the same. Below the list:
// the stages of a turn, the backup of a question, and the one reducer the chat's state goes through.
import type { AgentEvent, FlowerResult, JobEvent, ModelSignature, Run } from '@petal/core/types';
import { readAbout } from './ask-about.ts';

export type Done = Extract<AgentEvent, { event: 'done' }>['data'];

export type Step =
  | { kind: 'stage'; stage: string; message: string }
  | { kind: 'progress'; message: string; done?: number; total?: number }
  | {
      kind: 'tool';
      id: string;
      name: string;
      args: unknown;
      result?: { ok: boolean; summary: string; ms: number };
    };

export type Item =
  | Step
  | { kind: 'user'; text: string }
  | { kind: 'note'; text: string }
  | { kind: 'message'; text: string }
  | { kind: 'flower'; flower: FlowerResult; signature: ModelSignature | null }
  /** a stored flower was opened here: what it was asked and what it found */
  | StoredItem
  | { kind: 'error'; code: string; message: string; hint?: string }
  /** A job Petals' agent handed to the person's own agent (C), as the run said it. */
  | { kind: 'job'; job: JobEvent }
  | { kind: 'done'; done: Done; signature: ModelSignature | null };

export interface StoredItem {
  kind: 'stored';
  id: string;
  question: string | null;
  summary: string;
  network: string;
  asOf: string;
}

/**
 * Petals' agent names the conversation with this tool, beside its answer (SYSTEMS, 10 Nov). The name
 * shows in the list, so the call isn't a step here (META's lean).
 */
const NAMING_TOOL = 'name_conversation';

/** How a turn Petals' agent starts on its own begins (SYSTEMS, C): a report it takes up at once. */
export const FROM_PETALS = '(Petals)';

/** One event into the list. `run` and heartbeats add nothing to read. */
export function fold(items: Item[], e: AgentEvent): Item[] {
  switch (e.event) {
    case 'stage':
      // a recorded run says so where it can't be missed
      return e.data.stage === 'recorded'
        ? [...items, { kind: 'note', text: e.data.message }]
        : [...items, { kind: 'stage', ...e.data }];
    case 'progress':
      return [...items, { kind: 'progress', ...e.data }];
    case 'tool_call':
      return e.data.name === NAMING_TOOL ? items : [...items, { kind: 'tool', ...e.data }];
    case 'tool_result': {
      const { id, ok, summary, ms } = e.data;
      return items.map((x) =>
        x.kind === 'tool' && x.id === id ? { ...x, result: { ok, summary, ms } } : x,
      );
    }
    case 'message':
      return [...items, { kind: 'message', text: e.data.text }];
    case 'flower':
      return [...items, { kind: 'flower', flower: e.data, signature: null }];
    case 'signature': {
      const at = items.findLastIndex((x) => x.kind === 'flower');
      return items.map((x, i) =>
        i === at && x.kind === 'flower' ? { ...x, signature: e.data } : x,
      );
    }
    case 'job':
      return [...items, { kind: 'job', job: e.data }];
    case 'error':
      return [...items, { kind: 'error', ...e.data }];
    case 'done': {
      // a run stored before done.signature existed: the flower's, if this chat drew one
      let signature = e.data.signature;
      if (signature === undefined) {
        const turn = items.slice(items.findLastIndex((x) => x.kind === 'user') + 1);
        const flower = turn.findLast((x) => x.kind === 'flower');
        signature = flower?.kind === 'flower' ? flower.signature : null;
      }
      return [...items, { kind: 'done', done: e.data, signature }];
    }
    default:
      return items;
  }
}

/**
 * A stored run as the list it was when it was live. Events don't carry the questions and
 * run.messages doesn't carry the tools, so the two are walked together: each chat (a `run` event)
 * shows the messages waiting before its first answer, leaving one question for each later chat.
 */
export function threadFromRun(run: Pick<Run, 'messages' | 'events'>): Item[] {
  const { messages, events } = run;
  let items: Item[] = [];
  let p = 0;
  let chatsAfter = events.filter((e) => e.event === 'run').length;
  const questionsLeft = () => messages.slice(p).filter((m) => m.role === 'user').length;

  events.forEach((e, i) => {
    if (e.event === 'run') {
      chatsAfter--;
      const rest = events.slice(i + 1);
      const end = rest.findIndex((x) => x.event === 'run');
      const own = end === -1 ? rest : rest.slice(0, end);
      const first = own.find((x) => x.event === 'message');
      const answer = first?.event === 'message' ? first.data.text : undefined;
      while (p < messages.length) {
        const m = messages[p] as Run['messages'][number];
        if (m.role === 'assistant') {
          if (m.content === answer) break;
          items = [...items, { kind: 'message', text: m.content }];
        } else {
          if (questionsLeft() <= chatsAfter) break;
          // a turn Petals started itself, on a report (C), says so; the person didn't write it
          items = [
            ...items,
            m.content.startsWith(FROM_PETALS)
              ? { kind: 'note', text: m.content.slice(FROM_PETALS.length).trim() }
              : { kind: 'user', text: m.content },
          ];
        }
        p++;
      }
    }
    if (e.event === 'message' && messages[p]?.content === e.data.text) p++;
    items = fold(items, e);
  });
  for (const m of messages.slice(p)) {
    items = [...items, { kind: m.role === 'user' ? 'user' : 'message', text: m.content }];
  }
  return items;
}

export type Block = Exclude<Item, Step> | { kind: 'steps'; steps: Step[] };

/** Stages, progress and tool calls in a row become one collapsible block between the answers. */
export function blocksOf(items: Item[]): Block[] {
  const out: Block[] = [];
  for (const x of items) {
    if (x.kind === 'stage' || x.kind === 'progress' || x.kind === 'tool') {
      const last = out[out.length - 1];
      if (last?.kind === 'steps') last.steps.push(x);
      else out.push({ kind: 'steps', steps: [x] });
    } else out.push(x);
  }
  return out;
}

/**
 * Where a turn stands. Each stage is set only by the event that witnesses it: the browser saw the
 * question go, `run` says the server took it, the first `stage` or `tool_call` says the work began,
 * and `done` or `error` say how it ended. `lost` is the stream ending with none of those. Calls
 * aren't streamed and a chat can run 120 s, so this is how a person knows their words landed.
 */
export type TurnStage = 'idle' | 'sending' | 'accepted' | 'working' | 'done' | 'error' | 'lost';

/** The agent's events, and the two things only the browser can see. */
export type Witness = AgentEvent | { event: 'sent' } | { event: 'ended' };

export function witness(stage: TurnStage, w: Witness): TurnStage {
  switch (w.event) {
    case 'sent':
      return 'sending';
    case 'run':
      return 'accepted';
    case 'stage':
    case 'tool_call':
      return stage === 'accepted' ? 'working' : stage;
    case 'error':
      return 'error';
    case 'done':
      // the server ends every failed chat with `done`; that doesn't undo the failure
      return stage === 'error' ? 'error' : 'done';
    case 'ended':
      if (stage === 'sending') return 'error';
      return stage === 'accepted' || stage === 'working' ? 'lost' : stage;
    default:
      return stage;
  }
}

/** The stage of a stored run's last turn: its events, read the way a live chat reads them. */
export function turnOfRun(run: Pick<Run, 'status' | 'events'>): TurnStage {
  const stage = run.events.reduce<TurnStage>(witness, 'idle');
  // reopened by a follow-up, its `run` event not stored yet: the status is the witness
  return run.status === 'running' && (stage === 'idle' || stage === 'done') ? 'accepted' : stage;
}

/** The part of localStorage a backup needs. Injected, so nothing here touches a browser. */
export interface QuestionStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface QuestionBackup {
  keep(text: string): void;
  read(): string | null;
  clear(): void;
}

/**
 * A question waiting for the server to accept it, per conversation. Storage that is missing or
 * refuses (private mode, quota) only loses the backup, never the question being sent.
 */
export function questionBackup(store: QuestionStore | null, runId: string | null): QuestionBackup {
  const key = `petal.unaccepted.${runId ?? 'new'}`;
  const attempt = <T>(f: () => T, otherwise: T): T => {
    try {
      return f();
    } catch {
      return otherwise;
    }
  };
  return {
    keep: (text) => attempt(() => store?.setItem(key, text), undefined),
    read: () => attempt(() => store?.getItem(key) ?? null, null),
    clear: () => attempt(() => store?.removeItem(key), undefined),
  };
}

/** Words coming back to the box. Anything typed meanwhile stays; restoring twice is restoring once. */
export function joinQuestion(back: string, box: string): string {
  return !box.trim() || box === back ? back : `${back}\n${box}`;
}

/**
 * What the flower panel holds. `latest` follows the thread's newest flower; a new flower takes the
 * panel back from any other choice.
 */
export type Opened =
  | { kind: 'latest' }
  | { kind: 'turn'; index: number }
  | { kind: 'stored'; id: string }
  | { kind: 'shelf' };

/** The panel's extra reading, one at a time. */
export type PanelSection = 'reading' | 'quote' | null;

/** A stored flower's row sits before the first question about it, or at the end. Once each. */
function placeStored(items: Item[], stored: StoredItem): Item[] {
  if (items.some((x) => x.kind === 'stored' && x.id === stored.id)) return items;
  const at = items.findIndex((x) => x.kind === 'user' && readAbout(x.text).flower === stored.id);
  return at === -1 ? [...items, stored] : [...items.slice(0, at), stored, ...items.slice(at)];
}

/** The chat's state. What a person reads is projected from it in thread-view.ts. */
export interface ChatState {
  question: string;
  /** the box shows a question that was never accepted, so its backup follows the box */
  restored: boolean;
  /** the question the address holds (?q=), until the server accepts one */
  asked: string | null;
  items: Item[];
  runId: string | null;
  /** a stream or a read is open: the box can't send */
  busy: boolean;
  turn: TurnStage;
  /** the stage when the last question left: a refused question changes nothing about it */
  before: TurnStage;
  /** following the run again also ended without `done` */
  lostAgain: boolean;
  open: Opened;
  /** the selected petal of the open flower */
  petal: string | null;
  section: PanelSection;
}

export type ChatAction =
  | { type: 'typed'; text: string }
  | { type: 'restored'; text: string }
  | { type: 'sent'; text: string; startOver: boolean }
  | { type: 'event'; event: AgentEvent }
  /** never accepted; `text` is what goes back to the box (null when it has no words of its own) */
  | { type: 'refused'; text: string | null; message: string; code?: string }
  | { type: 'opening' }
  | { type: 'opened'; run: Pick<Run, 'status' | 'messages' | 'events'> }
  | { type: 'unreadable'; code: string; message: string }
  | { type: 'ended'; again: boolean }
  | { type: 'open'; open: Opened }
  | { type: 'stored-read'; stored: StoredItem }
  | { type: 'select'; petal: string | null }
  | { type: 'section'; section: PanelSection };

export function initialChat(o: {
  initialRun?: string;
  /** words the address brought: they wait in the box, and nothing is sent */
  question?: string;
  greeting?: string;
  open?: Opened;
  petal?: string | null;
}): ChatState {
  return {
    question: o.question ?? '',
    restored: false,
    asked: o.question ?? null,
    items: o.greeting ? [{ kind: 'message', text: o.greeting }] : [],
    runId: o.initialRun ?? null,
    busy: Boolean(o.initialRun),
    turn: 'idle',
    before: 'idle',
    lostAgain: false,
    open: o.open ?? { kind: 'latest' },
    petal: o.petal ?? null,
    section: null,
  };
}

export function chatReducer(s: ChatState, a: ChatAction): ChatState {
  switch (a.type) {
    case 'typed':
      return { ...s, question: a.text, restored: s.restored && a.text.trim() !== '' };
    case 'restored':
      return { ...s, question: joinQuestion(a.text, s.question), restored: true };
    case 'sent':
      return {
        ...s,
        question: '',
        restored: false,
        items: [...(a.startOver ? [] : s.items), { kind: 'user', text: a.text }],
        busy: true,
        turn: witness(s.turn, { event: 'sent' }),
        before: s.turn,
        lostAgain: false,
      };
    case 'event':
      return {
        ...s,
        items: fold(s.items, a.event),
        runId: a.event.event === 'run' ? a.event.data.run_id : s.runId,
        turn: witness(s.turn, a.event),
        // the server took a question: only a `run` answering one that left, not one being followed
        asked: a.event.event === 'run' && s.turn === 'sending' ? null : s.asked,
        // the newest flower opens as it is drawn, whatever was open
        ...(a.event.event === 'flower'
          ? { open: { kind: 'latest' } as const, petal: null, section: null }
          : {}),
      };
    case 'refused':
      return {
        ...s,
        question: a.text === null ? s.question : joinQuestion(a.text, s.question),
        restored: a.text !== null,
        items: [...s.items, { kind: 'error', code: a.code ?? 'client', message: a.message }],
        busy: false,
        turn: s.before === 'lost' ? 'lost' : witness(s.turn, { event: 'ended' }),
      };
    case 'opening':
      return { ...s, busy: true };
    case 'opened':
      return {
        ...s,
        // a stored flower may have been read while the run was on its way
        items: s.items
          .filter((x): x is StoredItem => x.kind === 'stored')
          .reduce(placeStored, threadFromRun(a.run)),
        turn: turnOfRun(a.run),
      };
    case 'unreadable': {
      // opening a link: this is all there is to show
      if (s.turn !== 'lost') {
        const row: Item = { kind: 'error', code: a.code, message: a.message };
        return { ...s, items: [row], busy: false, turn: 'error' };
      }
      // following a lost run again: what already arrived stays
      const gone = a.code === 'not_found';
      const message = gone
        ? 'The server no longer has this run, so it can’t be followed. What’s above is all that arrived.'
        : a.message;
      return {
        ...s,
        items: [...s.items, { kind: 'error', code: a.code, message }],
        busy: false,
        turn: gone ? 'error' : 'lost',
      };
    }
    case 'ended': {
      const turn = witness(s.turn, { event: 'ended' });
      return { ...s, busy: false, turn, lostAgain: a.again && turn === 'lost' };
    }
    case 'open':
      return { ...s, open: a.open, petal: null, section: null };
    case 'stored-read':
      return { ...s, items: placeStored(s.items, a.stored) };
    case 'select':
      return { ...s, petal: a.petal };
    case 'section':
      return { ...s, section: s.section === a.section ? null : a.section };
  }
}

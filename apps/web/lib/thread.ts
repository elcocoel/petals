// The conversation on /make as a list of items, folded from the agent's events (http-api.md, Agent
// chat), live or from a stored run. Pure, so a reload and a live chat read the same.
import type { AgentEvent, FlowerResult, ModelSignature, Run } from '@petal/core/types';

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
  | { kind: 'error'; code: string; message: string; hint?: string }
  | { kind: 'done'; done: Done; signature: ModelSignature | null };

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
      return [...items, { kind: 'tool', ...e.data }];
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
          items = [...items, { kind: 'user', text: m.content }];
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

// What the model remembers across the chats of one run (T166). A follow-up is a new chat on the same
// run, and the prose in run.messages is not enough: the model needs what it read from the tools, or
// it starts over. So the loop keeps its whole message list (the thread), the store saves it, and the
// next chat starts from it. Older tool results keep only their summary line, and near the window's
// end the oldest lose even that, with no model call, as an IDE does.
import type { AgentEvent, FlowerResult, ModelSignature, Spec } from '@petal/core/types';
import { COMPACT_AT_FRACTION, modelOf } from './catalogue.ts';
import type { LlmMessage } from './llm.ts';
import { draftLink, summarize } from './summary.ts';

/** Compaction goes down to this share of the window: it costs the cached prefix, so it should be rare. */
export const COMPACT_TO = 0.6;
/** Petal's own text measured 3.7 (16.5 KB, 4,430 tokens); a little under, so it starts early. */
const CHARS_PER_TOKEN = 3.5;
/**
 * PETAL_MODEL can name a model the catalogue doesn't list. This is the lowest window the research names
 * for a model with tools, so a thread on one is compacted too soon, not too late.
 */
const UNLISTED_WINDOW = 128_000;

export const windowOf = (model: string): number =>
  modelOf(model)?.context_window ?? UNLISTED_WINDOW;

/**
 * How long a thread can get in this window, with `reservedChars` going to the system and the tools. So
 * the whole call is measured, as `context_tokens` is, and it stops at the catalogue's
 * `compacts_at_tokens`, as near as a count from the text can say.
 */
export function compactionChars(windowTokens: number, reservedChars = 0): number {
  return Math.max(0, windowTokens * COMPACT_AT_FRACTION * CHARS_PER_TOKEN - reservedChars);
}

const sizeOf = (ms: LlmMessage[]) => ms.reduce((n, m) => n + JSON.stringify(m).length, 0);

/** Every tool call answered: a model API refuses a conversation with one left open. */
export function closeThread(messages: LlmMessage[]): LlmMessage[] {
  const out: LlmMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i] as LlmMessage;
    out.push(m);
    if (m.role !== 'assistant' || !m.tool_calls?.length) continue;
    const answered = new Set<string>();
    while (messages[i + 1]?.role === 'tool') {
      const t = messages[++i] as Extract<LlmMessage, { role: 'tool' }>;
      answered.add(t.tool_call_id);
      out.push(t);
    }
    for (const c of m.tool_calls) {
      if (answered.has(c.id)) continue;
      out.push({
        role: 'tool',
        tool_call_id: c.id,
        content: JSON.stringify({
          error: { code: 'internal', message: 'this call did not finish before the chat ended' },
        }),
      });
    }
  }
  return out;
}

/** The thread cut at each user message; anything before the first one stays with it. */
function exchanges(thread: LlmMessage[]): LlmMessage[][] {
  const parts: LlmMessage[][] = [];
  for (const m of thread) {
    if (m.role === 'user' || parts.length === 0) parts.push([m]);
    else parts[parts.length - 1]?.push(m);
  }
  return parts;
}

/** Only what was said: the question and the answers, without the tool calls and results. */
function proseOnly(part: LlmMessage[]): LlmMessage[] {
  return part.flatMap((m): LlmMessage[] => {
    if (m.role === 'tool') return [];
    if (m.role !== 'assistant') return [m];
    return m.content?.trim() ? [{ role: 'assistant', content: m.content }] : [];
  });
}

/**
 * Past `maxChars`, the oldest exchanges lose their tool detail, never their words, until the thread is
 * back down to COMPACT_TO; the last two always keep theirs. Under it, this same thread comes back.
 */
export function compactThread(thread: LlmMessage[], maxChars: number): LlmMessage[] {
  let size = sizeOf(thread);
  if (size <= maxChars) return thread;
  const enough = maxChars * (COMPACT_TO / COMPACT_AT_FRACTION);
  const parts = exchanges(thread);
  for (let i = 0; i < parts.length - 2 && size > enough; i++) {
    const short = proseOnly(parts[i] as LlmMessage[]);
    size -= sizeOf(parts[i] as LlmMessage[]) - sizeOf(short);
    parts[i] = short;
  }
  return parts.flat();
}

/**
 * What the run itself reads back, kept whole however old: the yes reads get_snapshot, propose_spec,
 * render_flower and the last find_target or look_up (approval.ts), and specsIn reads propose_spec.
 */
const READ_BACK = new Set([
  'get_snapshot',
  'propose_spec',
  'render_flower',
  'find_target',
  'look_up',
]);

const summaryOnly = (content: string) => {
  try {
    const o = JSON.parse(content) as unknown;
    return !!o && typeof o === 'object' && Object.keys(o).join() === 'summary';
  } catch {
    return false;
  }
};

/**
 * Before the last two exchanges, a tool result becomes its summary line, the one the person sees,
 * when that is shorter. In run 9c599a61 (10 Nov) tool results were 91% of the thread, and a window
 * of a million tokens never compacts, so each call sent all of them again. The last two exchanges
 * never change, so the prefix a cache holds moves once a chat. When nothing is old enough, this
 * same thread comes back.
 */
export function lightenThread(thread: LlmMessage[]): LlmMessage[] {
  const parts = exchanges(thread);
  if (parts.length <= 2) return thread;
  const names = new Map<string, string>();
  for (const m of thread) {
    if (m.role === 'assistant') for (const c of m.tool_calls ?? []) names.set(c.id, c.name);
  }
  let changed = false;
  const old = parts
    .slice(0, -2)
    .flat()
    .map((m): LlmMessage => {
      if (m.role !== 'tool' || summaryOnly(m.content)) return m;
      const name = names.get(m.tool_call_id) ?? '';
      if (READ_BACK.has(name)) return m;
      let out: unknown;
      try {
        out = JSON.parse(m.content);
      } catch {
        out = m.content;
      }
      const content = JSON.stringify({ summary: summarize(name, out) });
      if (content.length >= m.content.length) return m;
      changed = true;
      return { ...m, content };
    });
  return changed ? [...old, ...parts.slice(-2).flat()] : thread;
}

/** A flower drawn earlier in the run, and the signature that came with it. */
export interface EarlierFlower {
  flower: FlowerResult;
  signature: ModelSignature | null;
}

export function flowersOf(events: AgentEvent[]): EarlierFlower[] {
  const out: EarlierFlower[] = [];
  for (const e of events) {
    if (e.event === 'flower') out.push({ flower: e.data, signature: null });
    const last = out[out.length - 1];
    if (e.event === 'signature' && last) last.signature = e.data;
  }
  return out;
}

/** The specs propose_spec returned earlier, so the model can still name them by spec_sha256. */
export function specsIn(thread: LlmMessage[]): Map<string, Spec> {
  const specs = new Map<string, Spec>();
  for (const m of thread) {
    if (m.role !== 'tool') continue;
    try {
      const out = JSON.parse(m.content) as { spec?: Spec; spec_sha256?: string };
      if (out.spec && typeof out.spec_sha256 === 'string') specs.set(out.spec_sha256, out.spec);
    } catch {
      // a tool message that is not JSON names no spec
    }
  }
  return specs;
}

/** The part of the system message that says this is a follow-up. */
export function followUpNotes(flowers: EarlierFlower[]): string {
  const lines = [
    '## This is a follow-up',
    '',
    'The messages hold this conversation so far, with your earlier tool calls and their results. Read them first. Results from before your last answer keep only a one-line `summary`, and in a very long conversation the oldest lose even that: call the tool again for their detail rather than guess. The person means what was said before: "the largest one" or "the top ten" is about the flower or network you just discussed. If the answer is already there, answer from it without calling a tool, and do not go through the six steps again. Numbers still come only from tool results, earlier ones included. Answer in a sentence or two, and never repeat the mapping or a caveat you already gave. If you asked whether to draw something and the person said yes, go on and draw it: that is the next step, not a repeat.',
  ];
  if (flowers.length) {
    lines.push('', 'Flowers drawn so far, oldest first:');
    for (const { flower } of flowers) {
      const { network, snapshot } = flower.spec;
      lines.push(
        `- spec_sha256 ${flower.spec_sha256}, network ${network?.id}, snapshot sha256 ${snapshot?.sha256}, link ${draftLink(flower.spec_sha256)}`,
      );
    }
    lines.push(
      '',
      'To change one, go straight to `propose_spec` with its network, params and snapshot `sha256`, `variation_of` set to its spec_sha256, and only the choices that change (`choices.petals` is how many participants are drawn). Then `validate_spec` with a fresh interpretation, and `render_flower`. To show one again unchanged, give its link.',
    );
  }
  return lines.join('\n');
}

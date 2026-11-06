// What the model remembers across the chats of one run (T166). A follow-up is a new chat on the same
// run, and the prose in run.messages is not enough: the model needs what it read from the tools, or
// it starts over. So the loop keeps its whole message list (the thread), the store saves it, and the
// next chat starts from it. A thread can use the model's window: near full it is compacted, with no
// model call, as an IDE does. What guards spending is the dollar caps (Budget), not the thread's size.
import type { AgentEvent, FlowerResult, ModelSignature, Spec } from '@petal/core/types';
import type { LlmMessage } from './llm.ts';
import { draftLink } from './summary.ts';

/** Compaction starts at this share of the model's window. */
export const COMPACT_AT = 0.8;
/** And goes down to this one: each compaction costs the cached prefix, so it should be a rare event. */
export const COMPACT_TO = 0.6;
/** Petal's own text measured 3.7 (16.5 KB, 4,430 tokens); a little under, so it starts early. */
const CHARS_PER_TOKEN = 3.5;

/** How long a thread can get in this window, with `reservedChars` going to the system and the tools. */
export function compactionChars(windowTokens: number, reservedChars = 0): number {
  return Math.max(0, windowTokens * COMPACT_AT * CHARS_PER_TOKEN - reservedChars);
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
  const enough = maxChars * (COMPACT_TO / COMPACT_AT);
  const parts = exchanges(thread);
  for (let i = 0; i < parts.length - 2 && size > enough; i++) {
    const short = proseOnly(parts[i] as LlmMessage[]);
    size -= sizeOf(parts[i] as LlmMessage[]) - sizeOf(short);
    parts[i] = short;
  }
  return parts.flat();
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
    'The messages hold this conversation so far, with your earlier tool calls and their results. Read them first. In a very long conversation the oldest may have lost theirs: read those again rather than guess. The person means what was said before: "the largest one" or "the top ten" is about the flower or network you just discussed. If the answer is already there, answer from it without calling a tool, and do not go through the six steps again. Numbers still come only from tool results, earlier ones included. Answer in a sentence or two, and never repeat the mapping or a caveat you already gave. If you asked whether to draw something and the person said yes, go on and draw it: that is the next step, not a repeat.',
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

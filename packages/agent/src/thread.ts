// What the model remembers across the chats of one run (T166). A follow-up is a new chat on the same
// run, and the prose in run.messages is not enough: the model needs what it read from the tools, or
// it starts over. So the loop keeps its whole message list (the thread), the store saves it, and the
// next chat starts from it. Every byte is paid for again on every later model call, so it is kept to
// a size where a new flower still fits inside the chat's budget.
import type { AgentEvent, FlowerResult, ModelSignature, Spec } from '@petal/core/types';
import type { LlmMessage } from './llm.ts';
import { draftLink } from './summary.ts';

/**
 * About 12k tokens. A flower is 5 to 7 model calls, each with about 10k of its own (system, tools,
 * this chat), so a thread this long keeps it under the $0.05 chat budget at $0.30 per million.
 */
export const THREAD_MAX_CHARS = 40_000;

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

/** Over the limit, the oldest exchanges lose their tool detail; the last two always keep theirs. */
export function trimThread(thread: LlmMessage[], max = THREAD_MAX_CHARS): LlmMessage[] {
  const parts = exchanges(thread);
  let size = sizeOf(thread);
  for (let i = 0; i < parts.length - 2 && size > max; i++) {
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
    'The messages hold this conversation so far, with your earlier tool calls and their results where they were kept. Read them first. The person means what was said before: "the largest one" or "the top ten" is about the flower or network you just discussed. If the answer is already there, answer from it without calling a tool, and do not go through the six steps again. Numbers still come only from tool results, earlier ones included. If you asked whether to draw something and the person said yes, go on and draw it: that is the next step, not a repeat.',
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

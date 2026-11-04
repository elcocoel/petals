// recordedClient: replays a transcript instead of calling a model (T020). Tests and judges with
// no NEAR_AI_API_KEY use it; the server says so in done.model = "recorded".
//
// Transcript format (fixtures/transcripts/*.json, petal "transcript/v1"): `turns[i]` is the
// model's i-th reply in the conversation. A reply is picked by counting the assistant messages
// already in the request, so the client keeps no state and many runs can share one.
// Inside a reply:
//   { "$from": "call_1.sha256" }     the value at that path in the result of tool call call_1
//   "text {{call_3.nakamoto.count}}" the same, put into text
// Tool results are read from the request's `tool` messages (JSON text), as a model would see them.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { LlmClient, LlmCompletion, LlmMessage, LlmToolCall } from './llm.ts';

export interface TranscriptTurn {
  content?: string | null;
  tool_calls?: { id: string; name: string; arguments: unknown }[];
}

export interface Transcript {
  petal: 'transcript/v1';
  kind: 'hand' | 'recorded';
  title: string;
  /** the user message the run answers */
  question: string;
  model: string;
  note?: string;
  turns: TranscriptTurn[];
}

/** The hand-made skeleton run (quickstart step 2). */
export const SKELETON_TRANSCRIPT: string = fileURLToPath(
  new URL('../../../fixtures/transcripts/skeleton.hand.json', import.meta.url),
);

export function loadTranscript(file: string): Transcript {
  const t = JSON.parse(readFileSync(file, 'utf8')) as Transcript;
  if (t.petal !== 'transcript/v1' || !Array.isArray(t.turns) || typeof t.question !== 'string') {
    throw new Error(`recordedClient: ${file} is not a transcript/v1 file`);
  }
  return t;
}

function lookup(ref: string, results: Map<string, unknown>, turn: number): unknown {
  const [id = '', ...path] = ref.split('.');
  if (!results.has(id)) {
    throw new Error(
      `recordedClient: reply ${turn + 1} needs the result of ${id}, which is not in the conversation`,
    );
  }
  let v: unknown = results.get(id);
  for (const p of path) {
    if (v === null || typeof v !== 'object' || !(p in (v as object))) {
      throw new Error(`recordedClient: reply ${turn + 1}: ${ref} not found in the result of ${id}`);
    }
    v = (v as Record<string, unknown>)[p];
  }
  return v;
}

function resolve(x: unknown, results: Map<string, unknown>, turn: number): unknown {
  if (typeof x === 'string') {
    return x.replace(/\{\{([^}]+)\}\}/g, (_, ref: string) => {
      const v = lookup(ref.trim(), results, turn);
      return typeof v === 'string' ? v : JSON.stringify(v);
    });
  }
  if (Array.isArray(x)) return x.map((v) => resolve(v, results, turn));
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 1 && typeof o.$from === 'string') return lookup(o.$from, results, turn);
    return Object.fromEntries(keys.map((k) => [k, resolve(o[k], results, turn)]));
  }
  return x;
}

function toolResults(messages: LlmMessage[]): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const m of messages) {
    if (m.role !== 'tool') continue;
    try {
      out.set(m.tool_call_id, JSON.parse(m.content));
    } catch {
      out.set(m.tool_call_id, m.content);
    }
  }
  return out;
}

export function recordedClient(transcriptFile: string): LlmClient {
  const t = loadTranscript(transcriptFile);
  return {
    kind: 'recorded',
    model: 'recorded',
    async complete(req): Promise<LlmCompletion> {
      const turn = req.messages.filter((m) => m.role === 'assistant').length;
      const step = t.turns[turn];
      if (!step) {
        throw new Error(
          `recordedClient: the transcript has ${t.turns.length} replies; reply ${turn + 1} was asked for`,
        );
      }
      const results = toolResults(req.messages);
      const tool_calls: LlmToolCall[] = (step.tool_calls ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        arguments: JSON.stringify(resolve(c.arguments, results, turn)),
      }));
      const content =
        step.content == null ? null : (resolve(step.content, results, turn) as string);
      return {
        model: 'recorded',
        completion_id: `recorded-${turn + 1}`,
        message: tool_calls.length
          ? { role: 'assistant', content, tool_calls }
          : { role: 'assistant', content },
        usage: { in: 0, out: 0 },
        cost_usd: 0,
        fallback_used: false,
        signature: null,
      };
    },
  };
}

// The model client the agent loop talks to (W5). Shaped after OpenAI Chat Completions, which
// NEAR AI Cloud speaks: non-streamed calls, so each completion can carry a TEE signature.
import type { ModelSignature } from '@petal/core/types';

export interface LlmToolCall {
  id: string;
  name: string;
  /** JSON text, as the model returns it */
  arguments: string;
}

export type LlmMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: LlmToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface LlmToolDef {
  name: string;
  description: string;
  /** JSON Schema of the tool's input */
  parameters: Record<string, unknown>;
}

export interface LlmRequest {
  messages: LlmMessage[];
  tools?: LlmToolDef[];
}

export interface LlmCompletion {
  /** canonical model id, or "recorded" */
  model: string;
  completion_id: string;
  message: { role: 'assistant'; content: string | null; tool_calls?: LlmToolCall[] };
  usage: { in: number; out: number };
  cost_usd: number;
  fallback_used: boolean;
  /** provider_tee when available; null for recorded runs ("recorded run, no signature") */
  signature: ModelSignature | null;
}

export interface LlmClient {
  readonly kind: 'near-ai-cloud' | 'recorded';
  readonly model: string;
  /** `signal` is Stop: a client that talks to a model passes it to the model's fetch. */
  complete(req: LlmRequest, o?: { signal?: AbortSignal }): Promise<LlmCompletion>;
}

/** Money set aside for one model call, until it is settled. */
export interface SpendHold {
  /** the UTC day it counts against */
  day: string;
  usd: number;
}

/**
 * Spend across chats, shared by every run on this server. Any of these may reject when the store is
 * down, and a caller must then stop spending: the ledger is the cap (SYS-004).
 */
export interface BudgetLedger {
  /** spent today, plus what is held for calls in flight */
  spentToday(): Promise<number>;
  add(usd: number): Promise<void>;
  /** holds up to `usd` under today's cap, atomically; null when nothing is left */
  reserve(usd: number, capUsd: number): Promise<SpendHold | null>;
  /** swaps a hold for what the call really cost */
  settle(hold: SpendHold, actualUsd: number): Promise<void>;
  /** why `reserve` last answered null, when the reason isn't today's cap (an invite's end) */
  refusal?(): { message: string; hint?: string } | null;
}

/** Limits per chat and per day (http-api.md: 8 tool rounds, 300 s, $0.05; daily cap $3). */
export interface Budget {
  toolRounds: number;
  wallSeconds: number;
  usdPerChat: number;
  usdPerDay: number;
  ledger?: BudgetLedger;
}

export const DEFAULT_BUDGET: Budget = {
  toolRounds: 8,
  wallSeconds: 300,
  usdPerChat: 0.05,
  usdPerDay: 3,
};

/** PETAL_RUN_MAX_S, else the default. The limit is what a person waits for; the dollars stay capped. */
export function runMaxSeconds(env: Record<string, string | undefined> = process.env): number {
  const s = Number(env.PETAL_RUN_MAX_S);
  return Number.isFinite(s) && s > 0 ? s : DEFAULT_BUDGET.wallSeconds;
}

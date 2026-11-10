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
  /** `cached`: the part of `in` NEAR AI read from its cache, billed at the cache-read price */
  usage: { in: number; out: number; cached?: number };
  cost_usd: number;
  /** additive (T300): the answer didn't say what it used, so it counts at the call's full hold */
  cost_unknown?: boolean;
  /** additive (10 Nov, usage/v1): NEAR AI's id for the call, which its billing knows */
  inference_id?: string;
  /** additive (10 Nov, usage/v1): dollars per million tokens it was counted at */
  list_price?: { in: number; cached: number; out: number };
  /** additive (10 Nov, usage/v1): of cost_usd, what attempts that failed before this answer were counted at */
  failed_usd?: number;
  fallback_used: boolean;
  /** provider_tee when available; null for recorded runs ("recorded run, no signature") */
  signature: ModelSignature | null;
}

/** What one call can ask of a client, besides the words. */
export interface LlmCallOptions {
  /** Stop: a client that talks to a model passes it to the model's fetch. */
  signal?: AbortSignal;
  /** additive (T370): the conversation's pick, checked against the catalogue; default the client's own */
  model?: string;
  /** additive (T370): the pick's effort. Null: the model's own. Default the catalogue's for the model */
  effort?: string | null;
}

export interface LlmClient {
  readonly kind: 'near-ai-cloud' | 'recorded';
  readonly model: string;
  /** The model asked may not be the one that answers: `LlmCompletion.model` says which did. */
  complete(req: LlmRequest, o?: LlmCallOptions): Promise<LlmCompletion>;
  /**
   * additive (10 Nov, usage/v1): what the provider itself billed for each call, in dollars, by inference
   * id. A call it doesn't know yet is left out.
   */
  billed?(ids: readonly string[]): Promise<Map<string, number>>;
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
  /** additive (10 Nov, usage/v1): the account each call is charged to (person:… or invite:…); none: the sponsor's day */
  account?: string;
  /** spent today, plus what is held for calls in flight */
  spentToday(): Promise<number>;
  add(usd: number): Promise<void>;
  /** holds up to `usd` under today's cap, atomically; null when nothing is left */
  reserve(usd: number, capUsd: number): Promise<SpendHold | null>;
  /** swaps a hold for what the call cost; the full hold when that can't be known */
  settle(hold: SpendHold, actualUsd: number): Promise<void>;
  /** why `reserve` last answered null, when the reason isn't today's cap (an invite's end) */
  refusal?(): {
    message: string;
    hint?: string;
    code?: 'budget_exhausted' | 'payment_required';
  } | null;
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

/**
 * Where a chat stops when a person spends their own credit. A flower costs more the later it comes in a
 * conversation, about 2¢ for the first and 15¢ for the tenth, so the invite's 5¢ would cut it off.
 */
export const PERSON_USD_PER_CHAT = 0.5;

/** PETAL_PERSON_USD_PER_CHAT, else the default. A typo mustn't lift the cap, so it means the default. */
export function personUsdPerChat(env: Record<string, string | undefined> = process.env): number {
  const usd = Number(env.PETAL_PERSON_USD_PER_CHAT);
  return Number.isFinite(usd) && usd > 0 ? usd : PERSON_USD_PER_CHAT;
}

/** PETAL_RUN_MAX_S, else the default. The limit is what a person waits for; the dollars stay capped. */
export function runMaxSeconds(env: Record<string, string | undefined> = process.env): number {
  const s = Number(env.PETAL_RUN_MAX_S);
  return Number.isFinite(s) && s > 0 ? s : DEFAULT_BUDGET.wallSeconds;
}

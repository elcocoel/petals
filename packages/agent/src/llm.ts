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
  complete(req: LlmRequest): Promise<LlmCompletion>;
}

/** Limits per chat and per day (http-api.md: 8 tool rounds, 120 s, $0.05; daily cap $3). */
export interface Budget {
  toolRounds: number;
  wallSeconds: number;
  usdPerChat: number;
  usdPerDay: number;
  /** spend already used today, across chats; shared by every run on this server */
  ledger?: { spentToday(): Promise<number>; add(usd: number): Promise<void> };
}

export const DEFAULT_BUDGET: Budget = {
  toolRounds: 8,
  wallSeconds: 120,
  usdPerChat: 0.05,
  usdPerDay: 3,
};

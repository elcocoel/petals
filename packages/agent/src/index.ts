// biome-ignore-all lint/correctness/noUnusedFunctionParameters: stub signatures (T016); delete this line once built
// @petal/agent (W5): Petal's own agent on NEAR AI Cloud. Signatures: contracts/packages.md.
// The chat route lives here, not in @petal/tools: the agent imports the tools (no cycle).
import { notImplemented } from '@petal/core';
import type { AgentEvent, ChatInput, ChatMessage, Entry, Run, Spec } from '@petal/core/types';
import type { Config, ToolContext } from '@petal/tools';
import type { Hono } from 'hono';
import type { Budget, LlmClient } from './llm.ts';

export type * from './llm.ts';
export { DEFAULT_BUDGET } from './llm.ts';
export {
  loadTranscript,
  recordedClient,
  SKELETON_TRANSCRIPT,
  type Transcript,
  type TranscriptTurn,
} from './recorded.ts';

/** The agent loop: events in the order of http-api.md (run first, done last). */
export function runAgent(
  input: { messages: ChatMessage[]; draft?: { spec?: Spec; entry?: Partial<Entry> } },
  deps: { tools: ToolContext; llm: LlmClient; budget: Budget },
): AsyncIterable<AgentEvent> {
  return notImplemented('runAgent');
}

export function nearAiClient(cfg: {
  apiKeyEnv: 'NEAR_AI_API_KEY';
  model: string;
  fallbacks: string[];
}): LlmClient {
  return notImplemented('nearAiClient');
}

/** Shared source with skill/petal/SKILL.md. Placeholder until W5 writes it. */
export const SYSTEM_PROMPT: string = 'not_implemented: SYSTEM_PROMPT (W5)';

/** Runs you can leave and come back to (F4). */
export interface RunStore {
  /** returns the run_id */
  create(input: ChatInput): Promise<string>;
  append(runId: string, e: AgentEvent): Promise<void>;
  /** status, events, flower, messages */
  get(runId: string): Promise<Run | null>;
}

/** .petal/runs/ locally. */
export function fileRunStore(dir: string): RunStore {
  return notImplemented('fileRunStore');
}

/** /api/v1/agent/chat, /api/v1/agent/runs/:id, /api/v1/attestations/:sha256 */
export function agentRoutes(deps: {
  tools: ToolContext;
  llm: LlmClient;
  budget: Budget;
  runs: RunStore;
}): Hono {
  return notImplemented('agentRoutes');
}

/** httpApp(ctx) + agentRoutes(...): what the web app and `pnpm api` mount. */
export function petalApp(cfg: Config): Hono {
  return notImplemented('petalApp');
}

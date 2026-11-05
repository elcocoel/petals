// @petal/agent (W5): Petal's own agent on NEAR AI Cloud. Signatures: contracts/packages.md.
// The chat route lives here, not in @petal/tools: the agent imports the tools (no cycle).
// Each export below has exactly its contract signature; the files behind them take more options
// (a fake registry, a fake transport, a run id) for the routes and the tests.
import type { AgentEvent, ChatMessage, Entry, Spec } from '@petal/core/types';
import type { Config, ToolContext } from '@petal/tools';
import type { Hono } from 'hono';
import { buildPetalApp } from './app.ts';
import type { Budget, LlmClient } from './llm.ts';
import { createNearAiClient } from './near-ai.ts';
import { createAgentRoutes } from './routes.ts';
import { startRun } from './run.ts';
import type { RunStore } from './runs.ts';

/** The daily spend ledger; fileLedger is for scripts that run the agent outside the server (T060). */
export { fileLedger, storeLedger } from './budget.ts';
export type * from './llm.ts';
export { DEFAULT_BUDGET } from './llm.ts';
/** nearAiClient with its options (attestations folder, warnings); same scripts. */
export {
  chosenModel,
  createNearAiClient,
  DEFAULT_MODEL,
  FALLBACK_MODELS,
  type NearAiOptions,
} from './near-ai.ts';
export { SYSTEM_PROMPT } from './prompt.ts';
export {
  HAND_TRANSCRIPT,
  loadTranscript,
  RECORDED_ATTESTATIONS,
  recordedClient,
  SKELETON_TRANSCRIPT,
  type Transcript,
  type TranscriptTurn,
} from './recorded.ts';
/** Runs you can leave and come back to (F4). */
export {
  fileRunStore,
  importRunFiles,
  type RunEventAt,
  type RunStore,
  type RunSummary,
  sqliteRunStore,
} from './runs.ts';

/** The agent loop: events in the order of http-api.md (run first, done last). */
export function runAgent(
  input: { messages: ChatMessage[]; draft?: { spec?: Spec; entry?: Partial<Entry> } },
  deps: { tools: ToolContext; llm: LlmClient; budget: Budget },
): AsyncIterable<AgentEvent> {
  return startRun(input, deps);
}

/** NEAR AI Cloud, non-streamed, signed (research R10). The key is read from process.env. */
export function nearAiClient(cfg: {
  apiKeyEnv: 'NEAR_AI_API_KEY';
  model: string;
  fallbacks: string[];
}): LlmClient {
  return createNearAiClient(cfg);
}

/** /api/v1/agent/chat, /api/v1/agent/runs/:id, /api/v1/attestations/:sha256 */
export function agentRoutes(deps: {
  tools: ToolContext;
  llm: LlmClient;
  budget: Budget;
  runs: RunStore;
}): Hono {
  return createAgentRoutes(deps);
}

/** httpApp(ctx) + agentRoutes(...): what the web app and `pnpm api` mount. */
export function petalApp(cfg: Config): Hono {
  return buildPetalApp(cfg);
}

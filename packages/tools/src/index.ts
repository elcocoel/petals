// @petal/tools (W4): one registry, thin doors (HTTP, MCP, CLI in process). Tools: contracts/tools.md.
// Every output carries tools_version; errors are returned as ToolError, never thrown across a door.

export { AGENT_KEY, AGENT_NAME_MAX, agentKeyHash, ownerOfAgentKey } from './agent-key.ts';
export {
  BRAIN_INDEX_VERSION,
  type BrainEntry,
  type BrainIndex,
  brainAt,
  brainProblems,
  buildBrainIndex,
  headerOf,
} from './brain.ts';
export { configFromEnv, createContext } from './context.ts';
export type { PetalTool, ToolAnnotations } from './define.ts';
export { TOOL_ERROR_SCHEMA } from './define.ts';
export { nonceStore, privateStore, specBody } from './drafts.ts';
export { HTTP_STATUS, isToolError } from './errors.ts';
export { freshGate, withRunSignal } from './fresh.ts';
export { httpApp } from './http/app.ts';
export type { SessionGate } from './http/explorations.ts';
export { clientAddress, isLocalSite, remember } from './http/rate-limit.ts';
export { BODY_MAX_BYTES, bodyCap } from './http/reply.ts';
export {
  DATA_FULL,
  DEFAULT_LIMITS,
  type Limits,
  limitsOf,
  overDataBudget,
} from './limits.ts';
export { type McpOptions, mcpServer } from './mcp/server.ts';
export { serveStdio } from './mcp/stdio.ts';
export type { PublicPage } from './public-fetch.ts';
export { callTool, describeTool, findTool, registry } from './registry.ts';
export { makeLink, runExplorationOf, saveRunStep, shapeAt } from './tools/explorations.ts';
export { makeReadPage } from './tools/read-page.ts';
export type { Caller, Config, JSONSchema, Tool, ToolContext } from './types.ts';

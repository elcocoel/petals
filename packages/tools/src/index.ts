// @petal/tools (W4): one registry, thin doors (HTTP, MCP, CLI in process). Tools: contracts/tools.md.
// Every output carries tools_version; errors are returned as ToolError, never thrown across a door.
export { configFromEnv, createContext } from './context.ts';
export type { PetalTool, ToolAnnotations } from './define.ts';
export { TOOL_ERROR_SCHEMA } from './define.ts';
export { nonceStore, privateStore } from './drafts.ts';
export { HTTP_STATUS, isToolError } from './errors.ts';
export { httpApp } from './http/app.ts';
export { mcpServer } from './mcp/server.ts';
export { serveStdio } from './mcp/stdio.ts';
export { callTool, describeTool, findTool, registry } from './registry.ts';
export type { Config, JSONSchema, Tool, ToolContext } from './types.ts';

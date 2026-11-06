// The one tool registry (tools.md, Phase A). Every door lists these names and schemas and calls
// `run` as is: HTTP (httpApp), MCP (mcpServer, serveStdio), the CLI and Petal's agent in process.
// Phase B adds find_documents, get_labels, compare_figures, prepare_correction, submit_correction.
import type { ToolError } from '@petal/core/types';
import { type PetalTool, versioned } from './define.ts';
import { toolError } from './errors.ts';
import {
  addNote,
  getExploration,
  listExplorations,
  saveStep,
  startExploration,
} from './tools/explorations.ts';
import { computeFiguresTool } from './tools/figures.ts';
import { findTarget } from './tools/find.ts';
import { getFlower, listFlowers } from './tools/flowers.ts';
import { getNetwork, listNetworks } from './tools/networks.ts';
import { preparePublish, publishFlower } from './tools/publish.ts';
import { quotePayment } from './tools/quote.ts';
import { readChain } from './tools/read-chain.ts';
import { readPage } from './tools/read-page.ts';
import {
  accountGroupsTool,
  powerPathTool,
  relatedGroupsTool,
  relationsOverviewTool,
  sharedAccountsTool,
} from './tools/relations.ts';
import { renderFlowerTool } from './tools/render.ts';
import { search } from './tools/search.ts';
import { describeSnapshot, getSnapshotTool } from './tools/snapshots.ts';
import { proposeSpec, validateSpecTool } from './tools/specs.ts';
import type { Tool, ToolContext } from './types.ts';

// biome-ignore lint/suspicious/noExplicitAny: a heterogeneous registry (packages.md)
export const registry: Tool<any, any>[] = [
  listNetworks,
  getNetwork,
  getSnapshotTool,
  describeSnapshot,
  computeFiguresTool,
  proposeSpec,
  validateSpecTool,
  renderFlowerTool,
  listFlowers,
  getFlower,
  preparePublish,
  publishFlower,
  quotePayment,
  findTarget,
  readChain,
  readPage,
  search,
  accountGroupsTool,
  sharedAccountsTool,
  relatedGroupsTool,
  relationsOverviewTool,
  powerPathTool,
  listExplorations,
  getExploration,
  startExploration,
  saveStep,
  addNote,
];

/** Title, description and hints, for doors that list them (MCP, the agent's tool list). */
export function describeTool(tool: Tool<unknown, unknown>): {
  title: string;
  description: string;
  annotations: PetalTool<unknown, object>['annotations'];
} {
  const t = tool as Partial<PetalTool<unknown, object>>;
  const description =
    t.description ?? (typeof tool.input.description === 'string' ? tool.input.description : '');
  return { title: t.title ?? tool.name, description, annotations: t.annotations ?? {} };
}

export function findTool(name: string): Tool<unknown, unknown> | undefined {
  return registry.find((t) => t.name === name);
}

/** Run a tool by name; an unknown name is a bad_input, never a throw. */
export async function callTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<unknown | ToolError> {
  const tool = findTool(name);
  if (!tool) {
    const hint = `Tools: ${registry.map((t) => t.name).join(', ')}.`;
    return versioned(toolError('bad_input', `No tool "${name}".`, hint));
  }
  return tool.run(input, ctx);
}

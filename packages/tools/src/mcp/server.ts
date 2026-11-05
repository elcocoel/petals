// The MCP door (T051): the registry's names and JSON Schemas, served with
// @modelcontextprotocol/server v2. Raw JSON Schema goes in through fromJsonSchema(). Inputs are
// checked once, by the registry, so a bad input gets the same bad_input on every door; the MCP
// layer passes arguments through. Progress goes out as notifications/progress.
import {
  createMcpHandler,
  fromJsonSchema,
  type JsonSchemaType,
  type jsonSchemaValidator,
  type McpHttpHandler,
  McpServer,
} from '@modelcontextprotocol/server';
import { TOOLS_VERSION } from '@petal/core';
import type { ProgressEvent } from '@petal/core/types';
import { isToolError } from '../errors.ts';
import { describeTool, registry } from '../registry.ts';
import type { ToolContext } from '../types.ts';

/** Every argument is accepted here; the registry validates against the same schema. */
const passThrough: jsonSchemaValidator = {
  getValidator: () => (input: unknown) => ({
    valid: true,
    data: input as never,
    errorMessage: undefined,
  }),
};

export const SERVER_INFO = { name: 'petal', title: 'Petal', version: TOOLS_VERSION };

// What an agent learns just by connecting. Kept short, because clients may cut it off; the same
// rules as the shared block in prompt.md, so every door lands in the same universe.
const INSTRUCTIONS =
  'Petal draws who holds power in a network as a flower. Talk first: not every message asks for a ' +
  'flower, so answer briefly and offer what is already mapped (list_flowers). When someone names a ' +
  'network, DAO, token or address, call find_target and follow its next. Ask a plain yes or no ' +
  'before a new read or a drawing. After a yes, finish in one go: get_snapshot (say whether it was ' +
  'reused, and its date), describe_snapshot, compute_figures (quote only these numbers), ' +
  'propose_spec with the fewest choices, validate_spec with your interpretation, then ' +
  'render_flower. The flower is the answer: always hand back its view_url as a link, with the ' +
  'legend, your interpretation and what the data cannot tell. A table is not a flower. To publish: ' +
  'prepare_publish, then give the person sign_url; never call publish_flower yourself. Never ask ' +
  'for a key or a seed phrase.';

export function progressLine(e: ProgressEvent): string {
  const n = e.done !== undefined && e.total !== undefined ? ` (${e.done}/${e.total})` : '';
  return `${e.stage}: ${e.message}${n}`;
}

export function mcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer(SERVER_INFO, {
    capabilities: { tools: {} },
    instructions: INSTRUCTIONS,
  });
  for (const tool of registry) {
    const { title, description, annotations } = describeTool(tool);
    server.registerTool(
      tool.name,
      {
        title,
        description,
        inputSchema: fromJsonSchema(tool.input as JsonSchemaType, passThrough),
        outputSchema: fromJsonSchema(tool.output as JsonSchemaType, passThrough),
        annotations: { title, ...annotations },
      },
      async (args, extra) => {
        const token = extra.mcpReq._meta?.progressToken;
        let runCtx = ctx;
        if (token !== undefined) {
          let n = 0;
          runCtx = {
            ...ctx,
            onProgress: (e) => {
              ctx.onProgress?.(e);
              n += 1;
              extra.mcpReq
                .notify({
                  method: 'notifications/progress',
                  // progress must only grow, so it counts events; done/total go in the message
                  params: { progressToken: token, progress: n, message: progressLine(e) },
                })
                .catch(() => {});
            },
          };
        }
        const out = await tool.run(args, runCtx);
        const text = JSON.stringify(out);
        return isToolError(out)
          ? { content: [{ type: 'text', text }], structuredContent: out, isError: true }
          : {
              content: [{ type: 'text', text }],
              structuredContent: out as Record<string, unknown>,
            };
      },
    );
  }
  return server;
}

/** Stateless Streamable HTTP for /mcp: a fresh server per request, 2025-era clients too. */
export function mcpHttpHandler(ctx: ToolContext): McpHttpHandler {
  return createMcpHandler(() => mcpServer(ctx));
}

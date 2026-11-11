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
import { brainOf } from '../tools/brain.ts';
import { openPageOn } from '../tools/explorations.ts';
import type { Tool, ToolContext } from '../types.ts';

/** Every argument is accepted here; the registry validates against the same schema. */
const passThrough: jsonSchemaValidator = {
  getValidator: () => (input: unknown) => ({
    valid: true,
    data: input as never,
    errorMessage: undefined,
  }),
};

export const SERVER_INFO = { name: 'petal', title: 'Petals', version: TOOLS_VERSION };

// What an agent learns just by connecting. Kept short, because clients may cut it off; the same
// rules as the shared block in prompt.md, so every door lands in the same universe.
const INSTRUCTIONS =
  'Petals draws who holds power in a network as a flower. Talk first: not every message asks for a ' +
  'flower, so answer briefly and offer what is already mapped (list_flowers). When someone names a ' +
  'network, DAO, token or address, call find_target and follow its next. Ask a plain yes or no ' +
  'before a new read or a drawing. After a yes, finish in one go: get_snapshot (say whether it was ' +
  'reused, and its date), describe_snapshot, compute_figures (quote only these numbers), ' +
  'propose_spec with the fewest choices, validate_spec with your interpretation, then ' +
  'render_flower. The flower is the answer: always hand back a link to it, short_url if given and ' +
  'otherwise view_url, with the legend, your interpretation and what the data cannot tell. A table ' +
  'is not a flower. To publish: ' +
  'prepare_publish, then give the person sign_url; never call publish_flower yourself. When the ' +
  'person gives you their agent key (petal_agent_…) and asks you to take their open jobs: take_job ' +
  'with agent_key and as, your app as a short name such as claude-app or chatgpt; do each job in its ' +
  'link, passing its view to each render_flower; save who or what you find behind addresses with add_annotation (with as), then report_job with its ids, and take_job again until job is null. If a call says the job was stopped or handed to another worker, drop it, report nothing, and take the next. Never ask for a key or a seed phrase.';

// Only where the page it hands over opens. Short, because an agent on MCP alone reads nothing else.
const FOLLOW =
  ' Before your first tool call on a question, call start_exploration with their question and client ' +
  'set to the app you run in. Give them open_url, or open it for them if you can: it shows this work ' +
  'as it happens. Pass link.url as exploration, not the exp_ id: save_step after each render_flower, ' +
  "and before you finish each answer, add_note with text: the person's words, then your reply word " +
  'for word. With the first answer, and again when the subject changes, add_note also takes title, ' +
  "the conversation's name in their list: 3 to 6 plain words, the subject, not the request.";

/** What a request says its client is, on a protocol that says so on each request (2026-07-28 on). */
function clientOf(meta: unknown): string | undefined {
  const info = (meta as Record<string, { title?: unknown; name?: unknown }> | undefined)?.[
    'io.modelcontextprotocol/clientInfo'
  ];
  const name = [info?.title, info?.name].find((v) => typeof v === 'string' && v.trim());
  return (name as string | undefined)?.trim().slice(0, 80);
}

export function progressLine(e: ProgressEvent): string {
  const n = e.done !== undefined && e.total !== undefined ? ` (${e.done}/${e.total})` : '';
  return `${e.stage}: ${e.message}${n}`;
}

/** Another set of tools, or more to say on connecting: petal as one file brings both (apps/cli). */
export interface McpOptions {
  // biome-ignore lint/suspicious/noExplicitAny: a heterogeneous registry (packages.md)
  tools?: readonly Tool<any, any>[];
  /** said after the usual instructions */
  instructions?: string;
}

/** What the brain adds: where to learn how, and which version this is (step 4). Nothing without a brain/. */
function brainLine(ctx: ToolContext): string {
  try {
    const { version } = brainOf(ctx);
    return ` Petals' brain (${version}) holds how to map anything and how each app connects: read brain_file with id doctrine first, then brain_route with your app and what you're doing.`;
  } catch {
    return '';
  }
}

export function mcpServer(ctx: ToolContext, opts: McpOptions = {}): McpServer {
  const said = `${openPageOn(ctx) ? `${INSTRUCTIONS}${FOLLOW}` : INSTRUCTIONS}${brainLine(ctx)}`;
  const server = new McpServer(SERVER_INFO, {
    capabilities: { tools: {} },
    instructions: opts.instructions ? `${said} ${opts.instructions}` : said,
  });
  for (const tool of opts.tools ?? registry) {
    // A public site doesn't offer what it would refuse: the person's own agent runs those locally.
    if (ctx.config.public && (tool as { onTheirMachine?: boolean }).onTheirMachine) continue;
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
        // no session on this door yet, so a caller gets at an exploration through a link
        const client = clientOf(extra.mcpReq._meta);
        let runCtx: ToolContext = {
          ...ctx,
          caller: { door: 'mcp', ...(client ? { client } : {}) },
        };
        if (token !== undefined) {
          let n = 0;
          runCtx = {
            ...runCtx,
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

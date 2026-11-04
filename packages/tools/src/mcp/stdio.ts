// MCP over stdio (T051), for `petal mcp` (apps/cli) and `claude mcp add petal -- pnpm -s --dir
// <repo> petal mcp`. stdout carries MCP only: nothing in the tools writes to it.
import type { Transport } from '@modelcontextprotocol/server';
import { StdioServerTransport, serveStdio as serve } from '@modelcontextprotocol/server/stdio';
import type { ToolContext } from '../types.ts';
import { mcpServer } from './server.ts';

/** Serve the registry on a transport; resolves when the connection closes. */
export function serveOn(ctx: ToolContext, transport: Transport): Promise<void> {
  serve(() => mcpServer(ctx), { transport });
  // serve() sets onclose on the transport (and tears the connection down in it); chain onto it
  // to know when the client has gone.
  const sdkOnClose = transport.onclose;
  let closed = false;
  return new Promise<void>((done) => {
    transport.onclose = () => {
      if (closed) return;
      closed = true;
      sdkOnClose?.();
      done();
    };
  });
}

/** MCP over this process's stdin and stdout; resolves when stdin closes. */
export function serveStdio(ctx: ToolContext): Promise<void> {
  return serveOn(ctx, new StdioServerTransport());
}

// T051: MCP over stateless Streamable HTTP at /mcp and over stdio (serveStdio's serveOn):
// tools/list equals the registry, tools/call returns the tool's output as structuredContent,
// errors come back as isError with the same ToolError, progress as notifications/progress.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@petal/core', async (o) => (await import('./doubles/core.ts')).mockCore(await o()));
vi.mock('@petal/inputs', async (o) => (await import('./doubles/inputs.ts')).mockInputs(await o()));
vi.mock('@petal/near/auth', async (o) => (await import('./doubles/near.ts')).mockAuth(await o()));
vi.mock('@petal/near/map', async (o) => (await import('./doubles/near.ts')).mockMap(await o()));

import { httpApp } from '../src/http/app.ts';
import { mcpServer } from '../src/mcp/server.ts';
import { describeTool, registry } from '../src/registry.ts';
import { httpMcpClient, rig, stdioMcpClient, validatorsFixture } from './helpers.ts';

describe('MCP', () => {
  test('mcpServer builds an McpServer for the context', () => {
    expect(mcpServer(rig().ctx).server).toBeDefined();
  });

  test('tools/list: the registry names, titles, descriptions and schemas, over HTTP and stdio', async () => {
    const r = rig();
    const http = await httpMcpClient(httpApp(r.ctx));
    const { client: stdio } = await stdioMcpClient(r.ctx);
    for (const client of [http, stdio]) {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual(registry.map((t) => t.name));
      for (const t of registry) {
        const listed = tools.find((x) => x.name === t.name);
        expect(listed?.inputSchema, t.name).toEqual(t.input);
        expect(listed?.outputSchema, t.name).toEqual(t.output);
        expect(listed?.description, t.name).toBe(describeTool(t).description);
        expect(listed?.title, t.name).toBe(describeTool(t).title);
      }
      expect(tools.find((t) => t.name === 'list_networks')?.annotations?.readOnlyHint).toBe(true);
    }
    await http.close();
    await stdio.close();
  });

  test('tools/call returns structuredContent; errors are isError with the ToolError', async () => {
    const r = rig();
    const client = await httpMcpClient(httpApp(r.ctx));
    const ok = await client.callTool({
      name: 'get_snapshot',
      arguments: { network: 'near-validators' },
    });
    expect(ok.isError).toBeFalsy();
    expect(ok.structuredContent).toMatchObject({
      sha256: validatorsFixture().sha256,
      reused: true,
    });
    expect(JSON.parse((ok.content as { text: string }[])[0]?.text ?? '')).toEqual(
      ok.structuredContent,
    );
    const bad = await client.callTool({ name: 'compute_figures', arguments: { sha256: 'x' } });
    expect(bad.isError).toBe(true);
    expect(bad.structuredContent).toMatchObject({
      error: { code: 'bad_input' },
      tools_version: 'tools/v1',
    });
    await client.close();
  });

  test('progress goes out as notifications/progress, over HTTP and stdio', async () => {
    for (const make of ['http', 'stdio'] as const) {
      const r = rig();
      const client =
        make === 'http'
          ? await httpMcpClient(httpApp(r.ctx))
          : (await stdioMcpClient(r.ctx)).client;
      const seen: { progress: number; message?: string }[] = [];
      const out = await client.callTool(
        { name: 'get_snapshot', arguments: { network: 'test-live' } },
        { onprogress: (p: { progress: number; message?: string }) => seen.push(p) } as never,
      );
      expect(out.structuredContent, make).toMatchObject({ reused: false });
      expect(
        seen.map((p) => p.progress),
        make,
      ).toEqual([1, 2, 3]);
      expect(seen[1]?.message, make).toBe('fetching: reading holders (1/2)');
      await client.close();
    }
  });

  test('serveOn resolves when the client closes the connection', async () => {
    const { client, closed } = await stdioMcpClient(rig().ctx);
    await client.close();
    await expect(closed).resolves.toBeUndefined();
  });
});

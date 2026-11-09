// T051: MCP over stateless Streamable HTTP at /mcp and over stdio (serveStdio's serveOn):
// tools/list equals the registry, tools/call returns the tool's output as structuredContent,
// errors come back as isError with the same ToolError, progress as notifications/progress.
import { describe, expect, test } from 'vitest';

import { httpApp, SITE_HEADER } from '../src/http/app.ts';
import { mcpServer, progressLine } from '../src/mcp/server.ts';
import { describeTool, registry } from '../src/registry.ts';
import { httpMcpClient, progressOf, rig, stdioMcpClient, validatorsFixture } from './helpers.ts';

describe('MCP', () => {
  test('mcpServer builds an McpServer for the context', async () => {
    expect(mcpServer((await rig()).ctx).server).toBeDefined();
  });

  test('tools/list: the registry names, titles, descriptions and schemas, over HTTP and stdio', async () => {
    const r = await rig();
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
    const r = await rig();
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
      tools_version: 'tools/v2',
    });
    await client.close();
  });

  test('progress goes out as notifications/progress, over HTTP and stdio', async () => {
    for (const make of ['http', 'stdio'] as const) {
      const r = await rig();
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
      // one notification per event the tool reports in process, in order; progress only grows
      const inProcess = await progressOf('get_snapshot', { network: 'test-live' });
      expect(
        seen.map((p) => p.message),
        make,
      ).toEqual(inProcess.map(progressLine));
      expect(
        seen.map((p) => p.progress),
        make,
      ).toEqual(inProcess.map((_, i) => i + 1));
      expect(
        seen.map((p) => p.message),
        make,
      ).toContain('fetching: reading holders (1/2)');
      await client.close();
    }
  });

  test('serveOn resolves when the client closes the connection', async () => {
    const { client, closed } = await stdioMcpClient((await rig()).ctx);
    await client.close();
    await expect(closed).resolves.toBeUndefined();
  });

  test("a site's /mcp hands back links that open, and the flower stays the same flower", async () => {
    const SITE = 'http://localhost:3080';
    const draw = async (client: Awaited<ReturnType<typeof httpMcpClient>>, spec: unknown) => {
      const { structuredContent } = await client.callTool({
        name: 'render_flower',
        arguments: { spec, include_svg: false },
      });
      await client.close();
      return structuredContent as { view_url: string; spec_sha256: string };
    };
    const r = await rig();
    const { sha256 } = validatorsFixture();
    const direct = await httpMcpClient(httpApp(r.ctx));
    await direct.callTool({ name: 'get_snapshot', arguments: { network: 'near-validators' } });
    const proposed = await direct.callTool({
      name: 'propose_spec',
      arguments: { network: 'near-validators', sha256 },
    });
    await direct.close();
    const { spec } = proposed.structuredContent as { spec: unknown };

    const { apiBase: _drop, ...config } = r.ctx.config;
    const noAddress = { ...r.ctx, config };
    const header = () => ({ [SITE_HEADER]: SITE });

    const named = await draw(await httpMcpClient(httpApp(noAddress), header), spec);
    expect(named.view_url.startsWith(`${SITE}/draft?spec=`)).toBe(true);

    // a bare API, or the stdio door's next of kin: no pages, so no address to give
    const bare = await draw(await httpMcpClient(httpApp(noAddress)), spec);
    expect(bare.view_url.startsWith('/draft?spec=')).toBe(true);

    // an address the site was given wins over anything a caller says
    const set = await draw(await httpMcpClient(httpApp(r.ctx), header), spec);
    expect(set.view_url.startsWith('https://petal.test/draft?spec=')).toBe(true);

    expect(new Set([named, bare, set].map((d) => d.spec_sha256)).size).toBe(1);
  });
});

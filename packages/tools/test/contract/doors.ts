// The doors a contract test calls the same tool through: the registry in process (what the CLI
// and the agent use), the HTTP routes, MCP over Streamable HTTP at /mcp, and MCP over stdio.
import type { Client } from '@modelcontextprotocol/client';
import { httpApp } from '../../src/http/app.ts';
import { callTool } from '../../src/registry.ts';
import type { ToolContext } from '../../src/types.ts';
import { httpMcpClient, stdioMcpClient } from '../helpers.ts';

export type Json = Record<string, unknown>;

export interface Door {
  name: 'in-process' | 'http' | 'mcp-http' | 'mcp-stdio';
  call(tool: string, input: Json): Promise<Json>;
}

const qs = (o: Record<string, unknown> = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

/** An exploration's place in a path: its id, or a link's token. Agents may be handed the whole URL. */
const tokenOf = (i: Json) => String(i.exploration).split('/').pop();

/** http-api.md, Routes: tool → method, path and body. */
export const ROUTES: Record<
  string,
  (i: Json) => { method: 'GET' | 'POST'; path: string; body?: Json }
> = {
  list_networks: (i) => ({ method: 'GET', path: `/api/v1/networks${qs({ query: i.query })}` }),
  get_network: (i) => ({
    method: 'GET',
    path: `/api/v1/networks/${i.id}${qs(i.params as Json | undefined)}`,
  }),
  get_snapshot: (i) => ({ method: 'POST', path: '/api/v1/snapshots', body: i }),
  describe_snapshot: (i) => ({
    method: 'GET',
    path: `/api/v1/snapshots/${i.sha256}/describe${qs({ top: i.top })}`,
  }),
  compute_figures: (i) => ({ method: 'POST', path: '/api/v1/figures', body: i }),
  propose_spec: (i) => ({ method: 'POST', path: '/api/v1/specs/propose', body: i }),
  validate_spec: (i) => ({ method: 'POST', path: '/api/v1/specs/validate', body: i }),
  render_flower: (i) => ({ method: 'POST', path: '/api/v1/render', body: i }),
  list_flowers: (i) => ({
    method: 'GET',
    path: `/api/v1/flowers${qs({ network: i.network, maker: i.maker, limit: i.limit })}`,
  }),
  get_flower: (i) => ({ method: 'GET', path: `/api/v1/flowers/${i.id}` }),
  prepare_publish: (i) => ({ method: 'POST', path: '/api/v1/publish/prepare', body: i }),
  publish_flower: (i) => ({ method: 'POST', path: '/api/v1/publish', body: i }),
  quote_payment: (i) => ({ method: 'POST', path: '/api/v1/quote', body: i }),
  look_up: (i) => ({ method: 'GET', path: `/api/v1/look-up${qs(i)}` }),
  find_target: (i) => ({ method: 'GET', path: `/api/v1/find${qs({ query: i.query })}` }),
  read_chain: (i) => ({ method: 'POST', path: '/api/v1/read-chain', body: i }),
  read_page: (i) => ({ method: 'GET', path: `/api/v1/read-page${qs(i)}` }),
  search: (i) => ({ method: 'GET', path: `/api/v1/web-search${qs(i)}` }),
  account_groups: (i) => ({ method: 'GET', path: `/api/v1/relations/account-groups${qs(i)}` }),
  shared_accounts: (i) => ({ method: 'GET', path: `/api/v1/relations/shared${qs(i)}` }),
  related_groups: (i) => ({ method: 'GET', path: `/api/v1/relations/related${qs(i)}` }),
  relations_overview: (i) => ({ method: 'GET', path: `/api/v1/relations/overview${qs(i)}` }),
  power_path: (i) => ({ method: 'GET', path: `/api/v1/relations/path${qs(i)}` }),
  list_explorations: (i) => ({ method: 'GET', path: `/api/v1/explorations${qs(i)}` }),
  get_exploration: (i) => ({ method: 'GET', path: `/api/v1/explorations/${tokenOf(i)}` }),
  start_exploration: (i) => ({ method: 'POST', path: '/api/v1/explorations', body: i }),
  save_step: ({ exploration: _ref, ...b }) => ({
    method: 'POST',
    path: `/api/v1/explorations/${tokenOf({ exploration: _ref })}/steps`,
    body: b,
  }),
  add_note: ({ exploration: _ref, ...b }) => ({
    method: 'POST',
    path: `/api/v1/explorations/${tokenOf({ exploration: _ref })}/notes`,
    body: b,
  }),
};

let ip = 0;
/** A new caller address per request, so the per-IP limit never trips a contract test. */
const caller = () => ({ 'cf-connecting-ip': `10.0.${(ip >> 8) & 255}.${ip++ & 255}` });

/** Every door on one context. `close` ends the MCP connections. */
export async function doors(ctx: ToolContext): Promise<{ all: Door[]; close(): Promise<void> }> {
  const app = httpApp(ctx);
  const mcpHttp = await httpMcpClient(httpApp(ctx), caller);
  const { client: mcpStdio } = await stdioMcpClient(ctx);
  const viaMcp = (client: Client) => async (tool: string, input: Json) => {
    const out = await client.callTool({ name: tool, arguments: input });
    return out.structuredContent as Json;
  };
  const all: Door[] = [
    {
      name: 'in-process',
      call: async (tool, input) => JSON.parse(JSON.stringify(await callTool(tool, input, ctx))),
    },
    {
      name: 'http',
      async call(tool, input) {
        const route = ROUTES[tool];
        if (!route) throw new Error(`no route for ${tool}`);
        const r = route(input);
        const res = await app.request(r.path, {
          method: r.method,
          headers: { 'content-type': 'application/json', ...caller() },
          ...(r.body ? { body: JSON.stringify(r.body) } : {}),
        });
        return (await res.json()) as Json;
      },
    },
    { name: 'mcp-http', call: viaMcp(mcpHttp) },
    { name: 'mcp-stdio', call: viaMcp(mcpStdio) },
  ];
  return {
    all,
    async close() {
      await mcpHttp.close();
      await mcpStdio.close();
    },
  };
}

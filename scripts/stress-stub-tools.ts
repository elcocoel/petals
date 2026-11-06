// For `stress.ts --door loop`: Petal's tool list as an MCP server that does nothing. The model calls
// tools natively, `claude -p --max-turns 1` stops there, and Petal's real loop runs what it asked for.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const defs = JSON.parse(readFileSync(process.argv[2] as string, 'utf8')) as {
  name: string;
  description: string;
  parameters: unknown;
}[];

const answer: Record<string, (params: { protocolVersion?: string }) => unknown> = {
  initialize: (p) => ({
    protocolVersion: p.protocolVersion,
    capabilities: { tools: {} },
    serverInfo: { name: 'petal', version: '0' },
  }),
  'tools/list': () => ({
    tools: defs.map((d) => ({
      name: d.name,
      description: d.description,
      inputSchema: d.parameters,
    })),
  }),
  'tools/call': () => ({ content: [{ type: 'text', text: 'ok' }] }),
};

for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue;
  const m = JSON.parse(line) as {
    id?: number;
    method: string;
    params?: { protocolVersion?: string };
  };
  if (m.id === undefined) continue; // a notification
  const reply = answer[m.method];
  process.stdout.write(
    `${JSON.stringify(
      reply
        ? { jsonrpc: '2.0', id: m.id, result: reply(m.params ?? {}) }
        : { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'no such method' } },
    )}\n`,
  );
}

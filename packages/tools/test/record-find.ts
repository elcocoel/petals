// Records the real answers behind FIND_SET, so find.test.ts replays them offline.
//   node packages/tools/test/record-find.ts
// About 40 keyless calls, paced for GeckoTerminal's 30 a minute. Public data only, no key.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createContext, type ToolContext } from '../src/index.ts';
import { makeFindTarget } from '../src/tools/find.ts';
import { FIND_SET } from './find-set.ts';

const FILE = join(import.meta.dirname, 'fixtures/find-target.json.gz');
const calls: Record<string, { status: number; body: string }> = {};

const recording: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  const body = await res.text();
  calls[`${String(input)} ${typeof init?.body === 'string' ? init.body : ''}`] = {
    status: res.status,
    body,
  };
  return new Response(body, { status: res.status });
};

const ctx: ToolContext = createContext({ root: join(import.meta.dirname, '../../..'), fake: true });
const find = makeFindTarget({ fetch: recording });
for (const { query } of FIND_SET) {
  const out = (await find.run({ query }, ctx)) as { calls?: number };
  console.log(query, out.calls);
  await new Promise((r) => setTimeout(r, 3000));
}
mkdirSync(dirname(FILE), { recursive: true });
writeFileSync(
  FILE,
  gzipSync(JSON.stringify({ recorded_at: new Date().toISOString(), calls }), { level: 9 }),
);

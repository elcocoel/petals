// "Navigate me there" (Elco, 12 Nov, run 421a5e8a: thirteen tool calls and a count from scratch for a map that
// was already there): the agent has get_map and the words to go to a map first, and two calls take the person
// there with its link and what it holds. The real tools on the real fixtures, through the real loop. $0: a
// scripted model.
import { fileURLToPath } from 'node:url';
import type { AgentEvent } from '@petal/core/types';
import { callTool, createContext, type ToolContext } from '@petal/tools';
import { describe, expect, test } from 'vitest';
import { DEFAULT_BUDGET, type LlmMessage } from '../src/llm.ts';
import { startRun } from '../src/run.ts';
import { collect, scriptedLlm, tmpRoot } from './helpers.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const VALIDATORS = '72a6d9676d967d63712dc82bcbb90282d2f61e5ca6495c3e2e54a4f9af77e9ec';

// biome-ignore lint/suspicious/noExplicitAny: walking tool outputs
type Out = Record<string, any>;

/** A context whose Power Map holds one map: NEAR's validators, drawn from the stored fixture. */
async function withAMap(): Promise<ToolContext> {
  const ctx = createContext({ root, fake: true, stateDir: tmpRoot() } as never);
  const proposed = (await callTool(
    'propose_spec',
    { network: 'near-validators', sha256: VALIDATORS },
    ctx,
  )) as Out;
  await callTool('render_flower', { spec: proposed.spec }, ctx);
  return ctx;
}

describe('going to a map', () => {
  test('look_up gives the link, get_map what it holds: two calls, no count, nothing held', async () => {
    const ctx = await withAMap();
    const found = (await callTool('look_up', { query: 'near validators' }, ctx)) as Out;
    const map = found.maps[0];
    expect(map.map_url).toBe(`/m/${encodeURIComponent(map.id)}`);
    const llm = scriptedLlm([
      { calls: [{ name: 'look_up', args: { query: 'near validators' } }] },
      { calls: [{ name: 'get_map', args: { map: map.id } }] },
      { content: `Here: [NEAR validators](${map.map_url}).` },
    ]);
    let kept: LlmMessage[] = [];
    const es: AgentEvent[] = await collect(
      startRun(
        { messages: [{ role: 'user', content: 'navigate me to the near validators' }] },
        { tools: ctx, llm, budget: DEFAULT_BUDGET },
        {
          onThread: (t) => {
            kept = t;
          },
        },
      ),
    );
    // the model is given get_map, and the words to go to what's there first
    const first = llm.requests[0];
    expect(first?.tools?.map((t) => t.name)).toContain('get_map');
    expect(first?.messages[0]?.content).toMatch(/## What's already there/);
    expect(first?.messages[0]?.content).toMatch(/`map_url` is the other way round/);
    // both reads answer, and nothing waits for a yes
    const results = es.filter((e) => e.event === 'tool_result');
    expect(results.map((e) => (e.data as Out).ok)).toEqual([true, true]);
    expect(es.some((e) => e.event === 'approval_required')).toBe(false);
    const got = kept.flatMap((m) => (m.role === 'tool' ? [JSON.parse(m.content) as Out] : []));
    expect(got[0]?.maps[0].map_url).toBe(map.map_url);
    expect(got[1]).toMatchObject({ id: map.id, map_url: map.map_url });
    expect(got[1]?.readings[0].snapshot).toBe(VALIDATORS);
    const said = es.find((e) => e.event === 'message')?.data as Out;
    expect(said.text).toContain(map.map_url);
  });
});

// The agent knows what's in front of the person and can move the map: the chat carries what the canvas has open
// (in_front), the system notes name it, and the model's show tool moves the map, as the show event the page
// follows. The real tools on the real fixture, through the real loop. $0: a scripted model.
import { fileURLToPath } from 'node:url';
import type { AgentEvent } from '@petal/core/types';
import { callTool, createContext, registry, type ToolContext } from '@petal/tools';
import { describe, expect, test } from 'vitest';
import { DEFAULT_BUDGET } from '../src/llm.ts';
import { parseChat } from '../src/routes.ts';
import { startRun } from '../src/run.ts';
import { frontNotes, frontOf, parseInFront, parseShow, showTool } from '../src/show.ts';
import { collect, scriptedLlm, tmpRoot } from './helpers.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const VALIDATORS = '72a6d9676d967d63712dc82bcbb90282d2f61e5ca6495c3e2e54a4f9af77e9ec';
const SHA = 'ab'.repeat(32);
// biome-ignore lint/suspicious/noExplicitAny: walking tool outputs
type Out = Record<string, any>;

async function withAMap(): Promise<{ ctx: ToolContext; map: string }> {
  const ctx = createContext({ root, fake: true, stateDir: tmpRoot() } as never);
  const proposed = (await callTool(
    'propose_spec',
    { network: 'near-validators', sha256: VALIDATORS },
    ctx,
  )) as Out;
  await callTool('render_flower', { spec: proposed.spec }, ctx);
  const map = ((await callTool('look_up', { query: 'near validators' }, ctx)) as Out).maps[0].id;
  return { ctx, map };
}

const ask = (content: string, extra: Out = {}) =>
  parseChat({ messages: [{ role: 'user', content }], ...extra });

describe('in_front: what the canvas has open, as the chat carries it', () => {
  test('the shapes it takes, and what it refuses', () => {
    expect(parseInFront({ map: null })).toEqual({ map: null });
    expect(
      parseInFront({
        map: 'near:mainnet:validators',
        flower: SHA,
        at: '170000000',
        layers: [SHA],
        selected: { wallet: 'near:mainnet:astro-stakers.poolv1.near', chain: 'near:mainnet' },
      }),
    ).toMatchObject({ map: 'near:mainnet:validators', flower: SHA, at: '170000000' });
    expect(parseInFront({ map: null, flower: SHA })).toEqual({ map: null, flower: SHA });
    expect(parseInFront({ map: 'x', zoom: 3 })).toBe("in_front.zoom isn't a field");
    expect(parseInFront({ map: 'x', flower: 'nope' })).toMatch(/spec_sha256/);
    expect(parseInFront({ map: 'x', at: 'soon' })).toMatch(/block number or a date/);
    expect(parseInFront({ map: 'x', selected: { wallet: '' } })).toMatch(/^in_front.selected/);
    expect(parseShow({ line: ['a', 'b'] })).toEqual({ line: ['a', 'b'] });
    expect(parseShow({ proposal: { map: 'm', id: '7' } })).toEqual({
      proposal: { map: 'm', id: '7' },
    });
    expect(typeof parseShow({ map: 'm', wallet: 'w' })).toBe('string');
    // through the chat's own parsing: carried as given, refused with the reason
    expect(ask('what is this?', { in_front: { map: null } })).toMatchObject({
      in_front: { map: null },
    });
    expect(ask('what is this?', { in_front: { map: 3 } })).toMatch(/in_front.map/);
  });

  test('the notes name the map as the Power Map does, what is chosen on it, and what "this" means', async () => {
    const { ctx, map } = await withAMap();
    const front = await frontOf(ctx, {
      map,
      selected: { wallet: 'near:mainnet:astro-stakers.poolv1.near', chain: 'near:mainnet' },
    });
    expect(front.card?.chain).toBe('near:mainnet');
    const notes = frontNotes(front);
    expect(notes).toMatch(/^## In front of the person/);
    expect(notes).toContain(`(${map}, on near:mainnet)`);
    expect(notes).toContain(
      'Chosen on it: the wallet near:mainnet:astro-stakers.poolv1.near on near:mainnet.',
    );
    expect(notes).toMatch(/they mean that/);
    expect(frontNotes(await frontOf(ctx, { map: null }))).toContain(
      'the whole Power Map, with no map entered',
    );
    expect(
      frontNotes(
        await frontOf(ctx, { map: 'eip155:1:0x00000000000000000000000000000000000000b1' }),
      ),
    ).toContain('where no map is drawn yet');
  });

  test('the model reads it in its system message, and moves the map with show', async () => {
    const { ctx, map } = await withAMap();
    const llm = scriptedLlm([
      { calls: [{ name: 'show', args: { map } }] },
      { calls: [{ name: 'show', args: { map: 'near:mainnet:nowhere.near' } }] },
      { content: 'This is NEAR’s validators.' },
    ]);
    const es: AgentEvent[] = await collect(
      startRun(
        {
          messages: [{ role: 'user', content: 'what is this about?' }],
          front: await frontOf(ctx, { map }),
        },
        { tools: ctx, llm, budget: DEFAULT_BUDGET },
        { registry: [...registry, showTool(ctx)] },
      ),
    );
    const system = llm.requests[0]?.messages[0]?.content ?? '';
    expect(system).toContain('## In front of the person');
    expect(system).toContain(map);
    expect(llm.requests[0]?.tools?.map((t) => t.name)).toContain('show');
    // the map moves once: to the map it named; a map that isn't there moves nothing and says why
    const shows = es.filter((e) => e.event === 'show');
    expect(shows.map((e) => e.data)).toEqual([{ map }]);
    const results = es.filter((e) => e.event === 'tool_result').map((e) => e.data as Out);
    expect(results.map((r) => r.ok)).toEqual([true, false]);
  });
});

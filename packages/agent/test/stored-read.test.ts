// 25ac: reading what's stored isn't a new map. The real get_snapshot on the real fixtures, through the
// real loop: a question gets a number with a date on it, nothing public is called, and nothing it
// reads agrees to a drawing. $0: a scripted model.
import { fileURLToPath } from 'node:url';
import type { AgentEvent } from '@petal/core/types';
import { createContext, registry, type ToolContext } from '@petal/tools';
import { describe, expect, test, vi } from 'vitest';
import { DEFAULT_BUDGET, type LlmMessage } from '../src/llm.ts';
import { startRun } from '../src/run.ts';
import { storedRead } from '../src/stored-read.ts';
import { collect, type ScriptTurn, scriptedLlm, tmpRoot } from './helpers.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const context = () => createContext({ root, fake: true, stateDir: tmpRoot() } as never);
const VALIDATORS = 'near-validators';
const READ = { name: 'get_snapshot', args: { network: VALIDATORS } };

const pick = <N extends AgentEvent['event']>(es: AgentEvent[], n: N) =>
  es.filter((e): e is Extract<AgentEvent, { event: N }> => e.event === n);
const held = (es: AgentEvent[]) => es.filter((e) => e.event === 'approval_required');

async function chat(turns: ScriptTurn[], said: string, ctx = context(), thread?: LlmMessage[]) {
  const llm = scriptedLlm(turns);
  let kept: LlmMessage[] = [];
  const es = await collect(
    startRun(
      { messages: [{ role: 'user', content: said }], ...(thread ? { thread } : {}) },
      { tools: ctx, llm, budget: DEFAULT_BUDGET },
      {
        onThread: (t) => {
          kept = t;
        },
      },
    ),
  );
  return { es, llm, kept };
}
const answers = (kept: LlmMessage[]) =>
  kept.flatMap((m) =>
    m.role === 'tool' ? [JSON.parse(m.content) as Record<string, unknown>] : [],
  );

describe('a stored snapshot, with no yes', () => {
  test('answers, marked as a stored read, with nothing held', async () => {
    const { es, kept } = await chat(
      [{ calls: [READ] }, { content: 'Nine hold a third.' }],
      'is NEAR decentralized?',
    );
    expect(held(es)).toEqual([]);
    expect(pick(es, 'tool_result')[0]?.data.ok).toBe(true);
    const [read] = answers(kept);
    expect(read).toMatchObject({ reused: true, where: 'fixture', stored_only: true });
    expect(pick(es, 'message')[0]?.data.text).toBe('Nine hold a third.');
  });

  test('the model counts in it, as far as it wants, and is never held', async () => {
    const ctx = context();
    const read = await registry
      .find((t) => t.name === 'get_snapshot')
      ?.run({ network: VALIDATORS }, ctx);
    const sha256 = (read as { sha256: string }).sha256;
    const { es } = await chat(
      [
        { calls: [READ] },
        {
          calls: [
            { name: 'describe_snapshot', args: { sha256 } },
            { name: 'compute_figures', args: { sha256, measure: 'validator_stake_current_epoch' } },
          ],
        },
        { content: 'Nine hold a third.' },
      ],
      'is NEAR decentralized?',
      ctx,
    );
    expect(held(es)).toEqual([]);
    expect(pick(es, 'tool_result').map((e) => e.data.ok)).toEqual([true, true, true]);
  });

  test('reading it agrees to nothing: drawing it is still held, in this chat and the next', async () => {
    const ctx = context();
    const read = await registry
      .find((t) => t.name === 'get_snapshot')
      ?.run({ network: VALIDATORS }, ctx);
    const sha256 = (read as { sha256: string }).sha256;
    const propose = { name: 'propose_spec', args: { network: VALIDATORS, sha256 } };
    const ask = 'Nine hold a third. Want it drawn?';
    const one = await chat(
      [{ calls: [READ] }, { calls: [propose] }, { content: ask }],
      'is NEAR decentralized?',
      ctx,
    );
    expect(held(one.es)).toHaveLength(1);
    expect(pick(one.es, 'tool_result').map((e) => e.data.ok)).toEqual([true, false]);

    const next: LlmMessage[] = [...one.kept, { role: 'user', content: 'and who holds the most?' }];
    const two = await chat(
      [{ calls: [propose] }, { content: 'A pool does.' }],
      'and who holds the most?',
      ctx,
      next,
    );
    expect(held(two.es)).toHaveLength(1);

    const yes: LlmMessage[] = [...one.kept, { role: 'user', content: 'yes' }];
    const three = await chat([{ calls: [propose] }, { content: 'Going on.' }], 'yes', ctx, yes);
    expect(held(three.es)).toEqual([]);
    expect(pick(three.es, 'tool_result')[0]?.data.ok).toBe(true);
  });
});

describe('nothing stored, or asked to read it fresh', () => {
  test('a target with nothing stored is held, and no source is called', async () => {
    const ctx = context();
    const fetching = vi.fn();
    const mod = ctx.modules['near-house-of-stake'];
    if (!mod) throw new Error('no module');
    const rows = (await ctx.store.list(mod.descriptor.id)).length;
    const spy = { ...mod, fetch: fetching, resolveAt: fetching };
    const empty = Object.assign(Object.create(ctx) as ToolContext, {
      modules: { ...ctx.modules, 'near-house-of-stake': spy },
      store: new Proxy(ctx.store, {
        get: (s, k) => (k === 'list' ? async () => [] : Reflect.get(s, k)),
      }),
    });
    const { es, llm } = await chat(
      [
        { calls: [{ name: 'get_snapshot', args: { network: 'near-house-of-stake' } }] },
        { content: 'Shall I read it?' },
      ],
      'how does that compare with the House of Stake?',
      empty,
    );
    expect(rows).toBeGreaterThanOrEqual(0);
    expect(held(es)).toHaveLength(1);
    expect(fetching).not.toHaveBeenCalled();
    expect(llm.requests[1]?.tools?.map((t) => t.name)).not.toContain('propose_spec');
  });

  test('fresh: true is a fresh read by name, stored or not', async () => {
    const { es } = await chat(
      [
        { calls: [{ name: 'get_snapshot', args: { network: VALIDATORS, fresh: true } }] },
        { content: 'Shall I?' },
      ],
      'read the validators fresh',
    );
    expect(held(es)).toHaveLength(1);
  });

  test('a network no module reads is not a stored read', async () => {
    expect(await storedRead(context(), { network: 'bitcoin' })).toBeNull();
    expect(await storedRead(context(), {})).toBeNull();
  });

  test('params that name no target are not a stored read', async () => {
    expect(
      await storedRead(context(), { network: 'moloch-v1', params: { dao: 'nope' } }),
    ).toBeNull();
  });
});

describe('which stored snapshot, and what can reach a source', () => {
  const row = (block_height: number | null, as_of: string) => ({
    block_height,
    as_of,
    chain: 'c',
    population: 'p',
    sha256: `s${block_height}`,
    network: 'n',
  });
  const fake = (rows: unknown[], keyFor?: unknown) => {
    const fetch = vi.fn(async () => {
      throw new Error('a source was called');
    });
    const resolveAt = vi.fn(async () => {
      throw new Error('a source was called');
    });
    const mod = {
      descriptor: { id: 'n', chain: 'c', population: 'p', live: true },
      fetch,
      resolveAt,
      ...(keyFor ? { keyFor } : {}),
    };
    return {
      ctx: { modules: { n: mod }, store: { list: async () => rows } } as unknown as ToolContext,
      fetch,
      resolveAt,
    };
  };
  const rows = [
    row(10, '2026-01-01T00:00:00Z'),
    row(30, '2026-03-01T00:00:00Z'),
    row(20, '2026-02-01T00:00:00Z'),
  ];
  const pinned = async (ctx: ToolContext, args: Record<string, unknown>) => {
    const c = await storedRead(ctx, { network: 'n', ...args });
    if (!c) return null;
    return (await c.modules.n?.resolveAt(args.at as never, undefined))?.block_height;
  };

  test.each([
    [{}, 30],
    [{ at: 'latest' }, 30],
    [{ at: { block_height: 20 } }, 20],
    [{ at: '2026-02-15' }, 20],
    [{ at: { block_height: 99 } }, null],
    [{ at: '2025-01-01' }, null],
    [{ at: 'not a date' }, null],
  ])('%j: block %s', async (args, block) => {
    expect(await pinned(fake(rows).ctx, args)).toBe(block);
  });

  test('another target stored under the same module does not count', async () => {
    const { ctx } = fake(rows, () => ({ chain: 'c', population: 'other' }));
    expect(await storedRead(ctx, { network: 'n' })).toBeNull();
  });

  test('a stored row with no block cannot be pinned, so it is not a stored read', async () => {
    expect(
      await storedRead(fake([row(null, '2026-01-01T00:00:00Z')]).ctx, { network: 'n' }),
    ).toBeNull();
  });

  test('a store that cannot answer is not a stored read', async () => {
    const { ctx } = fake([]);
    (ctx.store as unknown as { list: () => Promise<never> }).list = () =>
      Promise.reject(new Error('down'));
    expect(await storedRead(ctx, { network: 'n' })).toBeNull();
  });

  test('its module only knows the stored block: fetching is refused, and the real one is never called', async () => {
    const f = fake(rows);
    const c = await storedRead(f.ctx, { network: 'n' });
    await expect(c?.modules.n?.fetch({ block_height: 30, as_of: '' }, undefined)).rejects.toThrow(
      /missing/,
    );
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.resolveAt).not.toHaveBeenCalled();
    expect(c?.fresh).toBeUndefined();
  });
});

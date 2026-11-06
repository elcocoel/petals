// Reading what's stored isn't a new map (25ac). A get_snapshot with no yes behind it is answered from
// the store, the newest snapshot of that target unless the call names another, however old. It can't
// reach a public source: the module it runs through only knows the stored block, and refuses to fetch.
// So a question gets a real answer with a date on it, and the yes is left for a fresh read or a drawing.
import type { IndexRow } from '@petal/core/types';
import type { ToolContext } from '@petal/tools';

type Obj = Record<string, unknown>;

/** The stored snapshot this `at` asks for: the newest when it names none. */
function rowFor(rows: IndexRow[], at: unknown): IndexRow | undefined {
  const newest = rows
    .filter((r) => r.block_height !== null)
    .sort((a, b) => (b.block_height ?? 0) - (a.block_height ?? 0));
  if (at === undefined || at === 'latest') return newest[0];
  if (at && typeof at === 'object') {
    return newest.find((r) => r.block_height === (at as Obj).block_height);
  }
  const ms = typeof at === 'string' ? Date.parse(at) : Number.NaN;
  return newest.find((r) => Date.parse(r.as_of) <= ms);
}

/**
 * A context in which this get_snapshot can only reuse what's stored; null when nothing is stored for
 * it, or the call asks for a fresh read by name.
 */
export async function storedRead(ctx: ToolContext, args: Obj): Promise<ToolContext | null> {
  const { network, params, at, fresh } = args;
  const mod = typeof network === 'string' ? ctx.modules[network] : undefined;
  if (!mod || fresh === true) return null;
  let rows: IndexRow[];
  try {
    const d = mod.descriptor;
    const { chain, population } = mod.keyFor?.(params as never) ?? d;
    const all = await ctx.store.list(d.id);
    rows = all.filter((r) => r.chain === chain && r.population === population);
  } catch {
    return null; // params that name no target, or a store that can't say: not a stored read
  }
  const row = rowFor(rows, at);
  if (!row || row.block_height === null) return null;
  const { block_height, as_of } = row;
  const pinned = {
    ...mod,
    resolveAt: async () => ({ block_height, as_of }),
    fetch: async () => {
      throw new Error(`${mod.descriptor.id}: the stored snapshot at ${block_height} is missing`);
    },
  };
  return Object.assign(Object.create(ctx) as ToolContext, {
    modules: { ...ctx.modules, [mod.descriptor.id]: pinned },
    fresh: undefined,
  });
}

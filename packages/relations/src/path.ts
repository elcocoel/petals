// The one true traversal: bidirectional breadth-first search in application code, one batched
// adjacency query per level. A visited set means each group expands at most once per direction, and
// each step grows the smaller frontier. The graph spike measured this about 300 times faster than a
// recursive query on the same pairs, and it can stop when told to.
import type { DatabaseSync, StatementSync } from 'node:sqlite';

export type WalkEnd = 'met' | 'depth_limit' | 'budget' | 'no_path';

export interface Walk {
  end: WalkEnd;
  /** the vertices from one end to the other when end is 'met': accounts > 0, observations < 0 */
  vertices: number[];
  /** adjacency rows read */
  touched: number;
}

/** Rows per query: SQLite's json_each handles more, but a frontier this big is already rare. */
const BATCH = 50_000;

export function walk(
  db: DatabaseSync,
  from: readonly number[],
  to: readonly number[],
  opts: { steps: number; budget: number; inferred: boolean },
): Walk {
  // Sorted by key so a row's place doesn't depend on the query plan: tie-breaks survive a rebuild.
  // The primary key already gives that order, so this reads as it goes and can stop early.
  const adj: StatementSync = db.prepare(
    'SELECT src, dst FROM adj WHERE src IN (SELECT value FROM json_each(?)) AND inferred <= ? ORDER BY src, dst',
  );
  adj.setReturnArrays(true);
  const allowed = opts.inferred ? 1 : 0;
  // signed: the sign says which end reached it first, the size is its depth plus one
  const seen = new Map<number, number>();
  const parent = new Map<number, number>();
  for (const v of from) seen.set(v, 1);
  for (const v of to) {
    if (seen.has(v)) return { end: 'met', vertices: [v], touched: 0 };
    seen.set(v, -1);
  }

  const chain = (start: number): number[] => {
    const out = [start];
    for (let v = parent.get(start); v !== undefined; v = parent.get(v)) out.push(v);
    return out;
  };

  let fa = [...from];
  let fb = [...to];
  let da = 0;
  let db_ = 0;
  let touched = 0;
  while (fa.length > 0 && fb.length > 0) {
    if (da + db_ >= opts.steps) return { end: 'depth_limit', vertices: [], touched };
    const fromA = fa.length <= fb.length;
    const front = fromA ? fa : fb;
    const sign = fromA ? 1 : -1;
    const depth = (fromA ? da : db_) + 1;
    const next: number[] = [];
    for (let i = 0; i < front.length; i += BATCH) {
      const rows = adj.iterate(JSON.stringify(front.slice(i, i + BATCH)), allowed);
      for (const [src, dst] of rows as unknown as Iterable<[number, number]>) {
        if (++touched > opts.budget) return { end: 'budget', vertices: [], touched };
        const s = seen.get(dst);
        if (s === undefined) {
          seen.set(dst, sign * (depth + 1));
          parent.set(dst, src);
          next.push(dst);
        } else if (Math.sign(s) !== sign) {
          // The first contact is a shortest path: a shorter one would have met a level earlier.
          const near = chain(src).reverse();
          const far = chain(dst);
          return {
            end: 'met',
            vertices: fromA ? [...near, ...far] : [...far.reverse(), ...near.reverse()],
            touched,
          };
        }
      }
    }
    if (fromA) {
      fa = next;
      da = depth;
    } else {
      fb = next;
      db_ = depth;
    }
  }
  return { end: 'no_path', vertices: [], touched };
}

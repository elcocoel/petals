// Which participants get a petal (data-model.md, Petal spec `selection`): the top `petals` holders
// of the measure, largest first, then one declared tail petal folding everyone else. `petals` is a
// cap, so a population smaller than it gets one petal each and no tail.
import { formatDecimal, ratio6 } from './decimal.ts';
import { requireMeasure } from './figures/index.ts';
import { participantsById } from './tables.ts';
import type { PetalRow, Snapshot, Spec } from './types/index.ts';

export const TAIL_ID = '__tail';

/**
 * Top N by the measure plus the declared tail (`id: "__tail"`, `kind: "group"`, `rank` = the first
 * rank it folds, `count` = participants folded). With `tail.group` false no tail row is made;
 * validateSpec refuses such a spec when participants would be left out.
 */
export function selectPetals(s: Snapshot, sel: Spec['selection']): PetalRow[] {
  const t = requireMeasure(s, sel.measure);
  const people = participantsById(s);
  const n = Math.min(Math.max(0, Math.floor(sel.petals)), t.rows.length);
  const out: PetalRow[] = t.rows.slice(0, n).map((r, i) => {
    const p = people.get(r.id);
    return {
      index: i,
      id: r.id,
      label: p?.label ?? r.id,
      kind: p?.kind ?? 'unknown',
      identity: p?.identity ?? null,
      amount: formatDecimal(r.value, t.scale),
      share: ratio6(r.value, t.total),
      rank: i + 1,
    };
  });
  const rest = t.rows.slice(n);
  if (rest.length > 0 && sel.tail.group) {
    const amount = rest.reduce((acc, r) => acc + r.value, 0n);
    out.push({
      index: n,
      id: TAIL_ID,
      label: sel.tail.label,
      kind: 'group',
      identity: null,
      amount: formatDecimal(amount, t.scale),
      share: ratio6(amount, t.total),
      rank: n + 1,
      tail: true,
      count: rest.length,
    });
  }
  return out;
}

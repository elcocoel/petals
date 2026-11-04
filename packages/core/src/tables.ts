// Derived tables over a snapshot, built once per snapshot object (WeakMap) because the validators
// fixture has ~20k rows and a render reads them many times. Pure: a snapshot is never mutated.
import { exactValues } from './decimal.ts';
import { canonicalJson, sha256Hex } from './hash.ts';
import type { Participant, Snapshot } from './types/index.ts';

function memo<T>(cache: WeakMap<Snapshot, T>, s: Snapshot, build: () => T): T {
  const hit = cache.get(s);
  if (hit !== undefined) return hit;
  const value = build();
  cache.set(s, value);
  return value;
}

const hashes = new WeakMap<Snapshot, string>();
/** The snapshot's fingerprint: SHA-256 of its canonical JSON (data-model.md, Snapshot). */
export function snapshotSha256(s: Snapshot): string {
  return memo(hashes, s, () => sha256Hex(canonicalJson(s)));
}

const people = new WeakMap<Snapshot, Map<string, Participant>>();
export function participantsById(s: Snapshot): Map<string, Participant> {
  return memo(people, s, () => new Map(s.participants.map((p) => [p.id, p])));
}

/** One measure's holders, largest first. */
export interface MeasureTable {
  measure: string;
  unit: string;
  /** base-unit scale of `value` (value / 10^scale = amount) */
  scale: number;
  /** positive holders, by value descending, then id ascending */
  rows: { id: string; value: bigint }[];
  /** distinct participants with a row for the measure, zero included */
  holders: number;
  total: bigint;
  /** source ids of the measure's rows, sorted */
  sources: string[];
}

const measures = new WeakMap<Snapshot, Map<string, MeasureTable | null>>();

export function measureTable(s: Snapshot, measure: string): MeasureTable | null {
  const bySnapshot = memo(measures, s, () => new Map<string, MeasureTable | null>());
  const hit = bySnapshot.get(measure);
  if (hit !== undefined) return hit;
  const rows = s.holdings.filter((h) => h.measure === measure);
  let table: MeasureTable | null = null;
  if (rows.length > 0) {
    const { values, scale } = exactValues(rows);
    const sums = new Map<string, bigint>();
    rows.forEach((h, i) => {
      sums.set(h.participant, (sums.get(h.participant) ?? 0n) + (values[i] ?? 0n));
    });
    const positive = [...sums]
      .filter(([, v]) => v > 0n)
      .map(([id, value]) => ({ id, value }))
      .sort((a, b) => (a.value > b.value ? -1 : a.value < b.value ? 1 : a.id < b.id ? -1 : 1));
    table = {
      measure,
      unit: rows[0]?.unit ?? '',
      scale,
      rows: positive,
      holders: sums.size,
      total: positive.reduce((t, r) => t + r.value, 0n),
      sources: [...new Set(rows.map((h) => h.source))].sort(),
    };
  }
  bySnapshot.set(measure, table);
  return table;
}

/** Every measure in the snapshot's holdings, in first-seen order, with its unit. */
export function holdingMeasures(s: Snapshot): { id: string; unit: string }[] {
  const seen = new Map<string, string>();
  for (const h of s.holdings) if (!seen.has(h.measure)) seen.set(h.measure, h.unit);
  return [...seen].map(([id, unit]) => ({ id, unit }));
}

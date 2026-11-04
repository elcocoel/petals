// Counting (FR-025; data-model.md, Figures; research R6). The agent interprets; these count.
// Sums are exact BigInt over amount_raw (decimal amounts where a row has no raw value); shares,
// top-k, HHI and Gini are rounded to 6 decimals; amounts stay decimal strings.

import { formatDecimal, ratio6, round6 } from '../decimal.ts';
import { BadInputError } from '../errors.ts';
import { notImplemented } from '../not-implemented.ts';
import { holdingMeasures, type MeasureTable, measureTable, participantsById } from '../tables.ts';
import type { FigureChanges, Figures, Snapshot } from '../types/index.ts';

export const DEFAULT_TOP_K = [1, 5, 10, 100];
export const DEFAULT_PETALS = 60;

/**
 * BFT consensus halts when more than a third of the stake stops (NEAR validators, Ethereum
 * staking): 1/3. Everything else (mining pools, DAO votes, holders): 1/2.
 */
export function isBftPopulation(network: Snapshot['network']): boolean {
  return /validators/.test(network.population) || network.population === 'ethereum-staking';
}

/** The table for a measure, or bad_input naming the measures the snapshot has. */
export function requireMeasure(s: Snapshot, measure: string): MeasureTable {
  const table = measureTable(s, measure);
  if (table) return table;
  const allowed = holdingMeasures(s).map((m) => m.id);
  throw new BadInputError(`measure ${measure} is not in this snapshot's holdings`, {
    allowed,
    hint: `measures in this snapshot: ${allowed.join(', ')}`,
  });
}

/** Rational form of a threshold: exact for 1/3 and 1/2, nine decimals otherwise. */
function rational(t: number): [bigint, bigint] {
  if (t === 1 / 3) return [1n, 3n];
  if (t === 1 / 2) return [1n, 2n];
  return [BigInt(Math.round(t * 1e9)), 1_000_000_000n];
}

/** Smallest number of holders (largest first) whose sum passes `threshold` of the total. */
export function nakamotoCount(t: MeasureTable, threshold: number): number {
  const [num, den] = rational(threshold);
  let acc = 0n;
  let n = 0;
  for (const r of t.rows) {
    acc += r.value;
    n++;
    if (acc * den > t.total * num) return n;
  }
  return t.total > 0n ? n : 0;
}

function gini(t: MeasureTable): number {
  // G = (2 Σ i·x_i − (n+1) Σ x) / (n Σ x), x ascending, i from 1
  const n = BigInt(t.rows.length);
  if (n === 0n || t.total === 0n) return 0;
  let weighted = 0n;
  t.rows.forEach((r, j) => {
    weighted += (n - BigInt(j)) * r.value; // rows are descending: ascending rank i = n - j
  });
  const num = 2n * weighted - (n + 1n) * t.total;
  return ratio6(num < 0n ? 0n : num, n * t.total);
}

function hhi(t: MeasureTable): number {
  if (t.total === 0n) return 0;
  const sq = t.rows.reduce((acc, r) => acc + r.value * r.value, 0n);
  return ratio6(sq, t.total * t.total);
}

function positiveInt(name: string, x: number, min = 1): number {
  if (!Number.isInteger(x) || x < min)
    throw new BadInputError(`${name} must be an integer of at least ${min}`, {
      hint: `got ${x}`,
    });
  return x;
}

export function computeFigures(
  s: Snapshot,
  opts: { measure: string; petals?: number; nakamotoThreshold?: number; topK?: number[] },
): Figures {
  const t = requireMeasure(s, opts.measure);
  const petals = positiveInt('petals', opts.petals ?? DEFAULT_PETALS);
  const topK = (opts.topK ?? DEFAULT_TOP_K).map((k) => positiveInt('top_k', k));
  const threshold = opts.nakamotoThreshold ?? (isBftPopulation(s.network) ? 1 / 3 : 1 / 2);
  if (!(threshold > 0 && threshold < 1))
    throw new BadInputError('nakamoto_threshold must be between 0 and 1', {
      hint: '1/3 for BFT chains, 1/2 otherwise',
    });

  const people = participantsById(s);
  const included = t.rows.length;
  const shown = t.rows.slice(0, petals);
  const sumTop = (k: number) => t.rows.slice(0, k).reduce((acc, r) => acc + r.value, 0n);
  const tailRows = t.rows.slice(shown.length);
  const tailAmount = tailRows.reduce((acc, r) => acc + r.value, 0n);
  const kKeys = [...new Set(topK)].sort((a, b) => a - b);

  return {
    measure: t.measure,
    unit: t.unit,
    total: formatDecimal(t.total, t.scale),
    participants_total:
      s.coverage.measure === t.measure ? s.coverage.participants_total : t.holders,
    participants_included: included,
    shares: shown.map((r, i) => ({
      id: r.id,
      label: people.get(r.id)?.label ?? r.id,
      amount: formatDecimal(r.value, t.scale),
      share: ratio6(r.value, t.total),
      rank: i + 1,
    })),
    top_k_share: Object.fromEntries(kKeys.map((k) => [String(k), ratio6(sumTop(k), t.total)])),
    nakamoto: { threshold: round6(threshold), count: nakamotoCount(t, threshold) },
    hhi: hhi(t),
    gini: gini(t),
    tail: {
      count: tailRows.length,
      amount: formatDecimal(tailAmount, t.scale),
      share: ratio6(tailAmount, t.total),
    },
    fusions: [],
    figure_ids: [
      'fig:total',
      'fig:participants_total',
      'fig:participants_included',
      'fig:shares',
      ...kKeys.map((k) => `fig:top_k_share.${k}`),
      'fig:nakamoto',
      'fig:hhi',
      'fig:gini',
      'fig:tail',
    ],
  };
}

/** US5, tools.md compare_figures. `a` is the earlier snapshot. Phase B (M8). */
export function compareFigures(
  _a: Snapshot,
  _b: Snapshot,
  _opts: { measure: string; petals?: number },
): FigureChanges {
  return notImplemented('compareFigures');
}

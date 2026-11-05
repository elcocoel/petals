// From one snapshot to its groups (T198). Pure: no database. A snapshot is not a group: NEAR's
// validators give one group of pools plus one group of delegators per pool, and those delegators
// live in `relationships`, not in `holdings`.
//
// A group's identity over time is its module and parameters (open question 26), so two dates of one
// population are two observations of one group, and a `group:*` row is never an account.
import { exactValues, formatDecimal } from '@petal/core';
import type { Participant, Snapshot } from '@petal/core/types';

export type GroupKind = 'holdings' | 'delegators';

/** What a read saw of a group. Absence from a partial read proves nothing. */
export interface Coverage {
  members_named: number;
  /** null: the snapshot states its coverage for another measure, so the full size isn't known */
  members_total: number | null;
  /** accounts the source counts but stores folded together, which can't be compared */
  tail_accounts: number | null;
  amount_total: string;
  amount_named: string;
  /** the part of amount_total held by named accounts */
  named_share: number;
  /** how far back an activity read looked, e.g. "7 days"; null for a full read */
  window: string | null;
  complete: boolean;
  /** why this read can miss members, in plain words; empty when complete */
  why_partial: string[];
}

export interface Member {
  address: string;
  /** exact decimal: amounts can pass what a double holds */
  amount: string;
  /** of everything the group's rows hold, as compute_figures counts it */
  share: number;
  /** among all rows of the group, folded rows included, as compute_figures counts it */
  rank: number;
  kind: string | null;
  identity: Participant['identity'];
}

export interface ProjectedGroup {
  key: string;
  module: string;
  chain: string;
  kind: GroupKind;
  measure: string;
  unit: string;
  title: string;
  /** the account a delegators group is about: not a member, but the group is its backers */
  anchor: string | null;
  coverage: Coverage;
  members: Member[];
}

export const isEvm = (chain: string): boolean => chain.startsWith('eip155:');

/**
 * Where an address string means one thing. An EVM address could be one key on every EVM chain, so
 * they share a scope and a match across chains is a marked inference. Anywhere else an equal string
 * on another chain is no match at all.
 */
export const scopeOf = (chain: string): string => (isEvm(chain) ? 'eip155' : chain);

/** EVM addresses are case-insensitive. Base58 and NEAR names must never be changed. */
export const normalise = (chain: string, id: string): string =>
  isEvm(chain) ? id.toLowerCase() : id;

const isFolded = (p: Pick<Participant, 'id' | 'kind'>): boolean =>
  p.kind === 'group' || p.id.startsWith('group:');

/** How a module was asked to read, rather than which group it read. */
const READ_PARAMS = new Set(['window_days']);

/** `<module>/<chain>/<parameters, or the population for a module with none>`. */
export function groupBase(network: Snapshot['network']): string {
  const params = Object.entries(network.params ?? {})
    .filter(([k]) => !READ_PARAMS.has(k) && k !== 'chain')
    .map(([k, v]) => `${k}:${/^0x[0-9a-fA-F]+$/.test(String(v)) ? String(v).toLowerCase() : v}`)
    .sort();
  return `${network.id}/${network.chain}/${params.length ? params.join(',') : network.population}`;
}

/**
 * The measure the snapshot is about. Coverage names it, unless that measure has no holdings rows
 * (near-validators states coverage for delegated_stake, which lives in relationships): then the
 * measure in coverage's unit with the most rows, not a block count that happens to sit beside it.
 */
function primaryMeasure(s: Snapshot): string | null {
  const counts = new Map<string, { rows: number; unit: string }>();
  for (const h of s.holdings) {
    const c = counts.get(h.measure);
    if (c) c.rows++;
    else counts.set(h.measure, { rows: 1, unit: h.unit });
  }
  if (counts.has(s.coverage.measure ?? '')) return s.coverage.measure ?? null;
  const pick = [...counts]
    .sort(
      ([a, x], [b, y]) =>
        Number(y.unit === s.coverage.unit) - Number(x.unit === s.coverage.unit) ||
        y.rows - x.rows ||
        (a < b ? -1 : 1),
    )
    .at(0);
  return pick?.[0] ?? null;
}

type Row = { id: string; amount?: string; amount_raw?: string };

/** Sums per normalised id, keeps positive rows, largest first, then by id. Exact. */
function tally(chain: string, rows: Row[]) {
  const { values, scale } = exactValues(rows);
  const sums = new Map<string, bigint>();
  rows.forEach((r, i) => {
    const id = normalise(chain, r.id);
    sums.set(id, (sums.get(id) ?? 0n) + (values[i] ?? 0n));
  });
  const positive = [...sums]
    .filter(([, v]) => v > 0n)
    .sort(([a, x], [b, y]) => (x > y ? -1 : x < y ? 1 : a < b ? -1 : 1));
  return { positive, scale, total: positive.reduce((t, [, v]) => t + v, 0n) };
}

/** A share kept as a double, with far more digits than the 6 a tool returns. */
const SHARE_SCALE = 10n ** 15n;
const shareOf = (v: bigint, total: bigint): number =>
  total > 0n ? Number((v * SHARE_SCALE) / total) / 1e15 : 0;

const round6 = (x: number): number => Math.round(x * 1e6) / 1e6;

export function groupsOf(s: Snapshot): ProjectedGroup[] {
  if (Number.isNaN(Date.parse(s.snapshot.as_of)))
    throw new TypeError(`snapshot date is not a date: ${s.snapshot.as_of}`);
  const chain = s.network.chain;
  const people = new Map<string, Participant>();
  for (const p of s.participants) people.set(normalise(chain, p.id), p);
  const folded = (id: string) => {
    const p = people.get(id);
    return p ? isFolded(p) : id.startsWith('group:');
  };
  const windowDays = s.network.params?.window_days;
  const window = windowDays && windowDays !== 'full' ? `${windowDays} days` : null;
  const sourcePartial = s.coverage.partial === true;
  const base = groupBase(s.network);

  function build(
    fields: Pick<ProjectedGroup, 'key' | 'kind' | 'measure' | 'unit' | 'title' | 'anchor'>,
    rows: Row[],
    sizes: (
      named: number,
      foldedRows: [string, bigint][],
    ) => {
      total: number | null;
      tail: number | null;
      amountTotal: string | null;
      why: string[];
    },
  ): ProjectedGroup {
    const { positive, scale, total } = tally(chain, rows);
    const members: Member[] = [];
    let namedSum = 0n;
    const foldedRows: [string, bigint][] = [];
    positive.forEach(([id, v], i) => {
      if (folded(id)) {
        foldedRows.push([id, v]);
        return;
      }
      namedSum += v;
      const p = people.get(id);
      members.push({
        address: id,
        amount: formatDecimal(v, scale),
        share: shareOf(v, total),
        rank: i + 1,
        kind: p && p.kind !== 'unknown' ? p.kind : null,
        identity: p?.identity ?? null,
      });
    });
    const size = sizes(members.length, foldedRows);
    const amountNamed = formatDecimal(namedSum, scale);
    const amountTotal = size.amountTotal ?? formatDecimal(total, scale);
    const cmp = exactValues([{ amount: amountNamed }, { amount: amountTotal }]).values;
    const [namedExact, totalExact] = [cmp[0] ?? 0n, cmp[1] ?? 0n];
    const why = [...size.why];
    if (sourcePartial) why.push('some sources failed during this read');
    if (window) why.push(`only accounts active in the last ${window} were read`);
    if (namedExact < totalExact)
      why.push('part of the amount is not attributed to a named account');
    return {
      ...fields,
      module: s.network.id,
      chain,
      coverage: {
        members_named: members.length,
        members_total: size.total,
        tail_accounts: size.tail,
        amount_total: amountTotal,
        amount_named: amountNamed,
        named_share: round6(shareOf(namedExact, totalExact)),
        window,
        complete: why.length === 0,
        why_partial: why,
      },
      members,
    };
  }

  const out: ProjectedGroup[] = [];
  const measure = primaryMeasure(s);
  if (measure) {
    const rows = s.holdings.filter((h) => h.measure === measure);
    const stated = s.coverage.measure === measure;
    out.push(
      build(
        {
          key: `${base}/${measure}`,
          kind: 'holdings',
          measure,
          unit: rows[0]?.unit ?? s.coverage.unit,
          title: s.network.title,
          anchor: null,
        },
        rows.map((h) => ({ ...h, id: h.participant })),
        (named) => {
          if (!stated) {
            return {
              total: null,
              tail: null,
              amountTotal: null,
              why: [`the snapshot states its coverage for ${s.coverage.measure}, not ${measure}`],
            };
          }
          const total = s.coverage.participants_total;
          return {
            total,
            tail: Math.max(0, total - named),
            amountTotal: s.coverage.amount_total,
            why: named < total ? [`${named} of ${total} accounts are named`] : [],
          };
        },
      ),
    );
  }

  const byTarget = new Map<string, Snapshot['relationships']>();
  for (const r of s.relationships) {
    if (r.type !== 'delegates_to') continue;
    const to = normalise(chain, r.to);
    if (folded(to)) continue;
    const rows = byTarget.get(to);
    if (rows) rows.push(r);
    else byTarget.set(to, [r]);
  }
  for (const [to, rels] of [...byTarget].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const group = build(
      {
        key: `${base}/delegators:${to}`,
        kind: 'delegators',
        measure: 'delegates_to',
        unit: rels[0]?.unit ?? s.coverage.unit,
        title: `Delegators of ${to}`,
        anchor: to,
      },
      rels.map((r) => ({
        id: r.from,
        ...(r.amount !== undefined ? { amount: r.amount } : {}),
        ...(r.amount_raw !== undefined ? { amount_raw: r.amount_raw } : {}),
      })),
      (named, foldedRows) => {
        const tail = foldedRows.reduce((n, [id]) => n + (people.get(id)?.count ?? 1), 0);
        const unstated = rels.filter((r) => r.amount === undefined).length;
        const why = tail > 0 ? [`${named} of ${named + tail} accounts are named`] : [];
        if (unstated > 0) why.push(`${unstated} rows state no amount, so they are not counted`);
        return { total: named + tail, tail, amountTotal: null, why };
      },
    );
    out.push(group);
  }
  return out;
}

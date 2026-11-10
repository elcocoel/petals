// Pieces every tool uses: snapshots by hash, modules by network id, public URLs, schema bits.
import { COMPOSED, exactValues, formatDecimal } from '@petal/core';
import type { NetworkDescriptor, Params, Snapshot, Spec } from '@petal/core/types';
import type { InputModule, SnapshotStore } from '@petal/inputs';
import { ToolFailure } from '../errors.ts';
import type { JSONSchema, ToolContext } from '../types.ts';

// ---------------------------------------------------------------------------------------------
// Schema bits

export const SHA256: JSONSchema = { type: 'string', pattern: '^[0-9a-f]{64}$' };
export const ENTRY_ID: JSONSchema = { type: 'string', pattern: '^[0-9a-f]{24}$' };
export const DATETIME: JSONSchema = { type: 'string', format: 'date-time' };
export const PARAMS: JSONSchema = {
  type: 'object',
  additionalProperties: { type: 'string' },
  description: 'network parameters, e.g. { "dao": "marmaj.sputnik-dao.near" }',
};
export const NETWORK_SCHEMA: JSONSchema = {
  type: 'object',
  required: [
    'id',
    'chain',
    'population',
    'kind',
    'title',
    'params',
    'capabilities',
    'live',
    'cost',
  ],
  properties: {
    id: { type: 'string' },
    chain: { type: 'string' },
    population: { type: 'string' },
    kind: { enum: ['chain', 'protocol', 'dao', 'other'] },
    title: { type: 'string' },
    description: { type: 'string' },
    params: { type: 'object' },
    capabilities: { type: 'object' },
    live: { type: 'boolean' },
    cost: { type: 'object' },
    sources: { type: 'array', items: { type: 'object' } },
  },
};

export const obj = (
  required: string[],
  properties: Record<string, unknown>,
  extra: JSONSchema = {},
): JSONSchema => ({ type: 'object', required, properties, ...extra });

// ---------------------------------------------------------------------------------------------
// Networks

/** "near-validators (NEAR validators), near-house-of-stake (...)" */
export function readable(ctx: ToolContext): string {
  const ids = Object.values(ctx.modules).map((m) => `${m.descriptor.id} (${m.descriptor.title})`);
  return ids.length ? ids.join(', ') : 'no networks yet (no input module is registered)';
}

/** The input module for a network id, or cannot_read naming what Petal can read instead. */
export function moduleFor(ctx: ToolContext, id: string): InputModule {
  const m = ctx.modules[id];
  if (m) return m;
  throw new ToolFailure(
    'cannot_read',
    `Petals can't read the network "${id}" yet.`,
    `Petals can read: ${readable(ctx)}. To ask for new coverage, quote_payment with purpose sponsor_coverage.`,
  );
}

/** The descriptor for a snapshot's network, if a module reads it. */
export function descriptorOf(ctx: ToolContext, s: Snapshot): NetworkDescriptor | null {
  const d = ctx.modules[s.network.id]?.descriptor ?? null;
  if (!d || s.module.id !== COMPOSED) return d;
  // A view over layers (005 seam/v1): what its base reads, plus every measure the layers brought,
  // any of which can be a petal's height.
  const known = new Set(d.capabilities.measures.map((m) => m.id));
  const added = measuresIn(s)
    .filter((m) => !known.has(m.id))
    .map((m) => ({ id: m.id, unit: m.unit, label: m.id.replaceAll('_', ' ') }));
  const height = d.capabilities.by.height ?? [];
  return {
    ...d,
    capabilities: {
      ...d.capabilities,
      measures: [...d.capabilities.measures, ...added],
      by: {
        ...d.capabilities.by,
        height: height.includes('m:<metric>') ? height : [...height, 'm:<metric>'],
      },
    },
  };
}

/** Check params against the descriptor (required, pattern). */
export function checkParams(d: NetworkDescriptor, params: Params | undefined): void {
  const given = params ?? {};
  for (const key of Object.keys(given)) {
    if (!(key in d.params)) {
      const known = Object.keys(d.params);
      throw new ToolFailure(
        'bad_input',
        `${d.id} takes no parameter "${key}".`,
        known.length ? `Parameters: ${known.join(', ')}.` : `${d.id} takes no parameters.`,
      );
    }
  }
  for (const [key, spec] of Object.entries(d.params)) {
    const v = given[key];
    if (v === undefined) {
      if (spec.required) {
        throw new ToolFailure(
          'bad_input',
          `${d.id} needs the parameter "${key}": ${spec.description}`,
          spec.example ? `For example ${key}=${spec.example}.` : undefined,
        );
      }
      continue;
    }
    if (spec.pattern && !new RegExp(spec.pattern).test(v)) {
      throw new ToolFailure(
        'bad_input',
        `"${v}" is not a valid ${key} for ${d.id}.`,
        spec.example ? `For example ${key}=${spec.example}.` : `It must match ${spec.pattern}.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Snapshots (immutable by hash, so a few are kept in memory per store)

const MEMO_SIZE = 3;
const memo = new WeakMap<SnapshotStore, Map<string, Promise<Snapshot | null>>>();

export async function findSnapshot(ctx: ToolContext, sha256: string): Promise<Snapshot | null> {
  let m = memo.get(ctx.store);
  if (!m) {
    m = new Map();
    memo.set(ctx.store, m);
  }
  let p = m.get(sha256);
  if (p) {
    m.delete(sha256);
    m.set(sha256, p);
    return p;
  }
  p = ctx.store.get(sha256);
  m.set(sha256, p);
  if (m.size > MEMO_SIZE) m.delete(m.keys().next().value as string);
  const s = await p.catch((err) => {
    m.delete(sha256);
    throw err;
  });
  if (!s) m.delete(sha256);
  return s;
}

export async function loadSnapshot(ctx: ToolContext, sha256: string): Promise<Snapshot> {
  const s = await findSnapshot(ctx, sha256);
  if (s) return s;
  throw new ToolFailure(
    'not_found',
    `No snapshot ${sha256} in the fixtures, the cache or the map.`,
    'get_snapshot returns the sha256 of a snapshot Petals holds.',
  );
}

/** The measures present in a snapshot's holdings, in first-seen order. */
export function measuresIn(s: Snapshot): { id: string; unit: string }[] {
  const seen = new Map<string, string>();
  for (const h of s.holdings) if (!seen.has(h.measure)) seen.set(h.measure, h.unit);
  return [...seen].map(([id, unit]) => ({ id, unit }));
}

/** The measure a flower uses when none is chosen. */
export function defaultMeasure(s: Snapshot, d: NetworkDescriptor | null): string {
  const present = measuresIn(s).map((m) => m.id);
  const candidates = [
    d?.capabilities.defaults.measure,
    d?.capabilities.measures[0]?.id,
    s.coverage.measure,
  ];
  for (const c of candidates) if (c && present.includes(c)) return c;
  return present[0] ?? s.coverage.measure ?? '';
}

/** What a read left out, as figures say it: how much, of what whole, and that it's no holder. */
export interface NotRead {
  amount: string;
  whole: string;
  share_of_whole: number;
  says: string;
}

/**
 * The rows that stand for what a read did not read: group participants that hold exactly the part of
 * the total its coverage says it didn't include (a window of holders: "supply not read"). They're no
 * holder, so figures leave them out of shares, top-k and the Nakamoto coefficient, and say how much of
 * the whole was read. The drawing keeps them: a petal saying how much wasn't read is honest there.
 */
export function notReadIn(
  s: Snapshot,
  measure: string,
): { ids: Set<string>; notRead: NotRead } | null {
  const c = s.coverage;
  if (c.measure !== measure || !c.amount_total || !c.amount_included) return null;
  const groups = new Set(s.participants.filter((p) => p.kind === 'group').map((p) => p.id));
  const rows = s.holdings.filter((h) => h.measure === measure && groups.has(h.participant));
  if (rows.length === 0) return null;
  const { values, scale } = exactValues([
    { amount: c.amount_total },
    { amount: c.amount_included },
    ...rows.map((r) => ({ amount: r.amount })),
  ]);
  const [whole = 0n, included = 0n, ...amounts] = values;
  const missing = whole - included;
  if (missing <= 0n || amounts.reduce((a, v) => a + v, 0n) !== missing) return null;
  const share = Number((missing * 2_000_000n + whole) / (2n * whole)) / 1e6;
  const pct = (x: number) => `${Math.round(x * 10000) / 100}%`;
  const unit = c.unit ? ` ${c.unit}` : '';
  return {
    ids: new Set(rows.map((r) => r.participant)),
    notRead: {
      amount: formatDecimal(missing, scale),
      whole: formatDecimal(whole, scale),
      share_of_whole: share,
      says: `Shares, top-k and the Nakamoto coefficient are of what was read: ${pct(1 - share)} of the whole ${formatDecimal(whole, scale)}${unit}. The other ${pct(share)} was not read. It is no holder, so no figure here counts it.`,
    },
  };
}

/** The snapshot as figures count it: without the rows that stand for what wasn't read. */
export function withoutNotRead(s: Snapshot, measure: string, ids: Set<string>): Snapshot {
  return {
    ...s,
    holdings: s.holdings.filter((h) => !(h.measure === measure && ids.has(h.participant))),
  };
}

export function checkMeasure(s: Snapshot, measure: string): void {
  const present = measuresIn(s).map((m) => m.id);
  if (present.includes(measure)) return;
  throw new ToolFailure(
    'bad_input',
    `The snapshot has no measure "${measure}".`,
    `Measures in this snapshot: ${present.join(', ') || 'none'}.`,
  );
}

// ---------------------------------------------------------------------------------------------
// Public URLs (Config.apiBase; relative when unset)

export function base(ctx: ToolContext): string {
  return (ctx.config.apiBase ?? '').replace(/\/+$/, '');
}

export const bodyUrl = (ctx: ToolContext, sha256: string) =>
  `${base(ctx)}/api/v1/snapshots/${sha256}`;

export const galleryUrl = (ctx: ToolContext, id: string) => `${base(ctx)}/f/${id}`;

/** The draft view opens a flower from the spec alone: base64url of its canonical JSON. */
export const draftPath = (specJson: string) =>
  `/draft?spec=${Buffer.from(specJson, 'utf8').toString('base64url')}`;

export const viewUrl = (ctx: ToolContext, specJson: string) => `${base(ctx)}${draftPath(specJson)}`;

export function snapshotOf(spec: unknown): string | null {
  const sha = (spec as Partial<Spec> | null)?.snapshot?.sha256;
  return typeof sha === 'string' ? sha : null;
}

// Pieces every tool uses: snapshots by hash, modules by network id, public URLs, schema bits.
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
    `Petal can't read the network "${id}" yet.`,
    `Petal can read: ${readable(ctx)}. To ask for new coverage, quote_payment with purpose sponsor_coverage.`,
  );
}

/** The descriptor for a snapshot's network, if a module reads it. */
export function descriptorOf(ctx: ToolContext, s: Snapshot): NetworkDescriptor | null {
  return ctx.modules[s.network.id]?.descriptor ?? null;
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
    'get_snapshot returns the sha256 of a snapshot Petal holds.',
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
export function viewUrl(ctx: ToolContext, specJson: string): string {
  return `${base(ctx)}/draft?spec=${Buffer.from(specJson, 'utf8').toString('base64url')}`;
}

export function snapshotOf(spec: unknown): string | null {
  const sha = (spec as Partial<Spec> | null)?.snapshot?.sha256;
  return typeof sha === 'string' ? sha : null;
}

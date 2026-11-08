// get_snapshot and describe_snapshot (tools.md). The snapshot body is never returned to an
// agent; describe_snapshot and compute_figures say what is in it.
import { computeFigures, PRIMITIVES } from '@petal/core';
import type {
  At,
  MapIndex,
  Params,
  Snapshot,
  SnapshotRef,
  SnapshotResult,
} from '@petal/core/types';
import { getSnapshot as fetchOrReuse } from '@petal/inputs';
import { mapKeys } from '@petal/near/map';
import { defineTool } from '../define.ts';
import { ToolFailure } from '../errors.ts';
import { limitsOf, takeToday } from '../limits.ts';
import type { ToolContext } from '../types.ts';
import {
  bodyUrl,
  checkParams,
  DATETIME,
  defaultMeasure,
  descriptorOf,
  loadSnapshot,
  measuresIn,
  moduleFor,
  notReadIn,
  obj,
  PARAMS,
  SHA256,
  withoutNotRead,
} from './shared.ts';

/** The shared map as getSnapshot needs it: lookup by block, record a final snapshot. */
export function mapIndex(ctx: ToolContext): MapIndex {
  const { reader, writer, trustedWriters } = ctx.map;
  return {
    async lookup({ chain, population, block_height }) {
      const key = mapKeys.index(chain, population, block_height);
      for (const w of trustedWriters) {
        const row = await reader.get(key, w);
        const sha = (row?.value as { sha256?: unknown } | null)?.sha256;
        if (typeof sha === 'string') return sha;
      }
      return null;
    },
    async record(ref: SnapshotRef) {
      if (!writer) return null;
      // each costs the writer's allowance, so a stranger's fresh reads can't spend it down
      const cap = limitsOf(ctx.config).fingerprintsPerDay;
      if (!takeToday(ctx.config, 'fingerprints', cap, ctx.now())) {
        throw new ToolFailure('rate_limited', `Petal has written ${cap} fingerprints today`);
      }
      const entries: Record<string, unknown> = { [mapKeys.snapshot(ref.sha256)]: ref };
      if (ref.block_height !== null) {
        const key = mapKeys.index(ref.network.chain, ref.network.population, ref.block_height);
        entries[key] = { sha256: ref.sha256 };
      }
      const { tx_hash } = await writer.write(entries);
      return { tx_hash };
    },
  };
}

const AT: Record<string, unknown> = {
  description: '"latest" (default), an ISO date, or { "block_height": n }',
  oneOf: [
    { type: 'string', minLength: 1 },
    {
      type: 'object',
      required: ['block_height'],
      additionalProperties: false,
      properties: { block_height: { type: 'integer', minimum: 0 } },
    },
  ],
};

const COUNTS = obj(['participants', 'holdings', 'relationships', 'events'], {
  participants: { type: 'integer' },
  holdings: { type: 'integer' },
  relationships: { type: 'integer' },
  events: { type: 'integer' },
});

export const getSnapshotTool = defineTool<
  { network: string; params?: Params; at?: At; fresh?: boolean },
  SnapshotResult
>({
  name: 'get_snapshot',
  onTheirMachine: true,
  title: 'Get a snapshot',
  description:
    'Gather or reuse the data for one network at one moment. A final snapshot Petal already ' +
    'holds is returned with reused: true (say so). Returns the sha256 and counts, never the body: ' +
    'use describe_snapshot and compute_figures to read it. A live pull reports progress.',
  input: obj(
    ['network'],
    {
      network: { type: 'string', minLength: 1, description: 'a network id from list_networks' },
      params: PARAMS,
      at: AT,
      fresh: {
        type: 'boolean',
        description: 'skip reuse for data that is not final yet (final data is never re-fetched)',
      },
    },
    { additionalProperties: false },
  ),
  output: obj(
    [
      'sha256',
      'reused',
      'where',
      'network',
      'snapshot',
      'coverage',
      'sources',
      'counts',
      'body_url',
    ],
    {
      sha256: SHA256,
      reused: { type: 'boolean' },
      where: { enum: ['fixture', 'cache', 'map', 'fetched'] },
      network: obj(['id', 'chain', 'population'], {
        id: { type: 'string' },
        chain: { type: 'string' },
        population: { type: 'string' },
      }),
      snapshot: obj(['as_of', 'final'], {
        as_of: DATETIME,
        block_height: { type: 'integer' },
        final: { type: 'boolean' },
      }),
      coverage: { type: 'object' },
      sources: {
        type: 'array',
        items: obj(['id', 'kind', 'url'], {
          id: { type: 'string' },
          kind: { type: 'string' },
          url: { type: 'string' },
        }),
      },
      counts: COUNTS,
      body_url: { type: 'string' },
    },
  ),
  annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
  failure: 'source_failed',
  async run({ network, params, at, fresh }, ctx) {
    checkParams(moduleFor(ctx, network).descriptor, params);
    const req = {
      network,
      ...(params ? { params } : {}),
      ...(at !== undefined ? { at } : {}),
      ...(fresh !== undefined ? { fresh } : {}),
    };
    const deps = {
      store: ctx.store,
      modules: ctx.modules,
      map: mapIndex(ctx),
      ...(ctx.onProgress ? { onProgress: ctx.onProgress } : {}),
      ...(ctx.fresh ? { fresh: ctx.fresh } : {}),
    };
    const result = await fetchOrReuse(req, deps);
    // Tools own public URLs (Config.apiBase), so the body URL is set here.
    return { ...result, body_url: bodyUrl(ctx, result.sha256) };
  },
});

// ---------------------------------------------------------------------------------------------
// describe_snapshot

function coverageNote(s: Snapshot): string {
  const c = s.coverage;
  const parts = [
    `${c.participants_included} of ${c.participants_total} participants included`,
    `${c.amount_included} of ${c.amount_total} ${c.unit}${c.measure ? ` (${c.measure})` : ''}`,
  ];
  for (const g of c.grouped ?? []) {
    parts.push(`grouped: ${g.rule} (${g.rows_folded} rows, ${g.amount} ${c.unit})`);
  }
  if (c.partial) parts.push('partial: some sources failed');
  if (c.note) parts.push(c.note);
  return `${parts.join('. ')}.`;
}

export const describeSnapshot = defineTool<{ sha256: string; top?: number }, object>({
  name: 'describe_snapshot',
  title: 'Describe a snapshot',
  description:
    'What a snapshot holds, to choose a mapping: measures and totals, kinds of account, segment ' +
    'and line options, the top participants with their share, coverage, sources, and which visual ' +
    'primitives this build can draw (unavailable ones are declared, never imitated).',
  input: obj(
    ['sha256'],
    { sha256: SHA256, top: { type: 'integer', minimum: 1, maximum: 50, default: 10 } },
    { additionalProperties: false },
  ),
  output: obj(
    [
      'measures',
      'kinds_present',
      'segment_options',
      'line_options',
      'has_fusions',
      'primitives',
      'top',
      'coverage_note',
      'sources',
    ],
    {
      measures: {
        type: 'array',
        items: obj(['id', 'unit', 'total'], {
          id: { type: 'string' },
          unit: { type: 'string' },
          total: { type: 'string' },
        }),
      },
      kinds_present: { type: 'array', items: { type: 'string' } },
      segment_options: {
        type: 'array',
        items: obj(['by', 'label'], { by: { type: 'string' }, label: { type: 'string' } }),
      },
      line_options: { type: 'array', items: { type: 'string' } },
      has_fusions: { type: 'boolean' },
      primitives: {
        type: 'array',
        items: obj(['id', 'status', 'note'], {
          id: { type: 'string' },
          status: { enum: ['available', 'unavailable'] },
          note: { type: 'string' },
        }),
      },
      top: {
        type: 'array',
        items: obj(['id', 'label', 'kind', 'identity', 'share'], {
          id: { type: 'string' },
          label: { type: 'string' },
          kind: { type: 'string' },
          identity: { type: ['object', 'null'] },
          share: { type: 'number' },
        }),
      },
      coverage_note: { type: 'string' },
      sources: {
        type: 'array',
        items: obj(['id', 'url'], { id: { type: 'string' }, url: { type: 'string' } }),
      },
      not_read: { type: 'object', description: 'what the read left out, as in compute_figures' },
    },
  ),
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  async run({ sha256, top = 10 }, ctx) {
    const s = await loadSnapshot(ctx, sha256);
    const d = descriptorOf(ctx, s);
    const caps = d?.capabilities;
    // Totals and shares come from core's counting, so describe and compute_figures agree.
    const measures = measuresIn(s).map((m) => ({
      id: m.id,
      unit: m.unit,
      total: computeFigures(s, { measure: m.id, petals: 5 }).total,
    }));
    const measure = defaultMeasure(s, d);
    // the same as compute_figures: what wasn't read is no holder, so it isn't among the top
    const left = notReadIn(s, measure);
    const figures = computeFigures(left ? withoutNotRead(s, measure, left.ids) : s, {
      measure,
      petals: Math.max(5, top),
    });
    const byId = new Map(s.participants.map((p) => [p.id, p]));
    const meaning = (p: string, by: string) => caps?.meanings[`${p}:${by}`]?.meaning ?? by;
    return {
      measures,
      kinds_present: [...new Set(s.participants.map((p) => p.kind))].sort(),
      segment_options: (caps?.segments ?? []).map((by) => ({ by, label: meaning('segments', by) })),
      line_options: caps?.by.lines ?? [],
      // Fusions come from evidence rules in Phase B (M7); none are drawn in this build.
      has_fusions: false,
      primitives: PRIMITIVES.map((p) => ({ id: p.id, status: p.status, note: p.note })),
      top: figures.shares.slice(0, top).map((r) => {
        const p = byId.get(r.id);
        return {
          id: r.id,
          label: r.label,
          kind: p?.kind ?? 'unknown',
          identity: p?.identity ?? null,
          share: r.share,
        };
      }),
      coverage_note: coverageNote(s),
      sources: s.sources.map((x) => ({ id: x.id, url: x.url })),
      ...(left ? { not_read: left.notRead } : {}),
    };
  },
});

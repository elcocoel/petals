// validateSpec (data-model.md, Petal spec rules 1-8; FR-026, FR-032). Rule ids in `errors[].rule`:
//   1 schema        the JSON matches the schema
//   2 snapshot      the snapshot given is the one the spec names (hash, moment, network)
//   3 capabilities  the measure is in the holdings; each `by` is in the network's capabilities
//   4 sources       every primitive used, order included, has a meaning and a known source
//   5 width_band    width.max_ratio <= 3, so the polygon keeps its shape
//   6 tail          if petals < participants included, the tail is grouped and declared
//   7 canonical     the spec is plain JSON, so spec_sha256 names exactly what is drawn
//   8 unavailable   no primitive (or `by`) this build marks unavailable
//   interpretation  with an interpretation: it matches its schema, every mapping cites a known
//                   source, and `unknowns` has at least one entry
import type { ErrorObject } from 'ajv';
import { drawable, PRIMITIVES, primitive } from '../primitives.ts';
import { createAjv, schemaId } from '../schema/ajv.ts';
import { holdingMeasures, measureTable, snapshotSha256 } from '../tables.ts';
import type {
  Capabilities,
  Encoding,
  Interpretation,
  OrderEncoding,
  Snapshot,
  Spec,
  SpecPrimitive,
  Validation,
  ValidationIssue,
} from '../types/index.ts';

let ajv: ReturnType<typeof createAjv> | undefined;
function compiled(name: 'spec' | 'interpretation') {
  ajv ??= createAjv();
  const v = ajv.getSchema(schemaId(name));
  if (!v) throw new Error(`${name} schema not registered`);
  return v;
}

/** The primitives a spec can carry, in legend order. */
export const SPEC_PRIMITIVES: SpecPrimitive[] = [
  'width',
  'height',
  'colour',
  'outline',
  'segments',
  'lines',
  'markings',
  'order',
];

const UNAVAILABLE = new Set(PRIMITIVES.filter((p) => p.status === 'unavailable').map((p) => p.id));

/** Which rule a schema error belongs to, so a band of 4 reads as rule 5, not as "schema". */
function ruleOf(e: ErrorObject): string {
  const path = e.instancePath;
  if (/^\/encodings\/width\/max_ratio$/.test(path)) return 'width_band';
  if (e.keyword === 'additionalProperties' && path === '/encodings') {
    const extra = String((e.params as { additionalProperty?: unknown }).additionalProperty);
    if (UNAVAILABLE.has(extra as never)) return 'unavailable';
  }
  if (/^\/encodings\/[a-z]+\/(meaning|sources)(\/|$)/.test(path)) return 'sources';
  if (
    e.keyword === 'required' &&
    /^\/encodings\/[a-z]+$/.test(path) &&
    ['meaning', 'sources'].includes(
      String((e.params as { missingProperty?: unknown }).missingProperty),
    )
  )
    return 'sources';
  return 'schema';
}

function schemaIssues(errors: ErrorObject[] | null | undefined, prefix = ''): ValidationIssue[] {
  return (errors ?? []).map((e) => {
    const { additionalProperty: extra, allowedValues: allowed } = e.params as {
      additionalProperty?: unknown;
      allowedValues?: unknown[];
    };
    const rule = prefix ? 'interpretation' : ruleOf(e);
    // Whoever fixes this (often a model) needs what was expected, not only that it was wrong.
    const detail =
      extra !== undefined ? `: ${String(extra)}` : allowed ? `: ${allowed.join(', ')}` : '';
    const message =
      rule === 'unavailable'
        ? `${String(extra)} is declared in the vocabulary but not available in this build`
        : `${e.message ?? 'invalid'}${detail}`;
    return { path: `${prefix}${e.instancePath}`, rule, message };
  });
}

/** First place a value is not plain JSON (undefined, -0, NaN, a class instance), or null. */
function notPlainJson(x: unknown, path: string): string | null {
  if (x === null || typeof x === 'string' || typeof x === 'boolean') return null;
  if (typeof x === 'number') return Number.isFinite(x) && !Object.is(x, -0) ? null : path;
  if (Array.isArray(x)) {
    for (let i = 0; i < x.length; i++) {
      const bad = notPlainJson(x[i], `${path}/${i}`);
      if (bad !== null) return bad;
    }
    return null;
  }
  if (typeof x === 'object') {
    const proto = Object.getPrototypeOf(x);
    if (proto !== Object.prototype && proto !== null) return path;
    for (const [k, v] of Object.entries(x)) {
      const bad = notPlainJson(v, `${path}/${k}`);
      if (bad !== null) return bad;
    }
    return null;
  }
  return path;
}

type AnyEncoding = Encoding | OrderEncoding;

/** The encodings a spec uses (non-null), in legend order. */
export function usedEncodings(spec: Spec): [SpecPrimitive, AnyEncoding][] {
  const out: [SpecPrimitive, AnyEncoding][] = [];
  for (const p of SPEC_PRIMITIVES) {
    const e = spec.encodings[p];
    if (e) out.push([p, e]);
  }
  return out;
}

function allowedBy(p: SpecPrimitive, by: string, caps: Capabilities, s: Snapshot): boolean {
  const list = caps.by[p] ?? primitive(p)?.by ?? [];
  if (by.startsWith('m:')) {
    const metric = by.slice(2);
    const listed = list.includes(by) || list.includes('m:<metric>');
    return listed && measureTable(s, metric) !== null;
  }
  return list.includes(by);
}

const HEIGHT_SCALES: Record<string, string[]> = {
  share: ['sqrt', 'linear'],
  amount: ['log'],
  equal: ['equal'],
};

export function validateSpec(
  spec: unknown,
  ctx: { snapshot: Snapshot; capabilities: Capabilities; interpretation?: Interpretation },
): Validation {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const err = (path: string, rule: string, message: string) => errors.push({ path, rule, message });
  const warn = (path: string, rule: string, message: string) =>
    warnings.push({ path, rule, message });

  // 1 schema
  const v = compiled('spec');
  if (!v(spec)) return { valid: false, errors: schemaIssues(v.errors), warnings };
  const sp = spec as Spec;
  const s = ctx.snapshot;
  const caps = ctx.capabilities;

  // 7 canonical
  const bad = notPlainJson(sp, '');
  if (bad !== null)
    err(bad || '/', 'canonical', 'not plain JSON (undefined, -0 or a non-plain object)');

  // 2 snapshot
  if (sp.snapshot.sha256 !== snapshotSha256(s))
    err('/snapshot/sha256', 'snapshot', 'the snapshot given does not have this hash');
  if (sp.snapshot.as_of !== s.snapshot.as_of)
    err('/snapshot/as_of', 'snapshot', `the snapshot is as of ${s.snapshot.as_of}`);
  if (sp.snapshot.block_height !== s.snapshot.block_height)
    err(
      '/snapshot/block_height',
      'snapshot',
      `the snapshot is at block ${s.snapshot.block_height ?? 'none'}`,
    );
  for (const k of ['id', 'chain', 'population'] as const)
    if (sp.network[k] !== s.network[k])
      err(`/network/${k}`, 'snapshot', `the snapshot's network ${k} is ${s.network[k]}`);

  // 3 capabilities: the measure
  const table = measureTable(s, sp.selection.measure);
  if (!table)
    err(
      '/selection/measure',
      'capabilities',
      `${sp.selection.measure} is not in the snapshot's holdings (${holdingMeasures(s)
        .map((m) => m.id)
        .join(', ')})`,
    );
  else if (caps.measures.length && !caps.measures.some((m) => m.id === sp.selection.measure))
    warn('/selection/measure', 'capabilities', 'measure not listed in the network capabilities');

  const known = new Set([
    ...s.sources.map((x) => x.id),
    ...(ctx.interpretation?.documents ?? []).map((d) => d.id),
  ]);

  for (const [p, e] of usedEncodings(sp)) {
    const path = `/encodings/${p}`;
    // 8 unavailable
    if (UNAVAILABLE.has(p)) {
      err(path, 'unavailable', `${p} is not available in this build yet; it is never imitated`);
      continue;
    }
    if (!drawable(p, e.by)) {
      err(`${path}/by`, 'unavailable', `${p} by ${e.by} is not available in this build yet`);
      continue;
    }
    // 3 capabilities: by
    if (!allowedBy(p, e.by, caps, s))
      err(
        `${path}/by`,
        'capabilities',
        `${p} by ${e.by} is not in this network's capabilities (${(caps.by[p] ?? []).join(', ') || 'none'})`,
      );
    if (p === 'segments' && !caps.segments.includes(e.by))
      err(`${path}/by`, 'capabilities', `this network has no ${e.by} segments`);
    const scale = (e as Encoding).scale;
    if (p === 'height') {
      const base = e.by.startsWith('m:') ? null : HEIGHT_SCALES[e.by];
      if (base && scale !== undefined && !base.includes(scale))
        err(`${path}/scale`, 'capabilities', `height by ${e.by} uses scale ${base.join(' or ')}`);
    }
    if (
      p === 'width' &&
      e.by === 'share' &&
      scale !== undefined &&
      scale !== 'log' &&
      scale !== 'log-band'
    )
      err(`${path}/scale`, 'capabilities', 'width by share is a log band (scale log)');
    // 4 sources
    const cited = e.sources.filter((id) => known.has(id));
    if (cited.length === 0)
      err(`${path}/sources`, 'sources', `${p} cites no source the snapshot or documents know`);
    else if (cited.length < e.sources.length)
      warn(
        `${path}/sources`,
        'sources',
        `unknown source ids: ${e.sources.filter((id) => !known.has(id)).join(', ')}`,
      );
  }

  // 5 width_band
  const w = sp.encodings.width;
  if (w.max_ratio !== undefined && w.max_ratio > 3)
    err('/encodings/width/max_ratio', 'width_band', 'the widest side is at most 3x the narrowest');
  if (w.by === 'share' && w.max_ratio === undefined)
    warn('/encodings/width/max_ratio', 'width_band', 'no max_ratio: drawn as a 2x band');

  // 6 tail
  if (table && sp.selection.petals < table.rows.length) {
    if (!sp.selection.tail.group)
      err(
        '/selection/tail/group',
        'tail',
        `${table.rows.length - sp.selection.petals} participants would be left out: group them in the tail`,
      );
    else if (sp.selection.tail.label.trim() === '')
      err('/selection/tail/label', 'tail', 'the tail needs a label');
  }

  // interpretation
  const it = ctx.interpretation;
  if (it !== undefined) {
    const vi = compiled('interpretation');
    if (!vi(it)) errors.push(...schemaIssues(vi.errors, '/interpretation'));
    else {
      const used = new Set(usedEncodings(sp).map(([p]) => p as string));
      const mapped = new Set<string>();
      it.mappings.forEach((m, i) => {
        mapped.add(m.primitive);
        if (!m.sources.some((id) => known.has(id)))
          err(
            `/interpretation/mappings/${i}/sources`,
            'interpretation',
            `the mapping for ${m.primitive} cites no known source`,
          );
        if (!used.has(m.primitive))
          warn(
            `/interpretation/mappings/${i}`,
            'interpretation',
            `${m.primitive} is not used by the spec`,
          );
      });
      for (const p of used)
        if (!mapped.has(p))
          warn('/interpretation/mappings', 'interpretation', `no mapping explains ${p}`);
      if (it.unknowns.length === 0)
        err(
          '/interpretation/unknowns',
          'interpretation',
          'say at least one thing Petals cannot know',
        );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

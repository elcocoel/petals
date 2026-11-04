// Doubles for @petal/core's counting, conventions, validation and renderer (W1 stubs), only
// precise enough for the tools' contract tests: deterministic, schema-valid output. Not a
// reference for what W1 builds. See fallback.ts for how they are wired.
import type {
  Capabilities,
  Encoding,
  Figures,
  Interpretation,
  NetworkDescriptor,
  ProposeInput,
  RenderOptions,
  RenderResult,
  Snapshot,
  Spec,
  Validation,
  ValidationIssue,
} from '@petal/core/types';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { realOrFake } from './fallback.ts';

type Core = typeof import('@petal/core');

const SCALE = 10n ** 30n;
function dec(s: string): bigint {
  const [i = '0', f = ''] = s.split('.');
  return BigInt(i) * SCALE + BigInt((f + '0'.repeat(30)).slice(0, 30));
}
function undec(v: bigint): string {
  const i = v / SCALE;
  const f = (v % SCALE).toString().padStart(30, '0').replace(/0+$/, '');
  return f ? `${i}.${f}` : `${i}`;
}
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

export function coreFakes(core: Core) {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormatsModule.default(ajv);
  const checkSpec = ajv.compile(core.schemas.spec);
  const checkInterp = ajv.compile(core.schemas.interpretation);

  function computeFigures(
    s: Snapshot,
    opts: { measure: string; petals?: number; nakamotoThreshold?: number; topK?: number[] },
  ): Figures {
    const { measure, petals = 60, topK = [1, 5, 10, 100] } = opts;
    const sums = new Map<string, bigint>();
    let unit = '';
    for (const h of s.holdings) {
      if (h.measure !== measure) continue;
      sums.set(h.participant, (sums.get(h.participant) ?? 0n) + dec(h.amount));
      unit = h.unit;
    }
    const label = new Map(s.participants.map((p) => [p.id, p.label]));
    const rows = [...sums]
      .filter(([, a]) => a > 0n)
      .sort((a, b) => (a[1] === b[1] ? (a[0] < b[0] ? -1 : 1) : b[1] > a[1] ? 1 : -1));
    const total = rows.reduce((t, [, a]) => t + a, 0n);
    const share = (a: bigint) => (total === 0n ? 0 : Number((a * 10n ** 12n) / total) / 1e12);
    const shares = rows.map(([id, a], i) => ({ id, a, s: share(a), rank: i + 1 }));
    const threshold =
      opts.nakamotoThreshold ?? (s.network.chain.startsWith('near:') ? 1 / 3 : 1 / 2);
    let cum = 0;
    let count = 0;
    for (const r of shares) {
      cum += r.s;
      count += 1;
      if (cum > threshold) break;
    }
    const n = shares.length;
    const asc = shares.map((r) => r.s).reverse();
    const gini =
      n === 0
        ? 0
        : asc.reduce((g, x, i) => g + (2 * (i + 1) - n - 1) * x, 0) /
          (n * asc.reduce((a, b) => a + b, 0) || 1);
    const rest = rows.slice(petals);
    const restAmount = rest.reduce((t, [, a]) => t + a, 0n);
    return {
      measure,
      unit,
      total: undec(total),
      participants_total: s.coverage.participants_total,
      participants_included: n,
      shares: shares.slice(0, petals).map((r) => ({
        id: r.id,
        label: label.get(r.id) ?? r.id,
        amount: undec(r.a),
        share: r6(r.s),
        rank: r.rank,
      })),
      top_k_share: Object.fromEntries(
        topK.map((k) => [String(k), r6(shares.slice(0, k).reduce((t, r) => t + r.s, 0))]),
      ),
      nakamoto: { threshold: r6(threshold), count },
      hhi: r6(shares.reduce((t, r) => t + r.s * r.s, 0)),
      gini: r6(gini),
      tail: { count: rest.length, amount: undec(restAmount), share: r6(share(restAmount)) },
      fusions: [],
      figure_ids: [
        'fig:total',
        'fig:shares',
        'fig:nakamoto',
        'fig:hhi',
        'fig:gini',
        'fig:tail',
        ...topK.map((k) => `fig:top_k_share.${k}`),
      ],
    };
  }

  function buildSpec(
    input: ProposeInput,
    d: NetworkDescriptor,
    s: Snapshot,
  ): { spec: Spec; changed: string[]; defaults: string[] } {
    const conv = core.DEFAULT_CONVENTION;
    const caps = d.capabilities;
    const c = input.choices ?? {};
    const fallbackSource = s.sources[0]?.id ?? 'unknown';
    const enc = (p: string, e: Omit<Encoding, 'sources'>): Encoding => {
      const m = caps.meanings[`${p}:${e.by}`];
      const meaning = (input.meanings as Record<string, string> | undefined)?.[p];
      return {
        ...e,
        meaning: meaning ?? m?.meaning ?? e.meaning,
        sources: (m?.sources as Encoding['sources']) ?? [fallbackSource],
      };
    };
    const ratio = { 'r1.5': 1.5, r2: 2, r3: 3 } as const;
    const width =
      c.width === 'equal'
        ? enc('width', { by: 'equal', scale: 'equal', meaning: 'every petal the same width' })
        : enc('width', {
            by: 'share',
            scale: 'log',
            max_ratio: ratio[c.width ?? 'r2'],
            meaning: conv.encodings.width.meaning,
          });
    const h = c.height ?? 'sqrt';
    const height = enc(
      'height',
      h === 'equal'
        ? { by: 'equal', scale: 'equal', meaning: 'every bar the same height' }
        : h === 'log'
          ? { by: 'amount', scale: 'log', meaning: 'amount, on a log scale' }
          : h.startsWith('m:')
            ? { by: h, scale: 'linear', meaning: `the metric ${h.slice(2)}` }
            : {
                by: 'share',
                scale: h as 'sqrt' | 'linear',
                meaning: conv.encodings.height.meaning,
              },
    );
    const colourBy = c.colour ?? 'kind';
    const segBy = c.segments ?? caps.defaults.segments ?? 'none';
    const spec: Spec = {
      petal: 'spec/v1',
      network: {
        id: d.id,
        chain: s.network.chain,
        population: s.network.population,
        ...(input.params ? { params: input.params } : {}),
      },
      snapshot: {
        sha256: input.sha256,
        as_of: s.snapshot.as_of,
        ...(s.snapshot.block_height !== undefined ? { block_height: s.snapshot.block_height } : {}),
      },
      labels: 'none',
      selection: {
        measure: c.measure ?? caps.defaults.measure ?? caps.measures[0]?.id ?? '',
        petals: c.petals ?? caps.defaults.petals ?? conv.petals,
        tail: { ...conv.tail },
      },
      encodings: {
        width,
        height,
        colour: enc('colour', { by: colourBy, meaning: `colour by ${colourBy}` }),
        outline:
          c.outline === 'none'
            ? null
            : enc('outline', {
                by: 'identity_status',
                meaning: conv.encodings.outline?.meaning ?? 'identity',
              }),
        segments:
          segBy === 'none' ? null : enc('segments', { by: segBy, meaning: `segments: ${segBy}` }),
        order: (() => {
          const by = c.order ?? 'measure_desc';
          const e = enc('order', { by, meaning: conv.encodings.order.meaning });
          return { by, meaning: e.meaning, sources: e.sources };
        })(),
      },
      convention: { id: conv.id, variation_of: input.variation_of ?? null, changes: [] },
    };
    const changed = Object.keys(c).sort();
    const defaults = [
      'measure',
      'petals',
      'width',
      'height',
      'colour',
      'outline',
      'segments',
      'order',
    ].filter((k) => !changed.includes(k));
    return { spec, changed, defaults };
  }

  function validateSpec(
    spec: unknown,
    ctx: { snapshot: Snapshot; capabilities: Capabilities; interpretation?: Interpretation },
  ): Validation {
    const errors: ValidationIssue[] = [];
    if (!checkSpec(spec)) {
      for (const e of checkSpec.errors ?? []) {
        errors.push({
          path: e.instancePath || '/',
          rule: 'schema',
          message: e.message ?? 'schema',
        });
      }
      return { valid: false, errors, warnings: [] };
    }
    const sp = spec as Spec;
    const measures = new Set(ctx.snapshot.holdings.map((h) => h.measure));
    if (!measures.has(sp.selection.measure)) {
      errors.push({ path: '/selection/measure', rule: 'measure', message: 'not in the snapshot' });
    }
    if ((sp.encodings.width.max_ratio ?? 1) > 3) {
      errors.push({ path: '/encodings/width/max_ratio', rule: 'width_band', message: 'over 3' });
    }
    const known = new Set(ctx.snapshot.sources.map((x) => x.id));
    for (const [p, e] of Object.entries(sp.encodings)) {
      if (!e) continue;
      for (const src of e.sources) {
        if (!known.has(src)) {
          errors.push({
            path: `/encodings/${p}/sources`,
            rule: 'source',
            message: `unknown ${src}`,
          });
        }
      }
      const unavailable = core.PRIMITIVES.find((x) => x.id === p && x.status === 'unavailable');
      if (unavailable) errors.push({ path: `/encodings/${p}`, rule: 'unavailable', message: p });
    }
    if (ctx.interpretation !== undefined && !checkInterp(ctx.interpretation)) {
      for (const e of checkInterp.errors ?? []) {
        errors.push({
          path: `/interpretation${e.instancePath}`,
          rule: 'interpretation',
          message: e.message ?? 'interpretation',
        });
      }
    }
    return { valid: errors.length === 0, errors, warnings: [] };
  }

  function renderFlower(spec: Spec, s: Snapshot, o: RenderOptions = {}): RenderResult {
    const v = validateSpec(spec, { snapshot: s, capabilities: {} as Capabilities });
    if (!v.valid) throw new Error(`renderFlower: invalid spec (${v.errors[0]?.message})`);
    const size = o.size ?? 800;
    const f = computeFigures(s, { measure: spec.selection.measure, petals: spec.selection.petals });
    const paths = f.shares
      .map(
        (r, i) =>
          `<path class="petal-seg" data-p="${r.id}" data-i="${i}" d="M0 0L${(r.share * size).toFixed(2)} ${i}Z"/>`,
      )
      .join('');
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" ` +
      `aria-label="${s.network.title}" data-petal="render/v1" data-spec="${core.specHash(spec)}">${paths}</svg>`;
    const legend = Object.entries(spec.encodings)
      .filter(([, e]) => e)
      .map(([p, e]) => ({
        primitive: p as RenderResult['legend'][number]['primitive'],
        meaning: (e as Encoding).meaning,
        sources: [...(e as Encoding).sources],
      }));
    const byId = new Map(s.participants.map((p) => [p.id, p]));
    const petals = f.shares.map((r, i) => ({
      index: i,
      id: r.id,
      label: r.label,
      kind: byId.get(r.id)?.kind ?? 'unknown',
      identity: byId.get(r.id)?.identity ?? null,
      amount: r.amount,
      share: r.share,
      rank: r.rank,
      values: [{ primitive: 'width', value: r.share, explains: 'share of the measure' }],
    }));
    return { svg, legend, petals, render_sha256: core.sha256Hex(svg) };
  }

  return { computeFigures, buildSpec, validateSpec, renderFlower };
}

/** The @petal/core module with its stubs backed by the doubles (vi.mock factory). */
export function mockCore(core: Core): Core {
  const fake = coreFakes(core);
  return {
    ...core,
    computeFigures: realOrFake(core.computeFigures, fake.computeFigures),
    buildSpec: realOrFake(core.buildSpec, fake.buildSpec),
    validateSpec: realOrFake(core.validateSpec, fake.validateSpec),
    renderFlower: realOrFake(core.renderFlower, fake.renderFlower),
  };
}

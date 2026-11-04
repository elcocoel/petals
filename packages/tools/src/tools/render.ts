// render_flower (tools.md; renderer.md). Render refuses anything validate_spec rejects.
import { canonicalJson, renderFlower, specHash } from '@petal/core';
import type { Spec } from '@petal/core/types';
import { defineTool } from '../define.ts';
import { ToolFailure } from '../errors.ts';
import { obj, SHA256, viewUrl } from './shared.ts';
import { checkSpec, summarise } from './specs.ts';

export const LEGEND_ITEM = obj(['primitive', 'meaning', 'sources'], {
  primitive: {
    enum: [
      'width',
      'height',
      'colour',
      'outline',
      'segments',
      'lines',
      'markings',
      'order',
      'tail',
    ],
  },
  meaning: { type: 'string' },
  sources: { type: 'array', items: { type: 'string' } },
  keys: {
    type: 'array',
    items: obj(['swatch', 'label'], { swatch: { type: 'string' }, label: { type: 'string' } }),
  },
});

export const PETAL_DETAIL = obj(
  ['index', 'id', 'label', 'kind', 'identity', 'amount', 'share', 'rank', 'values'],
  {
    index: { type: 'integer' },
    id: { type: 'string' },
    label: { type: 'string' },
    kind: { type: 'string' },
    identity: { type: ['object', 'null'] },
    amount: { type: 'string' },
    share: { type: 'number' },
    rank: { type: 'integer' },
    values: {
      type: 'array',
      items: obj(['primitive', 'value', 'explains'], {
        primitive: { type: 'string' },
        value: { type: ['string', 'number'] },
        explains: { type: 'string' },
      }),
    },
    segments: { type: 'array', items: { type: 'object' } },
    interactions: { type: 'array', items: { type: 'object' } },
    count: { type: 'integer' },
  },
);

export const renderFlowerTool = defineTool<
  { spec: Spec; include_svg?: boolean; size?: number },
  object
>({
  name: 'render_flower',
  title: 'Render a flower',
  description:
    'Draw a valid spec as a deterministic SVG. Returns the render hash, the legend (one line per ' +
    'primitive used), the petal details and a view_url that opens the draft on the site. The SVG ' +
    'is included only with include_svg: true. Refuses a spec validate_spec rejects (invalid_spec).',
  input: obj(
    ['spec'],
    {
      spec: { type: 'object', description: 'a valid spec (spec/v1)' },
      include_svg: { type: 'boolean', default: false },
      size: { type: 'integer', minimum: 64, maximum: 4096, default: 800 },
    },
    { additionalProperties: false },
  ),
  output: obj(['spec_sha256', 'render_sha256', 'legend', 'petals', 'view_url'], {
    spec_sha256: SHA256,
    render_sha256: SHA256,
    svg: { type: 'string' },
    legend: { type: 'array', items: LEGEND_ITEM },
    petals: { type: 'array', items: PETAL_DETAIL },
    view_url: { type: 'string' },
  }),
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  async run({ spec, include_svg = false, size }, ctx) {
    const { validation, snapshot } = await checkSpec(ctx, spec);
    if (!validation.valid || !snapshot) {
      throw new ToolFailure(
        'invalid_spec',
        `The spec is not valid: ${summarise(validation)}`,
        'validate_spec lists every error; propose_spec builds a valid spec.',
      );
    }
    const r = renderFlower(spec, snapshot, size !== undefined ? { size } : {});
    return {
      spec_sha256: specHash(spec),
      render_sha256: r.render_sha256,
      ...(include_svg ? { svg: r.svg } : {}),
      legend: r.legend,
      petals: r.petals,
      view_url: viewUrl(ctx, canonicalJson(spec)),
    };
  },
});

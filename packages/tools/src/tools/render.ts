// render_flower (tools.md; renderer.md). Render refuses anything validate_spec rejects.
import { canonicalJson, readFlower, renderFlower, schemas, specHash } from '@petal/core';
import type { Spec, View } from '@petal/core/types';
import { compile, defineTool, describeErrors } from '../define.ts';
import { putSpecBody } from '../drafts.ts';
import { ToolFailure } from '../errors.ts';
import { base, obj, SHA256, viewUrl } from './shared.ts';
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

/** A view (view/v1, specs/006-the-map/contracts/view.md), checked against its schema. */
const checkView = compile(schemas.view as Record<string, unknown>);

export const renderFlowerTool = defineTool<
  { spec: Spec; include_svg?: boolean; include_reading?: boolean; size?: number; view?: View },
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
      include_reading: {
        type: 'boolean',
        default: false,
        description: 'also return reading: the title and petals readFlower reads from this spec',
      },
      size: { type: 'integer', minimum: 64, maximum: 4096, default: 800 },
      view: {
        type: 'object',
        description:
          "the viewer's view (view/v1): which piece of data each dimension shows. Without one, the spec's own choices are drawn",
      },
    },
    { additionalProperties: false },
  ),
  output: obj(['spec_sha256', 'render_sha256', 'legend', 'petals', 'view_url'], {
    spec_sha256: SHA256,
    render_sha256: SHA256,
    svg: { type: 'string' },
    reading: obj(['title', 'petals'], {
      title: { type: 'string' },
      petals: { type: 'array', items: { type: 'object' } },
    }),
    legend: { type: 'array', items: LEGEND_ITEM },
    petals: { type: 'array', items: PETAL_DETAIL },
    view_url: { type: 'string' },
    short_url: { type: 'string' },
  }),
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  async run({ spec, include_svg = false, include_reading = false, size, view }, ctx) {
    if (view !== undefined && !checkView(view)) {
      throw new ToolFailure(
        'bad_input',
        `The view is not a valid view/v1: ${describeErrors(checkView.errors)}`,
        'A view names a piece of data, or null, for each of the nine dimensions (specs/006-the-map/contracts/view.md).',
      );
    }
    const { validation, snapshot } = await checkSpec(ctx, spec);
    if (!validation.valid || !snapshot) {
      throw new ToolFailure(
        'invalid_spec',
        `The spec is not valid: ${summarise(validation)}`,
        'validate_spec lists every error; propose_spec builds a valid spec.',
      );
    }
    const r = renderFlower(spec, snapshot, {
      ...(size !== undefined ? { size } : {}),
      ...(view ? { view } : {}),
    });
    const stored = await putSpecBody(ctx.config, spec, ctx.now().toISOString());
    // renderFlower reads the same thing and keeps it to itself, so this is only paid for when asked.
    const reading = include_reading ? readFlower(spec, snapshot, view) : null;
    return {
      spec_sha256: specHash(spec),
      render_sha256: r.render_sha256,
      ...(include_svg ? { svg: r.svg } : {}),
      ...(reading ? { reading: { title: reading.title, petals: reading.petals } } : {}),
      legend: r.legend,
      petals: r.petals,
      view_url: viewUrl(ctx, canonicalJson(spec)),
      ...(stored ? { short_url: `${base(ctx)}/d/${stored}` } : {}),
    };
  },
});

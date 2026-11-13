// render_flower (tools.md; renderer.md). Render refuses anything validate_spec rejects.
import {
  canonicalJson,
  DEFAULT_VIEW,
  mapOf,
  namePieces,
  readFlower,
  renderFlower,
  specHash,
  typePieces,
  valuePieces,
  viewProblem,
} from '@petal/core';
import type { Spec, View } from '@petal/core/types';
import { activityOf } from '../activity.ts';
import { defineTool } from '../define.ts';
import { putSpecBody } from '../drafts.ts';
import { ToolFailure } from '../errors.ts';
import { valuesOf } from '../value-store.ts';
import { vestingOf } from '../vesting.ts';
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

export const renderFlowerTool = defineTool<
  { spec: Spec; include_svg?: boolean; include_reading?: boolean; size?: number; view?: View },
  object
>({
  name: 'render_flower',
  title: 'Render a flower',
  description:
    'Draw a valid spec as a deterministic SVG. Returns the render hash, the legend (one line per ' +
    'primitive used), the petal details, how many petals were drawn (petals_drawn) and a view_url that ' +
    'opens the draft on the site. With no petals, nothing_drawn says why and which measures someone ' +
    'holds: never say petals are drawn then; say so plainly and draw by one of those. The SVG ' +
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
          "the viewer's view (view/v2, or a view/v1): which piece of data each dimension shows. Without one, the viewer's own, or the default: never the spec's own choices",
      },
    },
    { additionalProperties: false },
  ),
  output: obj(['spec_sha256', 'render_sha256', 'legend', 'petals', 'petals_drawn', 'view_url'], {
    spec_sha256: SHA256,
    render_sha256: SHA256,
    petals_drawn: { type: 'integer', minimum: 0, description: 'how many petals the flower has' },
    nothing_drawn: obj(['measure', 'says', 'measures_held'], {
      measure: { type: 'string' },
      says: { type: 'string' },
      measures_held: {
        type: 'array',
        items: { type: 'string' },
        description: "the reading's measures someone holds: draw by one of these instead",
      },
    }),
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
    // A view says its version and is checked by it (view/v1 and view/v2 both read): core's one check.
    const problem = view === undefined ? null : viewProblem(view);
    if (problem) {
      throw new ToolFailure(
        'bad_input',
        `The view is not a valid view: ${problem}`,
        'A view names a piece of data, or null, for each of its dimensions (specs/006-the-map/contracts/view.md).',
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
    // Always through a view: the one given, or the viewer's, or the default. A
    // flower's own choices are the record of what its agent proposed, and never draw it.
    const drawWith = view ?? ctx.view ?? DEFAULT_VIEW;
    // the viewer's own names, on the petals they name; a visitor's are none
    // and each petal's value in dollars, from its map's stored value: none with no price
    const pieces = [
      ...(ctx.names?.length ? namePieces(snapshot, ctx.names) : []),
      ...(ctx.names?.length ? typePieces(snapshot, ctx.names) : []),
      ...valuePieces(snapshot, (await valuesOf(ctx)).get(mapOf(snapshot)) ?? null),
      // and each petal's activity in its map's proposals (activity.ts)
      ...(await activityOf(ctx, snapshot)),
      // and each petal's vesting at the reading's date (vesting.ts)
      ...(await vestingOf(ctx, snapshot)),
    ];
    const r = renderFlower(spec, snapshot, {
      ...(size !== undefined ? { size } : {}),
      view: drawWith,
      ...(pieces.length ? { pieces } : {}),
    });
    const stored = await putSpecBody(ctx.config, spec, ctx.now().toISOString());
    // renderFlower reads the same thing and keeps it to itself, so this is only paid for when asked.
    const reading = include_reading ? readFlower(spec, snapshot, drawWith, pieces) : null;
    // no petals: nobody in the reading holds the measure it's drawn by; say which measures someone does hold
    const measure = spec.selection.measure;
    const held = [
      ...new Set(
        snapshot.holdings
          .filter((h) => h.measure !== measure && /[1-9]/.test(String(h.amount)))
          .map((h) => h.measure),
      ),
    ].sort();
    return {
      spec_sha256: specHash(spec),
      render_sha256: r.render_sha256,
      petals_drawn: r.petals.length,
      ...(r.petals.length === 0
        ? {
            nothing_drawn: {
              measure,
              says: `Nobody in this reading holds any ${measure}, so the flower has no petals.`,
              measures_held: held,
            },
          }
        : {}),
      ...(include_svg ? { svg: r.svg } : {}),
      ...(reading ? { reading: { title: reading.title, petals: reading.petals } } : {}),
      legend: r.legend,
      petals: r.petals,
      view_url: viewUrl(ctx, canonicalJson(spec)),
      ...(stored ? { short_url: `${base(ctx)}/d/${stored}` } : {}),
    };
  },
});

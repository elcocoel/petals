// compute_figures (tools.md; data-model.md, Figures). The tools count, the agent only quotes
// (FR-025): core's computeFigures does the counting.
import { computeFigures } from '@petal/core';
import type { Figures } from '@petal/core/types';
import { defineTool } from '../define.ts';
import type { NotRead } from './shared.ts';
import { checkMeasure, loadSnapshot, notReadIn, obj, SHA256, withoutNotRead } from './shared.ts';

const SHARE_ROW = obj(['id', 'label', 'amount', 'share', 'rank'], {
  id: { type: 'string' },
  label: { type: 'string' },
  amount: { type: 'string' },
  share: { type: 'number' },
  rank: { type: 'integer' },
});

export const FIGURES_SCHEMA = obj(
  [
    'measure',
    'unit',
    'total',
    'participants_total',
    'participants_included',
    'shares',
    'top_k_share',
    'nakamoto',
    'hhi',
    'gini',
    'tail',
    'fusions',
    'figure_ids',
  ],
  {
    measure: { type: 'string' },
    unit: { type: 'string' },
    total: { type: 'string' },
    participants_total: { type: 'integer' },
    participants_included: { type: 'integer' },
    shares: { type: 'array', items: SHARE_ROW },
    top_k_share: { type: 'object', additionalProperties: { type: 'number' } },
    nakamoto: obj(['threshold', 'count'], {
      threshold: { type: 'number' },
      count: { type: 'integer' },
    }),
    hhi: { type: 'number' },
    gini: { type: 'number' },
    tail: obj(['count', 'amount', 'share'], {
      count: { type: 'integer' },
      amount: { type: 'string' },
      share: { type: 'number' },
    }),
    fusions: { type: 'array', items: { type: 'object' } },
    figure_ids: { type: 'array', items: { type: 'string' } },
    // additive (T394): what the read left out, which no figure counts as a holder
    not_read: obj(['amount', 'whole', 'share_of_whole', 'says'], {
      amount: { type: 'string' },
      whole: { type: 'string' },
      share_of_whole: { type: 'number' },
      says: { type: 'string' },
    }),
  },
);

export const computeFiguresTool = defineTool<
  {
    sha256: string;
    measure: string;
    petals?: number;
    nakamoto_threshold?: number;
    top_k?: number[];
  },
  Figures | (Figures & { not_read: NotRead })
>({
  name: 'compute_figures',
  title: 'Compute figures',
  description:
    'Count power in a snapshot for one measure: total, shares and ranks of the top petals, top-k ' +
    'share, the Nakamoto coefficient (threshold stated), HHI, Gini over included participants, ' +
    'and the tail. Deterministic. Quote only these numbers, citing their figure ids.',
  input: obj(
    ['sha256', 'measure'],
    {
      sha256: SHA256,
      measure: { type: 'string', minLength: 1 },
      petals: { type: 'integer', minimum: 5, maximum: 300, default: 60 },
      nakamoto_threshold: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 1 },
      top_k: {
        type: 'array',
        items: { type: 'integer', minimum: 1 },
        minItems: 1,
        maxItems: 10,
        default: [1, 5, 10, 100],
      },
    },
    { additionalProperties: false },
  ),
  output: FIGURES_SCHEMA,
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  async run({ sha256, measure, petals, nakamoto_threshold, top_k }, ctx) {
    const s = await loadSnapshot(ctx, sha256);
    checkMeasure(s, measure);
    const left = notReadIn(s, measure);
    const figures = computeFigures(left ? withoutNotRead(s, measure, left.ids) : s, {
      measure,
      petals: petals ?? 60,
      ...(nakamoto_threshold !== undefined ? { nakamotoThreshold: nakamoto_threshold } : {}),
      ...(top_k ? { topK: top_k } : {}),
    });
    if (!left) return figures;
    return {
      ...figures,
      figure_ids: [...figures.figure_ids, 'fig:not_read'],
      not_read: left.notRead,
    };
  },
});

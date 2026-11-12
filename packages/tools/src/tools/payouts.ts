// list_payouts (12 Nov; Elco: "an unopinionated 'payouts from this treasury over period x'"): what a DAO map
// paid out over a period, from the payouts Petals read for it: each payout (from, to, what, how much, when it
// was paid, the proposal and its kind, its dollars that day) and the period's totals. It keeps nothing.
import { payoutsIn } from '@petal/core';
import { defineTool } from '../define.ts';
import { ToolFailure } from '../errors.ts';
import { payoutsOf } from '../payouts.ts';
import { DATETIME, obj } from './shared.ts';

interface Ask {
  map: string;
  since?: string;
  until?: string;
}

export const listPayouts = defineTool<Ask, Record<string, unknown>>({
  name: 'list_payouts',
  title: 'List payouts',
  description:
    "What a DAO map paid out over a period, from the payouts Petals read from the DAO's own chain: each " +
    'payout (from, to, the asset and amount, when it was paid, the proposal that paid it and its kind, and its ' +
    "dollars on that day at DefiLlama's price, null without one), and the period's totals: how many, to how " +
    'many recipients, each asset summed, and the dollars of those priced. since is inclusive, until exclusive, ' +
    'by when each was paid; neither: every payout. A payout is money that left the DAO by a proposal that passed ' +
    "and ran; a proposal's bond coming back isn't one. Read so far for NEAR's Sputnik DAOs.",
  input: obj(
    ['map'],
    {
      map: { type: 'string', minLength: 3, description: "the map's address, its card's id" },
      since: DATETIME,
      until: DATETIME,
    },
    { additionalProperties: false },
  ),
  output: obj(['about', 'source', 'read_at', 'period', 'payouts', 'totals', 'undated'], {
    about: { type: 'string' },
    source: { type: 'object' },
    read_at: { type: 'string' },
    period: obj(['since', 'until'], {
      since: { type: ['string', 'null'] },
      until: { type: ['string', 'null'] },
    }),
    payouts: { type: 'array', items: { type: 'object' } },
    totals: obj(['count', 'recipients', 'usd', 'priced', 'unpriced', 'assets'], {
      count: { type: 'integer', minimum: 0 },
      recipients: { type: 'integer', minimum: 0 },
      usd: { type: 'string' },
      priced: { type: 'integer', minimum: 0 },
      unpriced: { type: 'integer', minimum: 0 },
      assets: { type: 'array', items: { type: 'object' } },
    }),
    undated: { type: 'integer', minimum: 0 },
  }),
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  failure: 'not_found',
  async run({ map, since, until }, ctx) {
    const p = await payoutsOf(ctx, map);
    if (!p)
      throw new ToolFailure(
        'not_found',
        'Petals has read no payouts for that map.',
        "Payouts are read for NEAR's Sputnik DAOs so far.",
      );
    return {
      about: p.about,
      source: p.source,
      read_at: p.read_at,
      ...payoutsIn(p, { ...(since ? { since } : {}), ...(until ? { until } : {}) }),
    };
  },
});

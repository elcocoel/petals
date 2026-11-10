// quote_payment (tools.md; FR-031): a NEAR Intents 1Click quote with dry: true. No deposit
// address, no money moves. A real payment needs Elco's explicit OK and is not built.
import type { QuoteRequest, QuoteResult } from '@petal/core/types';
import { defineTool } from '../define.ts';
import { ToolFailure } from '../errors.ts';
import { DATETIME, obj } from './shared.ts';

export const quotePayment = defineTool<QuoteRequest, QuoteResult>({
  name: 'quote_payment',
  onTheirMachine: true,
  title: 'Quote a payment (dry)',
  description:
    'A dry NEAR Intents quote for sponsoring a refresh of a network, or new coverage of a ' +
    "network Petals can't read yet: amount in, time and fees. Dry only: no deposit address is " +
    'returned and no money moves. Say "Dry quote. Paying is not switched on."',
  input: obj(
    ['purpose'],
    {
      purpose: { enum: ['sponsor_refresh', 'sponsor_coverage'] },
      amount_usd: { type: 'number', exclusiveMinimum: 0, maximum: 1000, default: 1 },
      origin_asset: {
        type: 'string',
        minLength: 1,
        description: '1Click asset id; default Base USDC',
      },
      network: { type: 'string', minLength: 1 },
    },
    { additionalProperties: false },
  ),
  output: obj(
    [
      'dry',
      'amount_in',
      'amount_in_usd',
      'min_amount_in',
      'time_estimate_s',
      'fees',
      'correlation_id',
      'quoted_at',
      'note',
    ],
    {
      dry: { const: true },
      amount_in: { type: 'string' },
      amount_in_usd: { type: 'string' },
      min_amount_in: { type: 'string' },
      time_estimate_s: { type: 'number' },
      fees: { type: 'object', additionalProperties: { type: 'string' } },
      correlation_id: { type: 'string' },
      quoted_at: DATETIME,
      note: { type: 'string' },
    },
  ),
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  failure: 'source_failed',
  async run(req, ctx) {
    if (req.purpose === 'sponsor_refresh' && req.network && !ctx.modules[req.network]) {
      throw new ToolFailure(
        'bad_input',
        `sponsor_refresh needs a network Petals reads; "${req.network}" is not one.`,
        'For a network Petals cannot read yet, use purpose sponsor_coverage.',
      );
    }
    const q = await ctx.quote(req);
    // FR-031: anything that is not a dry quote is refused, whatever the quote source says.
    if (q.dry !== true || 'depositAddress' in q || 'deposit_address' in q) {
      throw new ToolFailure(
        'internal',
        'The quote source returned a non-dry quote; refused (FR-031).',
      );
    }
    return q;
  },
});

// find_voting_blocs: a map's voting blocs over a period,
// for Petals' agent and people's agents. Each pair of accounts that voted on enough of the same proposals and
// alike on enough of them, the blocs they link, and each pair as an inferred claim ready to keep (through
// add_annotation): agreement, never proof of coordination. It keeps nothing itself.
import { BLOCS_DEFAULTS, type BlocsAsk, blocClaims, votingBlocs } from '@petal/core';
import type { Claim } from '@petal/core/types';
import { BLOCS_BY, keptProposals, mapBlocs, shownBlocs } from '../blocs.ts';
import { defineTool } from '../define.ts';
import { ToolFailure } from '../errors.ts';
import { DATETIME, obj } from './shared.ts';

interface Ask extends BlocsAsk {
  map: string;
  pairs?: boolean;
}

const PAIR = obj(['a', 'b', 'shared', 'agreed', 'agreement', 'kappa'], {
  a: { type: 'string' },
  b: { type: 'string' },
  shared: { type: 'integer', minimum: 0 },
  agreed: { type: 'integer', minimum: 0 },
  agreement: { type: 'number', minimum: 0, maximum: 1 },
  kappa: { type: 'number', minimum: -1, maximum: 1 },
});

export const findVotingBlocs = defineTool<Ask, Record<string, unknown>>({
  name: 'find_voting_blocs',
  title: 'Find voting blocs',
  description:
    "A DAO map's voting blocs over a period, from the proposals Petals read for it: each pair of accounts " +
    `that voted on at least min_shared of the same proposals (default ${BLOCS_DEFAULTS.min_shared}) and voted ` +
    `alike on at least min_agreement of them (default ${BLOCS_DEFAULTS.min_agreement}) and beyond what each ` +
    `proposal's split explains by at least min_kappa (default ${BLOCS_DEFAULTS.min_kappa}), and the blocs such ` +
    'pairs link, by when each proposal was submitted (from inclusive, to exclusive; default every proposal). ' +
    'It answers the blocs and how many pairs; with pairs: true, each pair too, and each as an inferred claim ' +
    '(moves_with, grounds synchronised_behaviour) with its proposals as evidence, to keep with add_annotation ' +
    '(ask for a period when a DAO has many voters). Say it as agreement in votes, never as proof they coordinate.',
  input: obj(
    ['map'],
    {
      map: { type: 'string', minLength: 3, description: "the map's address, its card's id" },
      from: DATETIME,
      to: DATETIME,
      min_shared: { type: 'integer', minimum: 1 },
      min_agreement: { type: 'number', minimum: 0, maximum: 1 },
      min_kappa: { type: 'number', minimum: -1, maximum: 1 },
      pairs: { type: 'boolean', description: 'each pair, and each as a claim; default false' },
    },
    { additionalProperties: false },
  ),
  output: obj(['about', 'period', 'method', 'proposals', 'pair_count', 'blocs'], {
    about: { type: 'string' },
    period: obj(['from', 'to'], {
      from: { type: ['string', 'null'] },
      to: { type: ['string', 'null'] },
    }),
    method: obj(['name', 'min_shared', 'min_agreement', 'min_kappa'], {
      name: { const: 'blocs/agreement@2' },
      min_shared: { type: 'integer' },
      min_agreement: { type: 'number' },
      min_kappa: { type: 'number' },
    }),
    proposals: obj(['in_period', 'voted'], {
      in_period: { type: 'integer' },
      voted: { type: 'integer' },
    }),
    pair_count: { type: 'integer', minimum: 0 },
    pairs: { type: 'array', items: PAIR },
    blocs: {
      type: 'array',
      items: obj(['id', 'members', 'pairs'], {
        id: { type: 'string' },
        members: { type: 'array', items: { type: 'string' } },
        pairs: { type: 'integer' },
      }),
    },
    claims: { type: 'array', items: { type: 'object' } },
  }),
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  failure: 'not_found',
  async run({ map, pairs = false, ...ask }, ctx) {
    const shown = await mapBlocs(ctx, map, ask);
    const kept = await keptProposals(ctx, map);
    if (!shown || !kept)
      throw new ToolFailure(
        'not_found',
        'Petals has read no proposals for that map.',
        "Proposals are read for NEAR's Sputnik DAOs and Baal (Moloch v3) DAOs; a map's card says if it has some.",
      );
    if (!pairs) return shownBlocs(shown, false);
    const claims: Claim[] = blocClaims(votingBlocs(kept, ask), {
      by: BLOCS_BY,
      at: ctx.now().toISOString(),
    });
    return { ...shownBlocs(shown, true), claims };
  },
});

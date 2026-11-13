// list_calls (people find work in DAOs, and DAOs find talent): Petals' feed of open calls, as kept from their
// sources (calls.ts), each a calls/v1.
import type { Call, CallKind } from '@petal/core';
import { callsOf } from '../calls.ts';
import { defineTool } from '../define.ts';
import { obj } from './shared.ts';

const KINDS: CallKind[] = [
  'rfp',
  'grants',
  'bounty',
  'hackathon',
  'accelerator',
  'fund',
  'vote',
  'other',
];

export interface ListCallsInput {
  kind?: CallKind;
  q?: string;
  closes_before?: string;
}

/** The calls a feed's filters keep: of one kind, with these words, closing before a time. */
export function filterCalls(calls: readonly Call[], i: ListCallsInput): Call[] {
  const words = (i.q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const before = i.closes_before ? Date.parse(i.closes_before) : null;
  return calls.filter((c) => {
    if (i.kind && c.kind !== i.kind) return false;
    if (before !== null && (!c.closes || Date.parse(c.closes) >= before)) return false;
    const said = `${c.title} ${c.summary ?? ''} ${c.offered_by.name}`.toLowerCase();
    return words.every((w) => said.includes(w));
  });
}

export const listCalls = defineTool<ListCallsInput, object>({
  name: 'list_calls',
  title: 'List open calls',
  description:
    "Petals' feed of open calls: who is paying for work right now, or asking for a vote: RFPs, grants programs, bounties, hackathons, accelerators and funds, read without a key from Karma's program registry, NEAR's Infrastructure Committee, Snapshot for the DAOs Petals maps (their open votes, kind vote), and NEAR's and Arbitrum's forums, whose topics titled RFP, request for proposals or grants program are inferred calls, each with its topic as evidence. Each is a calls/v1, every field as its source says it: a status kept beside its deadline even when they disagree, a budget in the call's own words. Closing soonest first. Filter by kind, by words (in its title, summary or who offers it), or closing before a time.",
  input: obj(
    [],
    {
      kind: { enum: KINDS },
      q: { type: 'string', minLength: 1, maxLength: 200 },
      closes_before: { type: 'string', format: 'date-time' },
    },
    { additionalProperties: false },
  ),
  output: obj(['calls'], {
    calls: { type: 'array', items: { type: 'object' } },
  }),
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  async run(input, ctx) {
    return { calls: filterCalls(await callsOf(ctx), input) };
  },
});

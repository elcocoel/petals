// A Sputnik DAO (AstroDAO) on NEAR (board #93; META's pick, 11 Nov: NEAR's Marketing DAO first): its members,
// the accounts in its policy's roles and every account that voted, each sized by the votes it cast; and its
// proposals with each account's vote (proposals/v1), read keyless from the DAO's own views at one final block.
// Sputnik keeps each vote in its proposal (Approve, Reject or Remove) and no time for it, nor when a proposal
// was decided: closes_at is its policy's proposal period from submission.
import {
  type Outcome,
  PROPOSALS_VERSION,
  type Proposal,
  type Proposals,
  titleOf,
  type Vote,
} from '@petal/core';
import type { NetworkDescriptor, Params, ResolvedAt, Snapshot } from '@petal/core/types';
import { InputError } from '../errors.ts';
import type { InputModule } from '../index.ts';
import { defaultPool, type RpcPool } from '../rpc/pool.ts';
import { archivalFor, resolveNearAt } from './chain.ts';
import { grouped, plainCapabilities } from './plain.ts';
import { paramModule } from './stored.ts';

export const SPUTNIK_DAO_ID = 'sputnik-dao';
export const SPUTNIK_DAO_VERSION = 'near/1';
const PAGE = 100;
const DAO = /^[a-z0-9_-]+\.sputnik-dao\.near$/;

const S = { policy: 'sputnik-policy', proposals: 'sputnik-proposals' };

export const SPUTNIK_DAO_DESCRIPTOR: NetworkDescriptor = {
  id: SPUTNIK_DAO_ID,
  chain: 'near:mainnet',
  population: 'sputnik-dao',
  kind: 'dao',
  title: 'Sputnik DAO members',
  description:
    "Members of a Sputnik DAO (AstroDAO) on NEAR: the accounts in its policy's roles and every account that voted, each by the votes it cast, read from the DAO's own views. Give the DAO's account, e.g. marketing.sputnik-dao.near.",
  params: {
    dao: {
      required: true,
      description: 'the DAO account, <name>.sputnik-dao.near',
      pattern: DAO.source,
      example: 'marketing.sputnik-dao.near',
    },
  },
  capabilities: plainCapabilities({
    measure: { id: 'votes_cast', unit: 'votes', label: 'votes cast' },
    sources: [S.proposals],
    kind: {
      meaning:
        'an account ending .sputnik-dao.near is a DAO; every other account is of unknown kind',
      sources: [S.policy],
    },
    identity: { meaning: 'anonymous: names are not read here', sources: [S.policy] },
  }),
  live: true,
  cost: { calls: 12, seconds: 10, note: 'its policy, then its proposals in pages of 100' },
  sources: [
    { id: S.policy, kind: 'chain', url: 'https://rpc.mainnet.fastnear.com' },
    { id: S.proposals, kind: 'chain', url: 'https://rpc.mainnet.fastnear.com' },
  ],
};

export interface Policy {
  roles: { name: string; kind: 'Everyone' | { Group?: string[]; Member?: unknown } }[];
  proposal_period: string;
}
export interface RawProposal {
  id: number;
  proposer: string;
  description: string;
  kind: Record<string, unknown> | string;
  status: string;
  votes: Record<string, string>;
  submission_time: string;
}

/** What one read of a DAO holds: its policy, every proposal, and the endpoint that answered. */
export interface SputnikRead {
  policy: Policy;
  proposals: RawProposal[];
  endpoint: string;
}

/** A DAO's policy and every proposal, read at one block. */
export async function readSputnik(
  pool: RpcPool,
  dao: string,
  at: ResolvedAt,
): Promise<{ policy: Policy; proposals: RawProposal[]; endpoint: string }> {
  const ref = { block_id: at.block_height };
  const o = archivalFor(at.as_of);
  let endpoint = '';
  const view = async <T>(method: string, args: unknown = {}) => {
    try {
      const r = await pool.view<T>(dao, method, args, ref, o);
      endpoint ||= r.endpoint.url;
      return r.value;
    } catch (e) {
      throw new InputError('source_failed', `${dao}.${method} failed: ${(e as Error).message}`);
    }
  };
  const policy = await view<Policy>('get_policy');
  const last = await view<number>('get_last_proposal_id');
  const proposals: RawProposal[] = [];
  for (let from = 0; from < last; from += PAGE) {
    const page = await view<RawProposal[]>('get_proposals', { from_index: from, limit: PAGE });
    proposals.push(...page);
    if (page.length === 0) break;
  }
  return { policy, proposals, endpoint };
}

const nsToIso = (ns: string | number) => new Date(Number(BigInt(ns) / 1_000_000n)).toISOString();

const OUTCOME: Record<string, Outcome> = {
  Approved: 'passed',
  Rejected: 'rejected',
  Removed: 'removed',
  Expired: 'expired',
  InProgress: 'in progress',
  Failed: 'failed',
  Moved: 'moved',
};
/** Sputnik's three votes: Approve is for; Reject, and Remove (reject and take it away), are against. */
const VOTE: Record<string, Vote> = { Approve: 'for', Reject: 'against', Remove: 'against' };

/** The DAO's proposals as proposals/v1: each with its title, when, outcome and every account's vote. */
export function sputnikProposals(
  about: string,
  dao: string,
  read: { policy: Policy; proposals: RawProposal[]; endpoint: string },
  at: ResolvedAt,
  readAt: string,
): Proposals {
  const period = BigInt(read.policy.proposal_period ?? '0');
  const proposals: Proposal[] = read.proposals.map((p) => ({
    id: String(p.id),
    title: titleOf(p.description),
    kind: typeof p.kind === 'string' ? p.kind : (Object.keys(p.kind)[0] ?? null),
    proposer: p.proposer ?? null,
    at: nsToIso(p.submission_time),
    closes_at: period > 0n ? nsToIso((BigInt(p.submission_time) + period).toString()) : null,
    decided_at: null,
    outcome: OUTCOME[p.status] ?? 'in progress',
    as_said: p.status,
    ref: `proposal:near:mainnet:${dao}:${p.id}`,
    votes: Object.entries(p.votes ?? {}).flatMap(([account, said]) =>
      VOTE[said] ? [{ account, vote: VOTE[said] as Vote, as_said: said, at: null }] : [],
    ),
  }));
  return {
    petal: PROPOSALS_VERSION,
    about,
    source: {
      kind: 'sputnik',
      contract: `near:mainnet:${dao}`,
      ref: `get_policy, get_last_proposal_id and get_proposals {from_index, limit: ${PAGE}} on ${dao} at block ${at.block_height} (final), via ${read.endpoint}`,
      at: at.as_of,
    },
    proposals,
    read_at: readAt,
  };
}

/** The members, as a snapshot: every account in a role or that voted, by the votes it cast. */
export function sputnikSnapshot(
  dao: string,
  read: { policy: Policy; proposals: RawProposal[]; endpoint: string },
  at: ResolvedAt,
): Snapshot {
  const roles = new Map<string, string[]>();
  for (const r of read.policy.roles)
    if (typeof r.kind === 'object' && Array.isArray(r.kind.Group))
      for (const a of r.kind.Group) roles.set(a, [...(roles.get(a) ?? []), r.name]);
  const votes = new Map<string, number>();
  const made = new Map<string, number>();
  for (const p of read.proposals) {
    for (const a of Object.keys(p.votes ?? {})) votes.set(a, (votes.get(a) ?? 0) + 1);
    if (p.proposer) made.set(p.proposer, (made.get(p.proposer) ?? 0) + 1);
  }
  const accounts = [...new Set([...roles.keys(), ...votes.keys()])].sort();
  const participants = accounts.map((id) => ({
    id,
    kind: id.endsWith('.sputnik-dao.near') ? 'organisation' : 'unknown',
    label: id.length > 24 ? `${id.slice(0, 10)}…${id.slice(-10)}` : id,
    source: S.policy,
    identity: null,
  })) as Snapshot['participants'];
  const holdings = accounts.flatMap((id) => [
    {
      participant: id,
      asset: `${dao}:votes`,
      measure: 'votes_cast',
      amount: String(votes.get(id) ?? 0),
      amount_raw: String(votes.get(id) ?? 0),
      unit: 'votes',
      as_of: at.as_of,
      source: S.proposals,
    },
    {
      participant: id,
      asset: `${dao}:proposals`,
      measure: 'proposals_made',
      amount: String(made.get(id) ?? 0),
      amount_raw: String(made.get(id) ?? 0),
      unit: 'proposals',
      as_of: at.as_of,
      source: S.proposals,
    },
  ]) as Snapshot['holdings'];
  const total = [...votes.values()].reduce((a, b) => a + b, 0);
  const pin = `at block_id ${at.block_height} (final)`;
  return {
    petal: 'snapshot/v1',
    network: {
      id: SPUTNIK_DAO_ID,
      chain: 'near:mainnet',
      population: `sputnik-dao-${dao}`,
      title: SPUTNIK_DAO_DESCRIPTOR.title,
      description: SPUTNIK_DAO_DESCRIPTOR.description,
      params: { dao },
    },
    snapshot: { as_of: at.as_of, block_height: at.block_height, final: true },
    coverage: {
      participants_total: accounts.length,
      participants_included: accounts.length,
      amount_total: String(total),
      amount_included: String(total),
      unit: 'votes',
      measure: 'votes_cast',
      note:
        `${grouped(accounts.length)} accounts: ${grouped(roles.size)} in the policy's roles (${read.policy.roles
          .filter((r) => typeof r.kind === 'object')
          .map((r) => r.name)
          .join(
            ', ',
          )}) and every account that voted on any of its ${grouped(read.proposals.length)} proposals. ` +
        "Each is sized by the votes it cast; how each voted, proposal by proposal, is the map's proposals (proposals/v1). " +
        'An account that never voted and holds no role is not here.',
    },
    sources: [
      {
        id: S.policy,
        kind: 'chain',
        url: read.endpoint,
        method: `${dao} get_policy ${pin}`,
        fetched_at: at.as_of,
        block_height: at.block_height,
      },
      {
        id: S.proposals,
        kind: 'chain',
        url: read.endpoint,
        method: `${dao} get_last_proposal_id, get_proposals {from_index, limit: ${PAGE}} ${pin}`,
        fetched_at: at.as_of,
        block_height: at.block_height,
      },
    ],
    participants,
    holdings,
    relationships: [],
    events: [],
    module: { id: SPUTNIK_DAO_ID, version: SPUTNIK_DAO_VERSION },
  };
}

export function sputnikTarget(params: Params | undefined): { dao: string; population: string } {
  const dao = String(params?.dao ?? '')
    .trim()
    .toLowerCase();
  if (!DAO.test(dao))
    throw new InputError('bad_input', 'sputnik-dao needs a dao: <name>.sputnik-dao.near', {
      hint: 'e.g. marketing.sputnik-dao.near',
    });
  return { dao, population: `sputnik-dao-${dao}` };
}

/** Any Sputnik DAO. `fixtures` is the folder holding index.json (default: this repo's). */
export function sputnikDao(opts: { fixtures?: string; rpc?: RpcPool } = {}): InputModule {
  const pool = () => opts.rpc ?? defaultPool();
  return paramModule({
    descriptor: SPUTNIK_DAO_DESCRIPTOR,
    keyFor: (params) => ({ chain: 'near:mainnet', population: sputnikTarget(params).population }),
    pinnable: true,
    head: (_params, block) =>
      resolveNearAt(pool(), block === undefined ? 'latest' : { block_height: block }),
    pull: async (at, params) => {
      const { dao } = sputnikTarget(params);
      return sputnikSnapshot(dao, await readSputnik(pool(), dao, at), at);
    },
    ...(opts.fixtures ? { fixtures: opts.fixtures } : {}),
  });
}

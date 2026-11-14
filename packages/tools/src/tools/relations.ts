// account_groups, shared_accounts, related_groups, relations_overview, power_path (T198, tools.md).
// Read-only over public data, and free of sign-in. The first call builds <stateDir>/index.db from
// what's stored; a missing or corrupt file rebuilds rather than fails. What a result does and doesn't
// mean is in the description and in the result, because each door shows one or the other.
import {
  DEFAULT_BUDGET,
  DEFAULT_MAX_DEPTH,
  type GroupKind,
  MAX_BUDGET,
  MAX_DEPTH,
  type Queries,
  RelationsError,
  stateIndex,
} from '@petal/relations';
import { defineTool, type ToolAnnotations } from '../define.ts';
import { stateDirOf } from '../drafts.ts';
import { ToolFailure } from '../errors.ts';
import type { JSONSchema, ToolContext } from '../types.ts';
import { DATETIME, obj, SHA256 } from './shared.ts';

/** Reads derived public data. Building the index writes a file that can be deleted at any time. */
const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

const COUNT = { type: 'integer', minimum: 0 };
const SHARE = { type: 'number' };

const MATCH = obj(['status'], {
  status: { enum: ['observed', 'inferred'] },
  method: { enum: ['same_evm_address', 'same_address_string'] },
});

const COVERAGE = obj(
  [
    'members_named',
    'members_total',
    'tail_accounts',
    'amount_total',
    'amount_named',
    'named_share',
    'window',
    'complete',
    'why_partial',
  ],
  {
    members_named: COUNT,
    members_total: { type: ['integer', 'null'] },
    tail_accounts: { type: ['integer', 'null'] },
    amount_total: { type: 'string' },
    amount_named: { type: 'string' },
    named_share: SHARE,
    window: { type: ['string', 'null'] },
    complete: { type: 'boolean' },
    why_partial: { type: 'array', items: { type: 'string' } },
  },
);

const GROUP = obj(
  [
    'group_id',
    'title',
    'kind',
    'chain',
    'module',
    'measure',
    'unit',
    'as_of',
    'block_height',
    'final',
    'snapshot_sha256',
    'latest',
    'observations',
    'coverage',
  ],
  {
    group_id: { type: 'string' },
    title: { type: 'string' },
    kind: { enum: ['holdings', 'delegators'] },
    chain: { type: 'string' },
    module: { type: 'string' },
    measure: { type: 'string' },
    unit: { type: 'string' },
    as_of: DATETIME,
    block_height: { type: ['integer', 'null'] },
    final: { type: 'boolean' },
    snapshot_sha256: SHA256,
    latest: { type: 'boolean' },
    observations: COUNT,
    coverage: COVERAGE,
  },
);

const IDENTITY = { type: ['object', 'null'] };

const PAIR_REQUIRED = ['at_least', 'match', 'as_of_a', 'as_of_b', 'gap_seconds', 'gap_days'];
const PAIR = {
  at_least: { type: 'boolean' },
  match: MATCH,
  as_of_a: DATETIME,
  as_of_b: DATETIME,
  gap_seconds: COUNT,
  gap_days: { type: 'number' },
};

const NOTES = {
  absence: { type: 'string' },
  does_not_show: { type: 'string' },
  not_read: {
    type: 'array',
    items: obj(['sha256', 'reason'], { sha256: SHA256, reason: { type: 'string' } }),
  },
};

const INDEX_FACTS = obj(['snapshots', 'groups', 'observations', 'observations_partial'], {
  snapshots: COUNT,
  groups: COUNT,
  observations: COUNT,
  observations_partial: COUNT,
});

const GROUP_REF: JSONSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 400,
  description:
    'a group_id, or <group_id>@<sha256> for one date of it, or the sha256 of a snapshot for its main group',
};
const ACCOUNT_REF: JSONSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 200,
  description:
    'chain:address, such as eip155:1:0xabc or near:mainnet:alice.near. A bare address also works, and then it stands for that address on every chain it appears on.',
};

/**
 * The Power Map's groups and pairs, from the readings drawn on it only: their own index, so a newer read kept but
 * not drawn never becomes a group's latest there, and the map's roads stay on the flowers it shows. The agent's
 * relations tools keep the index of every stored reading.
 */
export async function drawnOverview(ctx: ToolContext, snapshots: readonly string[]) {
  const index = stateIndex(stateDirOf(ctx.config), 'map-index.db');
  const drawn = [...new Set(snapshots)].sort();
  try {
    return await index.answer(
      { list: async () => drawn.map((sha256) => ({ sha256 })), get: (sha) => ctx.store.get(sha) },
      (q) => q.overview({ kind: 'holdings', limit: 5000 }),
    );
  } catch (e) {
    if (e instanceof RelationsError) throw new ToolFailure(e.code, e.message, e.hint);
    throw e;
  }
}

/** Sync the index with what's stored, ask it, and say which stored snapshots it could not read. */
async function ask<T extends object>(ctx: ToolContext, fn: (q: Queries) => T): Promise<T> {
  const index = stateIndex(stateDirOf(ctx.config));
  try {
    const out = await index.answer(ctx.store, fn);
    return index.skipped.length ? { ...out, not_read: index.skipped } : out;
  } catch (e) {
    if (e instanceof RelationsError) throw new ToolFailure(e.code, e.message, e.hint);
    throw e;
  }
}

export const accountGroupsTool = defineTool<{ account: string; limit?: number }, object>({
  name: 'account_groups',
  title: 'Groups of an account',
  description:
    'Every stored group an account has been observed in, with its share, rank and the date. The same address on another EVM chain is marked inferred: it is often the same account, and that is not proven. Not being listed proves nothing where coverage is partial (at_least). Being in a group says nothing about who controls an account.',
  input: obj(
    ['account'],
    {
      account: ACCOUNT_REF,
      limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 },
    },
    { additionalProperties: false },
  ),
  output: obj(
    [
      'asked',
      'accounts',
      'groups',
      'total',
      'more',
      'anchor_of',
      'at_least',
      'index',
      'absence',
      'does_not_show',
    ],
    {
      asked: { type: 'string' },
      accounts: { type: 'array', items: { type: 'string' } },
      groups: {
        type: 'array',
        items: obj(
          ['group', 'account', 'match', 'amount', 'share', 'rank', 'identity', 'account_kind'],
          {
            group: GROUP,
            account: { type: 'string' },
            match: MATCH,
            amount: { type: 'string' },
            share: SHARE,
            rank: COUNT,
            identity: IDENTITY,
            account_kind: { type: ['string', 'null'] },
          },
        ),
      },
      total: COUNT,
      more: COUNT,
      anchor_of: { type: 'array', items: GROUP },
      at_least: { type: 'boolean' },
      index: INDEX_FACTS,
      ...NOTES,
    },
  ),
  annotations: READ_ONLY,
  async run({ account, limit }, ctx) {
    return ask(ctx, (q) => q.accountGroups(account, limit === undefined ? {} : { limit }));
  },
});

export const sharedAccountsTool = defineTool<
  { group_a: string; group_b: string; limit?: number },
  object
>({
  name: 'shared_accounts',
  title: 'Accounts two groups share',
  description:
    'Which accounts two groups have in common: a count and a capped list, each with both shares and both dates. The count is a lower bound where coverage is partial (at_least). The two dates can be years apart (gap_days), so a shared account need not have been in both at once. A match across chains is marked inferred. This does not show that the accounts coordinate or have one controller.',
  input: obj(
    ['group_a', 'group_b'],
    {
      group_a: GROUP_REF,
      group_b: GROUP_REF,
      limit: { type: 'integer', minimum: 0, maximum: 1000, default: 50 },
    },
    { additionalProperties: false },
  ),
  output: obj(
    [
      'a',
      'b',
      'same_group',
      'shared',
      ...PAIR_REQUIRED,
      'weight',
      'share_of_a',
      'share_of_b',
      'accounts',
      'more',
      'absence',
      'does_not_show',
    ],
    {
      a: GROUP,
      b: GROUP,
      same_group: { type: 'boolean' },
      shared: COUNT,
      ...PAIR,
      weight: SHARE,
      share_of_a: SHARE,
      share_of_b: SHARE,
      accounts: {
        type: 'array',
        items: obj(
          [
            'account_a',
            'account_b',
            'match',
            'amount_a',
            'amount_b',
            'share_a',
            'share_b',
            'rank_a',
            'rank_b',
            'as_of_a',
            'as_of_b',
            'identity_a',
            'identity_b',
            'groups_observed',
          ],
          {
            account_a: { type: 'string' },
            account_b: { type: 'string' },
            match: MATCH,
            amount_a: { type: 'string' },
            amount_b: { type: 'string' },
            share_a: SHARE,
            share_b: SHARE,
            rank_a: COUNT,
            rank_b: COUNT,
            as_of_a: DATETIME,
            as_of_b: DATETIME,
            identity_a: IDENTITY,
            identity_b: IDENTITY,
            groups_observed: COUNT,
          },
        ),
      },
      more: COUNT,
      ...NOTES,
    },
  ),
  annotations: READ_ONLY,
  async run({ group_a, group_b, limit }, ctx) {
    return ask(ctx, (q) =>
      q.sharedAccounts(group_a, group_b, limit === undefined ? {} : { limit }),
    );
  },
});

export const relatedGroupsTool = defineTool<
  { group: string; by?: 'count' | 'share'; limit?: number },
  object
>({
  name: 'related_groups',
  title: 'Groups related to a group',
  description:
    'The groups that share the most accounts with this one, by count or by share (the sum of the smaller share of each shared account, since units do not add up across groups). It compares the latest stored date of each group, and never a group with itself. Counts are lower bounds where coverage is partial (at_least). A relation means shared accounts: it does not show influence, coordination or one controller.',
  input: obj(
    ['group'],
    {
      group: GROUP_REF,
      by: { enum: ['count', 'share'], default: 'count' },
      limit: { type: 'integer', minimum: 1, maximum: 200, default: 20 },
    },
    { additionalProperties: false },
  ),
  output: obj(['group', 'by', 'basis', 'related', 'total', 'more', 'absence', 'does_not_show'], {
    group: GROUP,
    by: { enum: ['count', 'share'] },
    basis: { type: 'string' },
    related: {
      type: 'array',
      items: obj(['group', 'shared', ...PAIR_REQUIRED, 'weight', 'share_of_a', 'share_of_b'], {
        group: GROUP,
        shared: COUNT,
        ...PAIR,
        weight: SHARE,
        share_of_a: SHARE,
        share_of_b: SHARE,
      }),
    },
    total: COUNT,
    more: COUNT,
    ...NOTES,
  }),
  annotations: READ_ONLY,
  async run({ group, by, limit }, ctx) {
    return ask(ctx, (q) =>
      q.relatedGroups(group, {
        ...(by !== undefined ? { by } : {}),
        ...(limit !== undefined ? { limit } : {}),
      }),
    );
  },
});

export const relationsOverviewTool = defineTool<
  { min_shared?: number; kind?: GroupKind | 'all'; limit?: number },
  object
>({
  name: 'relations_overview',
  title: 'Every group and the pairs that overlap',
  description:
    'Stored groups, with their dates and coverage, plus the pairs that share at least min_shared accounts. Each pair is the latest date of each group, and a lower bound where coverage is partial. By default only holdings groups: NEAR alone adds hundreds of per-pool groups, so kind: "all" returns hundreds of kilobytes. Overlap does not show coordination or one controller.',
  input: obj(
    [],
    {
      min_shared: { type: 'integer', minimum: 1, default: 1 },
      kind: { enum: ['holdings', 'delegators', 'all'], default: 'holdings' },
      limit: { type: 'integer', minimum: 0, maximum: 5000, default: 500 },
    },
    { additionalProperties: false },
  ),
  output: obj(
    [
      'min_shared',
      'kind',
      'basis',
      'groups',
      'groups_left_out',
      'pairs',
      'pairs_total',
      'pairs_more',
      'accounts',
      'index',
      'absence',
      'does_not_show',
    ],
    {
      min_shared: COUNT,
      kind: { enum: ['holdings', 'delegators', 'all'] },
      basis: { type: 'string' },
      groups_left_out: COUNT,
      groups: {
        type: 'array',
        items: obj(
          [
            'id',
            'title',
            'kind',
            'chain',
            'module',
            'unit',
            'as_of',
            'snapshot_sha256',
            'observations',
            'members_named',
            'members_total',
            'complete',
          ],
          {
            id: { type: 'string' },
            title: { type: 'string' },
            kind: { enum: ['holdings', 'delegators'] },
            chain: { type: 'string' },
            module: { type: 'string' },
            unit: { type: 'string' },
            as_of: DATETIME,
            snapshot_sha256: SHA256,
            observations: COUNT,
            members_named: COUNT,
            members_total: { type: ['integer', 'null'] },
            complete: { type: 'boolean' },
          },
        ),
      },
      pairs: {
        type: 'array',
        items: obj(['a', 'b', 'shared', 'weight', ...PAIR_REQUIRED], {
          a: { type: 'string' },
          b: { type: 'string' },
          shared: COUNT,
          weight: SHARE,
          ...PAIR,
        }),
      },
      pairs_total: COUNT,
      pairs_more: COUNT,
      accounts: COUNT,
      index: INDEX_FACTS,
      ...NOTES,
    },
  ),
  annotations: READ_ONLY,
  async run({ min_shared, kind, limit }, ctx) {
    return ask(ctx, (q) =>
      q.overview({
        ...(min_shared !== undefined ? { minShared: min_shared } : {}),
        ...(kind !== 'all' ? { kind: kind ?? 'holdings' } : {}),
        ...(limit !== undefined ? { limit } : {}),
      }),
    );
  },
});

const PATH_END = obj(['asked', 'accounts', 'match'], {
  asked: { type: 'string' },
  accounts: { type: 'array', items: { type: 'string' } },
  match: { ...MATCH, type: ['object', 'null'] },
});

export const powerPathTool = defineTool<
  {
    account_a: string;
    account_b: string;
    max_depth?: number;
    budget?: number;
    include_inferred?: boolean;
  },
  object
>({
  name: 'power_path',
  title: 'A path between two accounts',
  description:
    'One shortest chain of shared groups between two accounts, each hop naming its group, date and size. It says when it gave up (gave_up), which is not the same as no path. A path through a huge group says little, so read the sizes. Walks observed links only unless include_inferred is true, which also crosses the same address on two EVM chains, marked as inferred. A path is not influence, coordination or one controller.',
  input: obj(
    ['account_a', 'account_b'],
    {
      account_a: ACCOUNT_REF,
      account_b: ACCOUNT_REF,
      max_depth: {
        type: 'integer',
        minimum: 1,
        maximum: MAX_DEPTH,
        default: DEFAULT_MAX_DEPTH,
        description: 'how many shared groups a path may pass through',
      },
      budget: {
        type: 'integer',
        minimum: 1,
        maximum: MAX_BUDGET,
        default: DEFAULT_BUDGET,
        description: 'how many edges to read before giving up',
      },
      include_inferred: { type: 'boolean', default: false },
    },
    { additionalProperties: false },
  ),
  output: obj(
    [
      'from',
      'to',
      'max_depth',
      'budget',
      'walked',
      'found',
      'reason',
      'gave_up',
      'hops',
      'touched',
      'note',
      'does_not_show',
    ],
    {
      from: PATH_END,
      to: PATH_END,
      max_depth: COUNT,
      budget: COUNT,
      walked: { type: 'string' },
      found: { type: 'boolean' },
      reason: {
        enum: ['found', 'same_account', 'unknown_account', 'no_path', 'depth_limit', 'budget'],
      },
      gave_up: { type: 'boolean' },
      hops: {
        type: 'array',
        items: obj(['via', 'from', 'to'], {
          via: { enum: ['group', 'same_address'] },
          from: { type: 'string' },
          to: { type: 'string' },
          group: GROUP,
          from_in_group: { type: 'object' },
          to_in_group: { type: 'object' },
          match: MATCH,
        }),
      },
      touched: COUNT,
      note: { type: 'string' },
      ...NOTES,
    },
  ),
  annotations: READ_ONLY,
  async run({ account_a, account_b, max_depth, budget, include_inferred }, ctx) {
    return ask(ctx, (q) =>
      q.path(account_a, account_b, {
        ...(max_depth !== undefined ? { maxDepth: max_depth } : {}),
        ...(budget !== undefined ? { budget } : {}),
        ...(include_inferred !== undefined ? { includeInferred: include_inferred } : {}),
      }),
    );
  },
});

// near-validators (T035): NEAR's validators and staking pools, and the delegators behind them.
// Stored only in Phase A: served from the checked-in fixture (fixtures/snapshots/, imported from
// the step 1 crawl by scripts/import-spike-data.ts). The crawl itself (963 keyless calls,
// ~24 min) stays an offline script, so `live` is false and `at` resolves to a stored block.
import { fileURLToPath } from 'node:url';
import type { At, NetworkDescriptor, Params, Progress, ResolvedAt } from '@petal/core/types';
import { InputError } from '../errors.ts';
import type { InputModule } from '../index.ts';
import { readIndex, readSnapshotFile, snapshotDir } from '../store/file-store.ts';
import { parseAt } from './at.ts';

export const NEAR_VALIDATORS_ID = 'near-validators';

/** fixtures/snapshots/ in this repo. */
export const REPO_FIXTURES = fileURLToPath(
  new URL('../../../../fixtures/snapshots/', import.meta.url),
);

const S = {
  validators: 'fastnear-rpc-validators',
  block: 'fastnear-rpc-block',
  poolViews: 'fastnear-rpc-staking-pool-views',
  kitwallet: 'nearblocks-kitwallet-pools',
  nbValidators: 'nearblocks-validators',
  nbInfo: 'nearblocks-validators-info',
  accountId: 'account-id',
  liquid: 'fastnear-rpc-liquid-staking',
} as const;

export const NEAR_VALIDATORS_DESCRIPTOR: NetworkDescriptor = {
  id: NEAR_VALIDATORS_ID,
  chain: 'near:mainnet',
  population: 'validators',
  kind: 'chain',
  title: 'NEAR validators',
  description:
    'Validators and staking pools on NEAR mainnet, and the delegators behind them: who owns each pool, and who backs it (other delegators, accounts with 1M+ NEAR, liquid-staking contracts, lockups).',
  params: {},
  capabilities: {
    measures: [
      {
        id: 'validator_stake_current_epoch',
        unit: 'NEAR',
        label: 'stake of each seated validator in the current epoch',
      },
      {
        id: 'pool_contract_stake',
        unit: 'NEAR',
        label: 'total stake held by each staking pool contract, seated or not',
      },
    ],
    by: {
      width: ['share', 'equal'],
      height: ['share', 'amount', 'equal'],
      colour: ['kind', 'identity', 'single'],
      outline: ['identity_status'],
      segments: ['backers'],
      order: ['measure_desc'],
    },
    segments: ['backers'],
    relationships: ['delegates_to', 'owned_by'],
    defaults: { measure: 'validator_stake_current_epoch' },
    meanings: {
      'width:share': {
        meaning: "the validator's share of stake this epoch, compressed into a band",
        sources: [S.validators],
      },
      'width:equal': { meaning: 'every validator the same width', sources: [S.validators] },
      'height:share': {
        meaning: "square root of the validator's share of stake this epoch",
        sources: [S.validators],
      },
      'height:amount': {
        meaning: 'stake this epoch in NEAR, on a log scale',
        sources: [S.validators],
      },
      'height:equal': { meaning: 'every validator the same height', sources: [S.validators] },
      'colour:kind': {
        meaning: 'kind of account: staking pool, liquid-staking contract, or unknown',
        sources: [S.nbValidators, S.liquid],
      },
      'colour:identity': {
        meaning: 'named (a name declared in pool-details.near, or a named account id) or anonymous',
        sources: [S.nbValidators, S.accountId],
      },
      'colour:single': { meaning: 'one colour for every validator', sources: [S.validators] },
      'outline:identity_status': {
        meaning:
          'solid when the name is self-declared (pool-details.near or a named account id) or verified, dashed when inferred, none when unknown',
        sources: [S.nbValidators, S.accountId],
      },
      'segments:backers': {
        meaning:
          'who stands behind each pool: its delegations split into other delegators, accounts with 1M+ NEAR, liquid-staking contracts and lockups (delegations under 1,000 NEAR are folded per pool and class, as coverage declares)',
        sources: [S.poolViews, S.liquid],
      },
      'order:measure_desc': {
        meaning: 'largest stake first, clockwise from the top',
        sources: [S.validators],
      },
    },
  },
  live: false,
  cost: {
    calls: 0,
    seconds: 0,
    note: 'stored: served from the fixture at block 222,915,356 (2026-11-03). The delegator crawl behind it (963 keyless calls, ~24 min) is an offline script.',
  },
  sources: [
    { id: S.validators, kind: 'chain', url: 'https://rpc.mainnet.fastnear.com' },
    { id: S.block, kind: 'chain', url: 'https://rpc.mainnet.fastnear.com' },
    { id: S.poolViews, kind: 'chain', url: 'https://rpc.mainnet.fastnear.com' },
    { id: S.kitwallet, kind: 'api', url: 'https://api.nearblocks.io/v3/kitwallet/stakingPools' },
    { id: S.nbValidators, kind: 'api', url: 'https://api.nearblocks.io/v3/validators?limit=100' },
    { id: S.nbInfo, kind: 'api', url: 'https://api.nearblocks.io/v3/validators/info' },
    {
      id: S.accountId,
      kind: 'docs',
      url: 'https://docs.near.org/protocol/accounts-contracts/account-id',
    },
    { id: S.liquid, kind: 'chain', url: 'https://rpc.mainnet.fastnear.com' },
  ],
};

/** The stored module. `fixtures` is the folder holding index.json (default: this repo's). */
export function nearValidators(opts: { fixtures?: string } = {}): InputModule {
  const dir = snapshotDir(opts.fixtures ?? REPO_FIXTURES);

  const stored = async () =>
    (await readIndex(dir)).snapshots
      .filter((r) => r.network === NEAR_VALIDATORS_ID && r.block_height !== null)
      .sort((a, b) => (a.block_height ?? 0) - (b.block_height ?? 0));

  const available = (rows: Awaited<ReturnType<typeof stored>>) =>
    rows.map((r) => `block ${r.block_height} (${r.as_of})`).join(', ') || 'none';

  return {
    descriptor: NEAR_VALIDATORS_DESCRIPTOR,

    async resolveAt(at: At, _params?: Params): Promise<ResolvedAt> {
      const rows = await stored();
      const want = parseAt(at);
      const pick =
        want.kind === 'latest'
          ? rows.at(-1)
          : want.kind === 'block'
            ? rows.find((r) => r.block_height === want.block_height)
            : rows.filter((r) => Date.parse(r.as_of) <= want.ms).at(-1);
      if (!pick || pick.block_height === null)
        throw new InputError(
          'cannot_read',
          `near-validators is stored only in this build, and no stored snapshot matches ${JSON.stringify(at)}`,
          { hint: `stored: ${available(rows)}. Ask for "latest" or one of these blocks.` },
        );
      return { block_height: pick.block_height, as_of: pick.as_of };
    },

    async fetch(at: ResolvedAt, _params: Params | undefined, onProgress?: Progress) {
      const rows = await stored();
      const row = rows.find((r) => r.block_height === at.block_height);
      if (!row)
        throw new InputError(
          'cannot_read',
          `near-validators has no stored snapshot at block ${at.block_height}`,
          {
            hint: `stored: ${available(rows)}`,
          },
        );
      onProgress?.({
        stage: 'fetching',
        message: `reading the stored NEAR validators snapshot at block ${row.block_height}`,
      });
      const s = await readSnapshotFile(dir, row.sha256, row.file);
      if (!s)
        throw new InputError('internal', `the fixture file ${row.file} is missing from ${dir}`);
      return s;
    },
  };
}

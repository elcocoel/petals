// near-house-of-stake (T036): NEAR's House of Stake, live. veNEAR holders, their voting power
// and delegations, the governance roles and the vote.dao proposals, read keyless in ~16 view
// calls (~10 s on dRPC), following ../research/spikes/near-dao/house_of_stake.py.
//
// Contracts: venear.dao (veNEAR) and vote.dao (voting), named in the HoS Interim Constitution
// art. 3.1 and confirmed on chain by NEP-330 metadata (research/data/near-dao/NOTES.md).
//
// Every read is pinned to one final block (`block_id`), so the snapshot is a function of the
// block: re-reading the same block gives the same bytes and the same sha256. That is why
// `fetched_at` on chain sources is the block's time, not the wall clock.
//
// Not included (the spike's slower parts): per-voter votes (NearBlocks, ~2.5 min), each
// holder's lockup contract and its staking, and off-chain delegate profiles.
import type {
  Holding,
  NetworkDescriptor,
  Participant,
  Progress,
  Relationship,
  ResolvedAt,
  Snapshot,
  SnapshotEvent,
  Source,
} from '@petal/core/types';
import { InputError } from '../errors.ts';
import { fromBaseUnits } from '../import/spike.ts';
import type { InputModule } from '../index.ts';
import { type CallOptions, defaultPool, RpcError, type RpcPool } from '../rpc/pool.ts';
import { archivalFor, resolveNearAt } from './chain.ts';
import { ownedTotal, type Power, type VeAccount } from './venear.ts';

export const HOUSE_OF_STAKE_ID = 'near-house-of-stake';
export const HOUSE_OF_STAKE_VERSION = 'live/1';
export const VENEAR = 'venear.dao';
export const VOTE = 'vote.dao';
const ACCOUNTS_PAGE = 100;
const PROPOSALS_PAGE = 10;
const OPTIONS = ['For', 'Against', 'Abstain'] as const;
/** When the cited documents were last read (the step 2 spike). */
const DOCS_CHECKED_AT = '2026-11-04T13:14:59Z';

const S = {
  accounts: 'venear-accounts',
  supply: 'venear-supply',
  config: 'hos-config',
  proposals: 'vote-proposals',
  constitution: 'hos-constitution',
  code: 'hos-source',
  accountId: 'account-id',
} as const;

const DOC_SOURCES: Source[] = [
  {
    id: S.constitution,
    kind: 'constitution',
    url: 'https://gov.near.org/t/near-house-of-stake-interim-constitution/41686',
    method: 'art. 3.1 names the veNEAR contract (venear.dao) and the voting contract (vote.dao)',
    fetched_at: DOCS_CHECKED_AT,
  },
  {
    id: S.code,
    kind: 'docs',
    url: 'https://github.com/houseofstake/house-of-stake-contracts',
    method:
      'voting power = own veNEAR minus outgoing delegations plus incoming (common/src/account.rs owned_total)',
    fetched_at: DOCS_CHECKED_AT,
  },
  {
    id: S.accountId,
    kind: 'docs',
    url: 'https://docs.near.org/protocol/accounts-contracts/account-id',
    method: 'a named account id is a self-declared name, not verified',
    fetched_at: DOCS_CHECKED_AT,
  },
];

export const HOUSE_OF_STAKE_DESCRIPTOR: NetworkDescriptor = {
  id: HOUSE_OF_STAKE_ID,
  chain: 'near:mainnet',
  population: 'house-of-stake',
  kind: 'dao',
  title: 'NEAR House of Stake',
  description:
    "NEAR's House of Stake: veNEAR holders (NEAR locked in lockups), their voting power and delegations, the governance roles, and the vote.dao proposals. Read live at a final block.",
  params: {},
  capabilities: {
    measures: [
      {
        id: 'voting_power',
        unit: 'veNEAR',
        label:
          'veNEAR voting power: own veNEAR, minus what is delegated out, plus what is delegated in',
      },
      { id: 'own_locked_near', unit: 'NEAR', label: 'NEAR the account has locked' },
      { id: 'delegated_in_venear', unit: 'veNEAR', label: 'veNEAR other accounts delegated to it' },
    ],
    by: {
      width: ['share', 'equal'],
      height: ['share', 'amount', 'equal'],
      colour: ['kind', 'identity', 'single'],
      outline: ['identity_status'],
      order: ['measure_desc'],
    },
    segments: [],
    relationships: [
      'delegates_to',
      'holds_role:owner',
      'holds_role:guardian',
      'holds_role:lockup_code_deployer',
      'holds_role:vote_reviewer',
      'holds_role:vote_council',
      'proposed',
      'reviewed',
    ],
    defaults: { measure: 'voting_power' },
    meanings: {
      'width:share': {
        meaning: "the account's share of veNEAR voting power, compressed into a band",
        sources: [S.accounts, S.code],
      },
      'width:equal': { meaning: 'every account the same width', sources: [S.accounts] },
      'height:share': {
        meaning: "square root of the account's share of veNEAR voting power",
        sources: [S.accounts, S.code],
      },
      'height:amount': {
        meaning: 'veNEAR voting power, on a log scale',
        sources: [S.accounts, S.code],
      },
      'height:equal': { meaning: 'every account the same height', sources: [S.accounts] },
      'colour:kind': {
        meaning:
          'kind of account, from the account id (a .sputnik-dao.near DAO, a .lockup.near contract) and the config (the treasury); unknown otherwise',
        sources: [S.accountId, S.config],
      },
      'colour:identity': {
        meaning: 'named (a named account id, self-declared) or anonymous (an implicit account)',
        sources: [S.accountId],
      },
      'colour:single': { meaning: 'one colour for every account', sources: [S.accounts] },
      'outline:identity_status': {
        meaning: 'solid when the name is self-declared (a named account id), none when unknown',
        sources: [S.accountId],
      },
      'order:measure_desc': {
        meaning: 'most voting power first, clockwise from the top',
        sources: [S.accounts],
      },
    },
  },
  live: true,
  cost: {
    calls: 16,
    seconds: 10,
    note: 'one final block, then about 16 keyless view calls (6 of them get_accounts pages); per-voter votes are not read',
  },
  sources: [
    { id: S.accounts, kind: 'chain', url: 'https://near.drpc.org' },
    { id: S.supply, kind: 'chain', url: 'https://near.drpc.org' },
    { id: S.config, kind: 'chain', url: 'https://near.drpc.org' },
    { id: S.proposals, kind: 'chain', url: 'https://near.drpc.org' },
    ...DOC_SOURCES.map(({ id, kind, url }) => ({ id, kind, url })),
  ],
};

// ---- small helpers ----------------------------------------------------------------------

const yocto = (raw: bigint | string) => fromBaseUnits(BigInt(raw), 24);
const ns = (x: string | number) => {
  const ms = BigInt(x) / 1_000_000n;
  return new Date(Number(ms - (ms % 1000n))).toISOString().replace(/\.\d{3}Z$/, 'Z');
};

export function isImplicit(a: string): boolean {
  return /^[0-9a-f]{64}$/.test(a) || /^0x[0-9a-fA-F]{40}$/.test(a);
}

function identityOf(a: string): Participant['identity'] {
  if (isImplicit(a) || a.endsWith('.lockup.near')) return null;
  return { name: a, source: S.accountId, status: 'self-declared' };
}

function kindOf(a: string): Participant['kind'] {
  if (a.endsWith('.sputnik-dao.near')) return 'organisation';
  if (a.endsWith('.lockup.near')) return 'contract';
  return 'unknown';
}

interface Proposal {
  id: number;
  creation_time_ns: string;
  proposer_id: string;
  reviewer_id: string | null;
  approval_time_ns: string | null;
  voting_start_time_ns: string | null;
  voting_duration_ns: string;
  snapshot_and_state: {
    total_venear?: string;
    snapshot?: { block_height?: number };
  } | null;
  votes: { total_venear: string; total_votes: number }[];
  status: string;
  flow?: string;
  title?: string | null;
  link?: string | null;
  quorum_threshold_bps?: number;
  approval_threshold_bps?: number;
}

interface VenearConfig {
  owner_account_id: string;
  guardians?: string[];
  lockup_code_deployers?: string[];
  max_delegations?: number;
}

interface VoteConfig {
  reviewer_ids?: string[];
  council_ids?: string[];
  guardians?: string[];
  owner_account_id?: string;
  treasury_account_id?: string;
}

type GlobalSnapshot = [
  unknown,
  {
    V0?: { total_venear_balance: { near_balance: string; extra_venear_balance: string } };
    total_venear_balance?: { near_balance: string; extra_venear_balance: string };
  },
];

// ---- the module -------------------------------------------------------------------------

export function nearHouseOfStake(opts: { rpc?: RpcPool } = {}): InputModule {
  const pool = () => opts.rpc ?? defaultPool();

  return {
    descriptor: HOUSE_OF_STAKE_DESCRIPTOR,

    resolveAt: (at) => resolveNearAt(pool(), at),

    async fetch(at: ResolvedAt, _params, onProgress?: Progress): Promise<Snapshot> {
      const rpc = pool();
      const ref = { block_id: at.block_height };
      const o: CallOptions = archivalFor(at.as_of);
      const served = new Map<string, Set<string>>(); // source id → endpoint urls
      let blockHash: string | undefined;
      let total = 16;
      let done = 0;
      const step = (message: string) => onProgress?.({ stage: 'fetching', message, done, total });

      async function view<T>(source: string, account: string, method: string, args?: unknown) {
        try {
          const r = await rpc.view<T>(account, method, args ?? {}, ref, o);
          if (r.block_height !== at.block_height)
            throw new InputError(
              'source_failed',
              `${r.endpoint.id} answered ${account}.${method} at block ${r.block_height}, not ${at.block_height}`,
            );
          blockHash ??= r.block_hash;
          const urls = served.get(source) ?? new Set();
          urls.add(r.endpoint.url);
          served.set(source, urls);
          done++;
          return r.value;
        } catch (e) {
          if (e instanceof RpcError) {
            if (e.cause_name === 'UNKNOWN_ACCOUNT' || e.cause_name === 'NO_CONTRACT_CODE')
              throw new InputError(
                'cannot_read',
                `${account} does not exist at block ${at.block_height}`,
                {
                  hint: 'House of Stake (venear.dao) was created on 2025-10-10; ask for a later date',
                },
              );
            throw new InputError(
              'source_failed',
              `${source}: ${account}.${method} failed on ${e.endpoint}: ${e.cause_name}`,
              {
                failures: [
                  {
                    endpoint: e.endpoint,
                    url: rpc.endpoints.find((x) => x.id === e.endpoint)?.url ?? '',
                    reason: e.message,
                  },
                ],
              },
            );
          }
          if (e instanceof InputError && e.code === 'source_failed')
            throw new InputError('source_failed', `${source}: ${account}.${method}: ${e.message}`, {
              ...(e.hint ? { hint: e.hint } : {}),
              ...(e.failures ? { failures: e.failures } : {}),
            });
          throw e;
        }
      }

      step(`reading House of Stake at block ${at.block_height}: config and supply`);
      const vcfg = await view<VenearConfig>(S.config, VENEAR, 'get_config');
      const gsnap = await view<GlobalSnapshot>(S.supply, VENEAR, 'get_snapshot');
      const supply = await view<string>(S.supply, VENEAR, 'ft_total_supply');
      const nAcc = await view<number>(S.accounts, VENEAR, 'get_num_accounts');
      const nPages = Math.ceil(nAcc / ACCOUNTS_PAGE);
      total = 4 + nPages + 2 + 3;

      const accounts: VeAccount[] = [];
      for (let from = 0; from < nAcc; from += ACCOUNTS_PAGE) {
        const page = await view<{ account: VeAccount }[]>(S.accounts, VENEAR, 'get_accounts', {
          from_index: from,
          limit: ACCOUNTS_PAGE,
        });
        for (const a of page) accounts.push(a.account);
        step(`veNEAR holders ${accounts.length}/${nAcc}`);
        if (page.length === 0) break;
      }
      if (accounts.length !== nAcc)
        throw new InputError(
          'source_failed',
          `${S.accounts}: get_accounts listed ${accounts.length} of ${nAcc} accounts`,
        );

      const vote = await view<VoteConfig>(S.config, VOTE, 'get_config');
      const nProp = await view<number>(S.proposals, VOTE, 'get_num_proposals');
      total = 4 + nPages + 2 + Math.ceil(nProp / PROPOSALS_PAGE);
      const proposals: Proposal[] = [];
      for (let from = 0; from < nProp; from += PROPOSALS_PAGE) {
        const page = await view<Proposal[]>(S.proposals, VOTE, 'get_proposals', {
          from_index: from,
          limit: PROPOSALS_PAGE,
        });
        proposals.push(...page);
        step(`proposals ${proposals.length}/${nProp}`);
        if (page.length === 0) break;
      }
      step('computing voting power');

      // ---- assemble snapshot/v1 ----
      const asOf = at.as_of;
      const parts = new Map<string, Participant & { roles: string[] }>();
      const part = (id: string, source: string, role?: string, kind?: Participant['kind']) => {
        let p = parts.get(id);
        if (!p) {
          p = {
            id,
            label: isImplicit(id) ? `${id.slice(0, 8)}…${id.slice(-4)}` : id,
            kind: kind ?? kindOf(id),
            identity: identityOf(id),
            roles: [],
            source,
          };
          parts.set(id, p);
        }
        if (kind) p.kind = kind;
        if (role && !p.roles.includes(role)) p.roles.push(role);
        return p;
      };
      const holdings: Holding[] = [];
      const rels: Relationship[] = [];
      const events: SnapshotEvent[] = [];
      const H = (participant: string, asset: string, measure: string, raw: bigint, unit: string) =>
        holdings.push({
          participant,
          asset,
          measure,
          amount: yocto(raw),
          amount_raw: raw.toString(),
          unit,
          as_of: asOf,
          source: S.accounts,
        });

      const power = new Map<string, Power>();
      let sum = 0n;
      for (const a of accounts) power.set(a.account_id, ownedTotal(a));
      const order = [...accounts].sort((x, y) => {
        const px = power.get(x.account_id)?.power ?? 0n;
        const py = power.get(y.account_id)?.power ?? 0n;
        return px === py ? (x.account_id < y.account_id ? -1 : 1) : px > py ? -1 : 1;
      });
      const delegates = new Set<string>();
      let delegating = 0;
      for (const a of order) {
        const id = a.account_id;
        const c = power.get(id) as Power;
        sum += c.power;
        part(id, S.accounts, 'venear_holder');
        H(id, 'veNEAR', 'voting_power', c.power, 'veNEAR');
        H(id, 'NEAR', 'own_locked_near', c.own_near, 'NEAR');
        H(id, 'veNEAR', 'own_extra_venear_from_lock_time', c.own_extra, 'veNEAR');
        if (c.in_near || c.in_extra) {
          H(id, 'NEAR', 'delegated_in_near', c.in_near, 'NEAR');
          H(id, 'veNEAR', 'delegated_in_venear', c.in_near + c.in_extra, 'veNEAR');
        }
        if (c.out_total) H(id, 'veNEAR', 'delegated_out_venear', c.out_total, 'veNEAR');
        if (c.delegations.length) delegating++;
        for (const d of c.delegations) {
          delegates.add(d.to);
          rels.push({
            from: id,
            to: d.to,
            type: 'delegates_to',
            amount: yocto(d.amount),
            amount_raw: d.amount.toString(),
            unit: 'veNEAR',
            bps: d.bps,
            as_of: asOf,
            source: S.accounts,
          });
        }
      }
      for (const d of [...delegates].sort()) part(d, S.accounts, 'delegate');

      const roles: [string, string, string[]][] = [
        ['vote_reviewer', VOTE, vote.reviewer_ids ?? []],
        ['vote_council', VOTE, vote.council_ids ?? []],
        [
          'guardian',
          VENEAR,
          [...new Set([...(vote.guardians ?? []), ...(vcfg.guardians ?? [])])].sort(),
        ],
        ['lockup_code_deployer', VENEAR, vcfg.lockup_code_deployers ?? []],
        ['owner', VENEAR, [vcfg.owner_account_id]],
      ];
      for (const [role, to, ids] of roles)
        for (const x of ids) {
          part(x, S.config, role);
          rels.push({
            from: x,
            to,
            type: `holds_role:${role}`,
            amount: '1',
            unit: 'seat',
            as_of: asOf,
            source: S.config,
          });
        }
      if (vote.treasury_account_id)
        part(vote.treasury_account_id, S.config, 'treasury', 'treasury');

      const made = new Map<string, number>();
      for (const p of proposals) {
        const pid = `proposal:${VOTE}:${p.id}`;
        const created = ns(p.creation_time_ns);
        part(p.proposer_id, S.proposals, 'proposer');
        made.set(p.proposer_id, (made.get(p.proposer_id) ?? 0) + 1);
        rels.push({
          from: p.proposer_id,
          to: pid,
          type: 'proposed',
          amount: '1',
          unit: 'proposal',
          as_of: created,
          source: S.proposals,
        });
        if (p.reviewer_id) {
          part(p.reviewer_id, S.proposals, 'vote_reviewer');
          rels.push({
            from: p.reviewer_id,
            to: pid,
            type: 'reviewed',
            amount: '1',
            unit: 'proposal',
            as_of: p.approval_time_ns ? ns(p.approval_time_ns) : created,
            source: S.proposals,
          });
        }
        const ss = p.snapshot_and_state ?? {};
        events.push({
          participant: p.proposer_id,
          type: 'proposal',
          at: created,
          detail: {
            proposal: pid,
            id: p.id,
            title: p.title ?? null,
            link: p.link ?? null,
            status: p.status,
            flow: p.flow ?? null,
            voting_start: p.voting_start_time_ns ? ns(p.voting_start_time_ns) : null,
            approval_time: p.approval_time_ns ? ns(p.approval_time_ns) : null,
            voting_duration_days: Number(BigInt(p.voting_duration_ns) / 1_000_000_000n) / 86_400,
            reviewer: p.reviewer_id,
            tally: Object.fromEntries(
              p.votes.map((v, i) => [
                OPTIONS[i] ?? `option_${i}`,
                { venear: yocto(v.total_venear), votes: v.total_votes },
              ]),
            ),
            snapshot_total_venear: ss.total_venear ? yocto(ss.total_venear) : null,
            snapshot_block: ss.snapshot?.block_height ?? null,
            quorum_threshold_bps: p.quorum_threshold_bps ?? null,
            approval_threshold_bps: p.approval_threshold_bps ?? null,
          },
          source: S.proposals,
        });
      }
      for (const [who, n] of [...made].sort((a, b) => (a[0] < b[0] ? -1 : 1)))
        holdings.push({
          participant: who,
          asset: 'proposals_made',
          measure: 'proposals_made',
          amount: String(n),
          unit: 'proposals',
          as_of: asOf,
          source: S.proposals,
        });

      const participants = [...parts.values()].map((p) => ({ ...p, roles: [...p.roles].sort() }));
      const g = gsnap[1].V0 ?? gsnap[1];
      const locked = g.total_venear_balance ? yocto(g.total_venear_balance.near_balance) : null;

      const chainSource = (id: string, method: string): Source => {
        const urls = [...(served.get(id) ?? [])];
        return {
          id,
          kind: 'chain',
          url: urls[0] ?? 'https://near.drpc.org',
          method: urls.length > 1 ? `${method} (also via ${urls.slice(1).join(', ')})` : method,
          fetched_at: asOf,
          block_height: at.block_height,
        };
      };
      const pin = `at block_id ${at.block_height} (final)`;
      const sources: Snapshot['sources'] = [
        chainSource(
          S.accounts,
          `${VENEAR} get_num_accounts, get_accounts {from_index, limit: ${ACCOUNTS_PAGE}} x${nPages} ${pin}`,
        ),
        chainSource(S.supply, `${VENEAR} ft_total_supply, get_snapshot ${pin}`),
        chainSource(S.config, `${VENEAR} get_config, ${VOTE} get_config ${pin}`),
        chainSource(
          S.proposals,
          `${VOTE} get_num_proposals, get_proposals {from_index, limit: ${PROPOSALS_PAGE}} ${pin}`,
        ),
        ...DOC_SOURCES,
      ];

      const note =
        `All ${nAcc} veNEAR accounts are listed (get_accounts pages), read at one final block. ` +
        'voting_power uses the contract rule (own veNEAR minus outgoing delegations plus incoming; get_accounts returns balances grown to the block time). ' +
        `${delegating} accounts delegate to ${delegates.size} delegates. ` +
        (locked ? `${locked} NEAR is locked in total (get_snapshot). ` : '') +
        `Roles come from the venear.dao and vote.dao configs (max_delegations ${vcfg.max_delegations ?? 'unknown'}). ` +
        'Proposals are not participants: relationships point to `proposal:vote.dao:<id>`, and each proposal is an event with its on-chain tally. ' +
        "Not included: per-voter votes (NearBlocks, slow), each holder's lockup contract and its staking, off-chain delegate profiles. " +
        'Chain sources carry the block time as fetched_at, so re-reading the same block gives the same bytes and sha256.';

      return {
        petal: 'snapshot/v1',
        network: {
          id: HOUSE_OF_STAKE_ID,
          chain: 'near:mainnet',
          population: 'house-of-stake',
          title: 'NEAR House of Stake',
          description: 'veNEAR holders, their voting power and delegations; vote.dao proposals',
        },
        snapshot: {
          as_of: asOf,
          block_height: at.block_height,
          ...(blockHash ? { block_hash: blockHash } : {}),
          final: true,
        },
        coverage: {
          participants_total: participants.length,
          participants_included: participants.length,
          amount_total: yocto(supply),
          amount_included: yocto(sum),
          unit: 'veNEAR',
          measure: 'voting_power',
          note,
        },
        sources,
        participants,
        holdings,
        relationships: rels,
        events,
        module: { id: HOUSE_OF_STAKE_ID, version: HOUSE_OF_STAKE_VERSION },
      };
    },
  };
}

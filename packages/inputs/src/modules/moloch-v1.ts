// moloch-v1 (T157): members and shares of a Moloch v1 DAO, by replaying its events. The target is a
// parameter: `dao`, the contract address, and optionally `chain`. A fixture with the same parameters
// answers first; otherwise pullMolochV1 reads it in about 12 keyless calls.
//
// Check: the replay equals members() for every address that ever held shares, at the snapshot's
// block and at the head, and the sum equals totalShares(). A mismatch throws, and so does a contract
// that is not a Moloch v1.
//
// Names come only from proposal text of the form "Membership Proposal: X" or "Member Proposal: X"
// on a proposal the members passed, and are marked self-declared. Much of the text on chain is
// not a name ("shut up and take my money"), so nothing else is read as one.
import type {
  Holding,
  NetworkDescriptor,
  Params,
  Participant,
  Progress,
  Snapshot,
} from '@petal/core/types';
import { InputError } from '../errors.ts';
import { addressOf, encodeCall, eventTopic, shortAddress, stringAt, wordAt } from '../evm/abi.ts';
import { ETHEREUM, EVM_CHAINS, type EvmChain } from '../evm/chains.ts';
import { EVM_ENDPOINTS, type EvmLog, type EvmReader, evmReader } from '../evm/reader.ts';
import { fromBaseUnits } from '../import/spike.ts';
import type { InputModule } from '../index.ts';
import { dayOf, grouped, plainCapabilities } from './plain.ts';
import { paramModule } from './stored.ts';

export const MOLOCH_V1_ID = 'moloch-v1';
export const MOLOCH_V1_VERSION = 'evm/1';
const README = 'https://raw.githubusercontent.com/MolochVentures/moloch/master/README.md';
/** When the README was last read for this module. */
const DOCS_CHECKED_AT = '2026-11-05T12:00:00Z';

const S = {
  logs: 'moloch-logs',
  members: 'moloch-members',
  proposals: 'moloch-proposal-text',
  check: 'moloch-head-check',
  readme: 'moloch-readme',
} as const;

const TOPIC = {
  summon: eventTopic('SummonComplete(address,uint256)'),
  submit: eventTopic('SubmitProposal(uint256,address,address,address,uint256,uint256)'),
  process: eventTopic('ProcessProposal(uint256,address,address,uint256,uint256,bool)'),
  ragequit: eventTopic('Ragequit(address,uint256)'),
  vote: eventTopic('SubmitVote(uint256,address,address,uint8)'),
};

export const MOLOCH_V1_DESCRIPTOR: NetworkDescriptor = {
  id: MOLOCH_V1_ID,
  chain: ETHEREUM.caip2,
  population: 'moloch-v1',
  kind: 'dao',
  title: 'Moloch v1 members',
  description:
    'Members of a Moloch v1 DAO and their shares, by replay of its events. A share is a vote and a claim on the guild bank; ragequit lets a member leave with their part. Give the DAO contract address.',
  params: {
    dao: {
      required: true,
      description: 'the DAO contract address',
      pattern: '^0x[0-9a-fA-F]{40}$',
      example: '0x1fd169A4f5c59ACf79d0Fd5d91D1201EF1Bce9f1',
    },
    chain: {
      required: false,
      description: 'ethereum (default), base or arbitrum',
      pattern: '^(ethereum|base|arbitrum)$',
      example: 'ethereum',
      default: 'ethereum',
    },
  },
  capabilities: plainCapabilities({
    measure: { id: 'shares', unit: 'shares', label: 'Moloch v1 shares' },
    sources: [S.logs, S.members],
    kind: { meaning: 'every member is an address of unknown kind', sources: [S.logs] },
    identity: {
      meaning:
        'named (the text of a passed proposal says "Membership Proposal: <name>", self-declared) or anonymous',
      sources: [S.proposals],
    },
    defaults: { colour: 'identity' },
  }),
  live: true,
  cost: {
    calls: 12,
    seconds: 5,
    note: "a replay of the contract's whole log history, usually one call, plus state checks",
  },
  sources: [
    { id: S.logs, kind: 'chain', url: EVM_ENDPOINTS[0]?.url ?? '' },
    { id: S.members, kind: 'chain', url: EVM_ENDPOINTS[0]?.url ?? '' },
    { id: S.proposals, kind: 'chain', url: EVM_ENDPOINTS[0]?.url ?? '' },
    { id: S.check, kind: 'chain', url: EVM_ENDPOINTS[0]?.url ?? '' },
    { id: S.readme, kind: 'docs', url: README },
  ],
};

/** Who holds what after replaying the logs up to and including a block. */
export interface Replay {
  /** every address that held shares by then, zero included */
  shares: Map<string, bigint>;
  /** SubmitVote events per member */
  votes: Map<string, number>;
  /** passed proposals per applicant, oldest first */
  passed: Map<string, number[]>;
  ragequits: number;
  last_event_block: number;
  proposals: number;
}

const blockOf = (l: EvmLog) => Number.parseInt(l.blockNumber, 16);

export function replayMoloch(logs: EvmLog[], upTo: number): Replay {
  const r: Replay = {
    shares: new Map(),
    votes: new Map(),
    passed: new Map(),
    ragequits: 0,
    last_event_block: 0,
    proposals: 0,
  };
  const add = (a: string, n: bigint) => r.shares.set(a, (r.shares.get(a) ?? 0n) + n);
  for (const l of logs) {
    if (blockOf(l) > upTo) continue;
    r.last_event_block = Math.max(r.last_event_block, blockOf(l));
    const [topic, one, two, three] = l.topics;
    if (topic === TOPIC.summon && one) add(addressOf(one), wordAt(l.data, 0));
    else if (topic === TOPIC.process && one && two && wordAt(l.data, 2) === 1n) {
      const applicant = addressOf(two);
      add(applicant, wordAt(l.data, 1));
      r.passed.set(applicant, [...(r.passed.get(applicant) ?? []), Number(BigInt(one))]);
    } else if (topic === TOPIC.ragequit && one) {
      add(addressOf(one), -wordAt(l.data, 0));
      r.ragequits++;
    } else if (topic === TOPIC.vote && three) {
      const m = addressOf(three);
      r.votes.set(m, (r.votes.get(m) ?? 0) + 1);
    } else if (topic === TOPIC.submit) r.proposals++;
  }
  return r;
}

const NAME = /\bMember(?:ship)? Proposal:\s*([^"\\,}\n]+)/;

/** The name a proposal's text states, or null. Only this one fixed form counts as a name. */
export function nameFromProposal(text: string): string | null {
  const name = NAME.exec(text)?.[1]?.trim();
  return name ? name : null;
}

export interface MolochChecks {
  block: number;
  addresses: number;
  mismatches: string[];
  total_shares_replay: string;
  total_shares_contract: string;
  head_block: number;
  head_addresses: number;
  head_mismatches: string[];
  head_total_shares_replay: string;
  head_total_shares_contract: string;
}

/** Replay vs members() for these addresses at one block, and the sum vs totalShares(). */
async function checkAgainstContract(reader: EvmReader, dao: string, replay: Replay, block: number) {
  const addresses = [...replay.shares.keys()];
  const answers = await reader.multicall(
    [
      { to: dao, data: encodeCall('totalShares()') },
      ...addresses.map((a) => ({
        to: dao,
        data: encodeCall('members(address)', a),
      })),
    ],
    block,
  );
  const [total, ...members] = answers;
  const mismatches = addresses.filter((a, i) => {
    const m = members[i];
    return !m?.ok || wordAt(m.data, 1) !== replay.shares.get(a);
  });
  const sum = [...replay.shares.values()].reduce((x, y) => x + y, 0n);
  return {
    addresses: addresses.length,
    mismatches,
    replay: sum,
    contract: total?.ok ? wordAt(total.data, 0) : -1n,
  };
}

function fail(checks: MolochChecks): never {
  throw new InputError(
    'source_failed',
    `moloch-v1: the replay does not match the contract: ${JSON.stringify(checks)}`,
  );
}

/** Read the snapshot from the chain and check it. Throws when the check fails. */
export async function pullMolochV1(opts: {
  reader: EvmReader;
  dao: string;
  chain?: EvmChain;
  /** the block to read, default the head */
  block?: number;
  /** the head to check against, default the finalized block */
  head?: number | 'finalized';
  /** a block before the DAO was summoned, default 0 */
  fromBlock?: number;
  /** a sentence about this DAO, for a stored fixture */
  note?: string;
  onProgress?: Progress;
}): Promise<{ snapshot: Snapshot; checks: MolochChecks }> {
  const { reader, onProgress } = opts;
  const dao = opts.dao.toLowerCase();
  const chain = opts.chain ?? ETHEREUM;
  const say = (message: string) => onProgress?.({ stage: 'fetching', message });

  const head = await reader.block(opts.head ?? 'finalized');
  const block = opts.block ?? head.number;
  const at = block === head.number ? head : await reader.block(block);
  say(`reading every Moloch v1 log up to block ${head.number}`);
  const logs = await reader.logs({ address: dao }, opts.fromBlock ?? 0, head.number);

  const now = replayMoloch(logs, block);
  const later = replayMoloch(logs, head.number);
  say(`checking ${now.shares.size} addresses against members() at block ${block}`);
  const here = await checkAgainstContract(reader, dao, now, block);
  const pinned = block !== head.number;
  say(`checking ${later.shares.size} addresses against members() at block ${head.number}`);
  const there = pinned ? await checkAgainstContract(reader, dao, later, head.number) : here;
  const checks: MolochChecks = {
    block,
    addresses: here.addresses,
    mismatches: here.mismatches,
    total_shares_replay: here.replay.toString(),
    total_shares_contract: here.contract.toString(),
    head_block: head.number,
    head_addresses: there.addresses,
    head_mismatches: there.mismatches,
    head_total_shares_replay: there.replay.toString(),
    head_total_shares_contract: there.contract.toString(),
  };
  if (
    here.mismatches.length > 0 ||
    there.mismatches.length > 0 ||
    here.replay !== here.contract ||
    there.replay !== there.contract
  )
    fail(checks);

  // the text of each passed proposal: the first that states a name names the applicant
  const passed = [...now.passed.entries()];
  const indexes = [...new Set(passed.flatMap(([, list]) => list))].sort((a, b) => a - b);
  say(`reading the text of ${indexes.length} passed proposals`);
  const texts = await reader.multicall(
    indexes.map((i) => ({
      to: dao,
      data: encodeCall('proposalQueue(uint256)', i),
    })),
    block,
    50,
  );
  const textOf = new Map(
    indexes.map((p, i) => {
      const t = texts[i];
      return [p, t?.ok ? stringAt(t.data, 10) : ''] as const;
    }),
  );
  const named = new Map<string, { name: string; proposal: number }>();
  for (const [applicant, list] of passed)
    for (const p of list) {
      const name = nameFromProposal(textOf.get(p) ?? '');
      if (name) {
        named.set(applicant, { name, proposal: p });
        break;
      }
    }

  // the guild bank, at this block and at the head
  const [bankAnswer, tokenAnswer] = await reader.multicall(
    [
      { to: dao, data: encodeCall('guildBank()') },
      { to: dao, data: encodeCall('approvedToken()') },
    ],
    block,
  );
  if (!bankAnswer?.ok || !tokenAnswer?.ok)
    throw new InputError('source_failed', 'moloch-v1: guildBank() or approvedToken() failed');
  const bank = addressOf(bankAnswer.data);
  const token = addressOf(tokenAnswer.data);
  const balanceCall = { to: token, data: encodeCall('balanceOf(address)', bank) };
  const bankAt = async (b: number) => {
    const [r] = await reader.multicall([balanceCall], b);
    if (!r?.ok) throw new InputError('source_failed', 'moloch-v1: balanceOf(guildBank) failed');
    return wordAt(r.data, 0);
  };
  const bankHere = await bankAt(block);
  const bankThere = pinned ? await bankAt(head.number) : bankHere;

  const members = [...now.shares.entries()]
    .filter(([, n]) => n > 0n)
    .sort(([a, x], [b, y]) => (x > y ? -1 : x < y ? 1 : a < b ? -1 : 1));
  const participants: Participant[] = members.map(([address]) => {
    const name = named.get(address);
    return {
      id: address,
      label: name?.name ?? shortAddress(address),
      kind: 'unknown',
      identity: name ? { name: name.name, source: S.proposals, status: 'self-declared' } : null,
      source: S.logs,
      detail: {
        address,
        votes_submitted: now.votes.get(address) ?? 0,
        proposals_passed: now.passed.get(address) ?? [],
        ...(name ? { named_by_proposal: name.proposal } : {}),
      },
    };
  });
  const holdings: Holding[] = members.map(([address, n]) => ({
    participant: address,
    asset: 'moloch-v1-share',
    measure: 'shares',
    amount: n.toString(),
    amount_raw: n.toString(),
    unit: 'shares',
    as_of: at.as_of,
    source: S.logs,
  }));
  const left = now.shares.size - members.length;
  const bankText = (n: bigint) => fromBaseUnits(n, 18);

  const sources: Snapshot['sources'] = [
    {
      id: S.logs,
      kind: 'chain',
      url: reader.servedBy('logs'),
      method: `eth_getLogs on ${dao}, replayed: SummonComplete, ProcessProposal (passed), Ragequit, SubmitVote`,
      fetched_at: at.as_of,
      block_height: block,
    },
    {
      id: S.members,
      kind: 'chain',
      url: reader.servedBy('state'),
      method: 'members(address) and totalShares() through Multicall2, pinned to the block',
      fetched_at: at.as_of,
      block_height: block,
    },
    {
      id: S.proposals,
      kind: 'chain',
      url: reader.servedBy('state'),
      method: 'proposalQueue(uint256).details of passed proposals, pinned to the block',
      fetched_at: at.as_of,
      block_height: block,
    },
    {
      id: S.check,
      kind: 'chain',
      url: reader.servedBy('state'),
      method: 'members(address) and totalShares() through Multicall3 at the head',
      fetched_at: head.as_of,
      block_height: head.number,
    },
    {
      id: S.readme,
      kind: 'docs',
      url: README,
      method: 'ragequit lets a member leave with a proportional share of the guild bank',
      fetched_at: DOCS_CHECKED_AT,
    },
  ];

  const lastAction = await reader.block(later.last_event_block);
  const total = here.replay.toString();
  const snapshot: Snapshot = {
    petal: 'snapshot/v1',
    network: {
      id: MOLOCH_V1_ID,
      chain: chain.caip2,
      population: `moloch-v1-${chain.id}-${dao}`,
      title: MOLOCH_V1_DESCRIPTOR.title,
      description: MOLOCH_V1_DESCRIPTOR.description,
      params: { dao, chain: chain.id },
    },
    snapshot: { as_of: at.as_of, block_height: block, block_hash: at.hash, final: true },
    coverage: {
      participants_total: members.length,
      participants_included: members.length,
      amount_total: total,
      amount_included: total,
      unit: 'shares',
      measure: 'shares',
      note:
        `Members with shares at block ${grouped(block)} (${dayOf(at.as_of)}). ` +
        `Check: the replay equals members() for all ${here.addresses} addresses seen by this block, and totalShares() is ${grouped(here.contract)}. ` +
        (pinned
          ? `Last check: block ${grouped(head.number)} (${dayOf(head.as_of)}), replay equals members() for all ${there.addresses} addresses, totalShares() is ${grouped(there.contract)}. `
          : '') +
        `Last action on the contract: block ${grouped(later.last_event_block)} (${dayOf(lastAction.as_of)}). ` +
        (opts.note ? `${opts.note} ` : '') +
        `A share is not money: the guild bank held ${bankText(bankHere)} of token ${token} at this block${pinned ? ` and ${bankText(bankThere)} at the last check` : ''}, read as 18 decimals. ` +
        `${left} other addresses held shares earlier and hold none here. ` +
        'Names are text from passed proposals of the form "Membership Proposal: X", self-declared and unverified; every other address is unnamed.',
    },
    sources,
    participants,
    holdings,
    relationships: [],
    events: [],
    module: { id: MOLOCH_V1_ID, version: MOLOCH_V1_VERSION },
  };
  return { snapshot, checks };
}

/** The target in a request's parameters. */
export function molochTarget(params: Params | undefined): {
  chain: EvmChain;
  dao: string;
  population: string;
} {
  const chain = EVM_CHAINS[params?.chain ?? 'ethereum'];
  const dao = String(params?.dao ?? '').toLowerCase();
  if (!chain || !/^0x[0-9a-f]{40}$/.test(dao))
    throw new InputError('bad_input', 'moloch-v1 needs a dao address', {
      hint: 'dao: 0x and 40 hex digits; chain: ethereum, base or arbitrum',
    });
  return { chain, dao, population: `moloch-v1-${chain.id}-${dao}` };
}

/** Any Moloch v1 DAO. `fixtures` is the folder holding index.json (default: this repo's). */
export function molochV1(opts: { fixtures?: string } = {}): InputModule {
  return paramModule({
    descriptor: MOLOCH_V1_DESCRIPTOR,
    keyFor: (params) => {
      const t = molochTarget(params);
      return { chain: t.chain.caip2, population: t.population };
    },
    pinnable: true,
    head: async (params, block) => {
      const b = await evmReader({ chain: molochTarget(params).chain }).block(block ?? 'finalized');
      return { block_height: b.number, as_of: b.as_of };
    },
    pull: async (at, params, onProgress) => {
      const { chain, dao } = molochTarget(params);
      const { snapshot } = await pullMolochV1({
        reader: evmReader({ chain }),
        dao,
        chain,
        block: at.block_height,
        ...(onProgress ? { onProgress } : {}),
      });
      return snapshot;
    },
    ...opts,
  });
}

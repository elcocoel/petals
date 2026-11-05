// beanstalk (T159): who held Beanstalk's voting power on two blocks in April 2022, the block
// before and the block in which one address went to 79.63% of it.
//
// Stored: two snapshots in fixtures/snapshots/. pullBeanstalk reads them again in about 30
// keyless calls, run by scripts/pull-module.ts.
//
// Power is `balanceOfRoots` on the Silo, read at each block for every address that ever deposited
// or voted. Check: the largest share at the attack block is reproduced from the stored rows
// (79.63% of `totalRoots()`), and the rows sum to `totalRoots()` less a stated remainder.
//
// No labels. The address carries no name here: Beanstalk's post on the event gives no address.
import type {
  Holding,
  NetworkDescriptor,
  Participant,
  Progress,
  Snapshot,
} from '@petal/core/types';
import { InputError } from '../errors.ts';
import { addressOf, encodeCall, eventTopic, shortAddress, wordAt } from '../evm/abi.ts';
import { ETHEREUM_CHAIN, EVM_ENDPOINTS, type EvmReader } from '../evm/reader.ts';
import type { InputModule } from '../index.ts';
import { dayOf, grouped, percent2, plainCapabilities } from './plain.ts';
import { storedReads } from './stored.ts';

export const BEANSTALK_ID = 'beanstalk';
export const BEANSTALK_VERSION = 'evm/1';
export const BEANSTALK_DIAMOND = '0xc1e088fc1323b20bcbee9bd1b9fc9546db5624c5';
export const BEANSTALK_BEFORE = 14602789;
export const BEANSTALK_ATTACK = 14602790;
/** Earlier than Beanstalk's first deposit. */
const FIRST_BLOCK = 12972032;
const VOTE_WINDOW = 200_000;
const MAX_UNEXPLAINED_DIVISOR = 1000n;
const README = 'https://github.com/BeanstalkFarms/Beanstalk';
const POST = 'https://bean.money/bip-18';
/** When the two documents were last read. */
const DOCS_CHECKED_AT = '2026-11-05T12:00:00Z';

const S = {
  deposits: 'beanstalk-deposits',
  votes: 'beanstalk-votes',
  roots: 'beanstalk-roots',
  readme: 'beanstalk-readme',
  post: 'beanstalk-post',
} as const;

const VOTE = eventTopic('Vote(address,uint32,uint256)');
const DEPOSITS = [
  eventTopic('BeanDeposit(address,uint256,uint256)'),
  eventTopic('LPDeposit(address,uint256,uint256,uint256)'),
  eventTopic('Deposit(address,address,uint256,uint256,uint256)'),
];

export const BEANSTALK_DESCRIPTOR: NetworkDescriptor = {
  id: BEANSTALK_ID,
  chain: ETHEREUM_CHAIN,
  population: 'beanstalk-silo',
  kind: 'protocol',
  title: 'Beanstalk, April 2022',
  description:
    "Beanstalk's voting roots on two Ethereum blocks of 2022-04-17: block 14,602,789 and block 14,602,790, in which one address went to 79.63% of all roots. Ask for a block; latest is the later one.",
  params: {},
  capabilities: plainCapabilities({
    measure: { id: 'voting_roots', unit: 'roots', label: 'Beanstalk voting roots' },
    sources: [S.roots],
    kind: { meaning: 'every address is of unknown kind', sources: [S.deposits] },
    identity: { meaning: 'anonymous: no source read here names an address', sources: [S.roots] },
  }),
  live: false,
  cost: {
    calls: 0,
    seconds: 0,
    note: 'stored: served from the fixtures at blocks 14,602,789 and 14,602,790. pullBeanstalk reads them again in about 30 keyless calls.',
  },
  sources: [
    { id: S.deposits, kind: 'chain', url: EVM_ENDPOINTS[0]?.url ?? '' },
    { id: S.votes, kind: 'chain', url: EVM_ENDPOINTS[0]?.url ?? '' },
    { id: S.roots, kind: 'chain', url: EVM_ENDPOINTS[0]?.url ?? '' },
    { id: S.readme, kind: 'docs', url: README },
    { id: S.post, kind: 'docs', url: POST },
  ],
};

export interface BeanstalkVote {
  voter: string;
  bip: number;
  block: number;
}

export interface BeanstalkList {
  /** every address that deposited in the Silo up to the attack block */
  depositors: string[];
  /** Vote events in the 200,000 blocks up to the attack block */
  votes: BeanstalkVote[];
}

export async function readBeanstalkList(
  reader: EvmReader,
  onProgress?: Progress,
): Promise<BeanstalkList> {
  const accounts = new Set<string>();
  for await (const page of reader.logPages(
    { address: BEANSTALK_DIAMOND, topics: [DEPOSITS] },
    FIRST_BLOCK,
    BEANSTALK_ATTACK,
  )) {
    for (const l of page) if (l.topics[1]) accounts.add(addressOf(l.topics[1]));
    onProgress?.({ stage: 'fetching', message: `${accounts.size} depositors so far` });
  }
  const voteLogs = await reader.logs(
    { address: BEANSTALK_DIAMOND, topics: [VOTE] },
    BEANSTALK_ATTACK - VOTE_WINDOW,
    BEANSTALK_ATTACK,
  );
  const votes = voteLogs.flatMap((l) =>
    l.topics[1] && l.topics[2]
      ? [
          {
            voter: addressOf(l.topics[1]),
            bip: Number(BigInt(l.topics[2])),
            block: Number.parseInt(l.blockNumber, 16),
          },
        ]
      : [],
  );
  return { depositors: [...accounts].sort(), votes };
}

export interface BeanstalkChecks {
  block: number;
  addresses: number;
  with_roots: number;
  sum_raw: string;
  total_roots_raw: string;
  total_stalk_raw: string;
  /** totalRoots minus the sum of the rows */
  remainder_raw: string;
  largest: string;
  largest_share: string;
}

/** Read one block. `list` is the same for both blocks, so it is read once. */
export async function pullBeanstalk(opts: {
  reader: EvmReader;
  block: number;
  list: BeanstalkList;
  onProgress?: Progress;
}): Promise<{ snapshot: Snapshot; checks: BeanstalkChecks }> {
  const { reader, block, list, onProgress } = opts;
  const at = await reader.block(block);
  const addresses = [...new Set([...list.depositors, ...list.votes.map((v) => v.voter)])].sort();
  onProgress?.({
    stage: 'fetching',
    message: `reading balanceOfRoots of ${addresses.length} addresses at block ${block}`,
  });
  const answers = await reader.multicall(
    [
      { to: BEANSTALK_DIAMOND, data: encodeCall('totalRoots()') },
      { to: BEANSTALK_DIAMOND, data: encodeCall('totalStalk()') },
      ...addresses.map((a) => ({
        to: BEANSTALK_DIAMOND,
        data: encodeCall('balanceOfRoots(address)', a),
      })),
    ],
    block,
  );
  const [totalAnswer, stalkAnswer, ...balances] = answers;
  if (!totalAnswer?.ok || !stalkAnswer?.ok)
    throw new InputError('source_failed', `beanstalk: totalRoots() failed at block ${block}`);
  const totalRoots = wordAt(totalAnswer.data, 0);
  const totalStalk = wordAt(stalkAnswer.data, 0);

  const rows = addresses
    .map((address, i) => {
      const b = balances[i];
      if (!b?.ok) throw new InputError('source_failed', `beanstalk: no roots for ${address}`);
      return { address, roots: wordAt(b.data, 0) };
    })
    .filter((r) => r.roots > 0n)
    .sort((x, y) =>
      x.roots > y.roots ? -1 : x.roots < y.roots ? 1 : x.address < y.address ? -1 : 1,
    );
  const sum = rows.reduce((a, r) => a + r.roots, 0n);
  const largest = rows[0];
  if (!largest) throw new InputError('source_failed', `beanstalk: nobody holds roots at ${block}`);

  const votesBy = new Map<string, BeanstalkVote[]>();
  for (const v of list.votes)
    if (v.block <= block) votesBy.set(v.voter, [...(votesBy.get(v.voter) ?? []), v]);

  const participants: Participant[] = rows.map(({ address }) => {
    const votes = votesBy.get(address);
    return {
      id: address,
      label: shortAddress(address),
      kind: 'unknown',
      identity: null,
      source: S.deposits,
      detail: {
        address,
        ...(votes ? { votes: votes.map((v) => ({ bip: v.bip, block: v.block })) } : {}),
      },
    };
  });
  const holdings: Holding[] = rows.map(({ address, roots }) => ({
    participant: address,
    asset: `${BEANSTALK_DIAMOND}:roots`,
    measure: 'voting_roots',
    amount: roots.toString(),
    amount_raw: roots.toString(),
    unit: 'roots',
    as_of: at.as_of,
    source: S.roots,
  }));

  // The deposit events do not explain every root: a small, constant part stays unread. A larger
  // gap means the list of addresses is wrong, so it stops here.
  const remainder = totalRoots - sum;
  if (remainder < 0n || remainder * MAX_UNEXPLAINED_DIVISOR > totalRoots)
    throw new InputError(
      'source_failed',
      `beanstalk: the rows sum to ${sum}, totalRoots() is ${totalRoots} at block ${block}`,
    );
  const checks: BeanstalkChecks = {
    block,
    addresses: addresses.length,
    with_roots: rows.length,
    sum_raw: sum.toString(),
    total_roots_raw: totalRoots.toString(),
    total_stalk_raw: totalStalk.toString(),
    remainder_raw: remainder.toString(),
    largest: largest.address,
    largest_share: percent2(largest.roots, totalRoots),
  };
  const stalk = totalStalk / 10n ** 10n;
  const biggestVotes = votesBy.get(largest.address);
  const lastVote = biggestVotes?.at(-1);

  const sources: Snapshot['sources'] = [
    {
      id: S.deposits,
      kind: 'chain',
      url: reader.servedBy('logs'),
      method: `eth_getLogs on ${BEANSTALK_DIAMOND}: BeanDeposit, LPDeposit and Deposit up to block ${BEANSTALK_ATTACK}, for the list of addresses`,
      fetched_at: at.as_of,
      block_height: BEANSTALK_ATTACK,
    },
    {
      id: S.votes,
      kind: 'chain',
      url: reader.servedBy('logs'),
      method: `eth_getLogs on ${BEANSTALK_DIAMOND}: Vote in the ${grouped(VOTE_WINDOW)} blocks up to block ${BEANSTALK_ATTACK}`,
      fetched_at: at.as_of,
      block_height: BEANSTALK_ATTACK,
    },
    {
      id: S.roots,
      kind: 'chain',
      url: reader.servedBy('state'),
      method:
        'balanceOfRoots(address), totalRoots() and totalStalk() through Multicall3, pinned to the block',
      fetched_at: at.as_of,
      block_height: block,
    },
    {
      id: S.readme,
      kind: 'docs',
      url: README,
      method: 'the README links this address as the Beanstalk contract',
      fetched_at: DOCS_CHECKED_AT,
    },
    {
      id: S.post,
      kind: 'docs',
      url: POST,
      method:
        "Beanstalk's post on the event dates it to about 12:24 UTC on 2022-04-17 and gives no address",
      fetched_at: DOCS_CHECKED_AT,
    },
  ];

  const total = totalRoots.toString();
  const snapshot: Snapshot = {
    petal: 'snapshot/v1',
    network: {
      id: BEANSTALK_ID,
      chain: ETHEREUM_CHAIN,
      population: BEANSTALK_DESCRIPTOR.population,
      title: BEANSTALK_DESCRIPTOR.title,
      description: BEANSTALK_DESCRIPTOR.description,
    },
    snapshot: { as_of: at.as_of, block_height: block, block_hash: at.hash, final: true },
    coverage: {
      participants_total: rows.length,
      participants_included: rows.length,
      amount_total: total,
      amount_included: sum.toString(),
      unit: 'roots',
      measure: 'voting_roots',
      note:
        `Voting roots at block ${grouped(block)} (${at.as_of}), read for every address that deposited or voted by block ${grouped(BEANSTALK_ATTACK)}: ${grouped(addresses.length)} addresses, ${grouped(rows.length)} with roots. ` +
        `Check: the rows sum to ${sum === totalRoots ? 'totalRoots()' : `totalRoots() less ${grouped(remainder)}, or ${percent2(remainder, totalRoots)}%, which no address in this list holds and which is not explained here; shares of the flower are of the rows`}. ` +
        `Largest: ${largest.address} with ${percent2(largest.roots, totalRoots)}% of totalRoots. Total Stalk ${grouped(stalk)}. ` +
        (lastVote
          ? `That address cast a Vote on bip ${lastVote.bip} at block ${grouped(lastVote.block)}. `
          : '') +
        `Beanstalk dates an attack on its governance to about 12:24 UTC on ${dayOf(at.as_of)}; its post gives no address, so no address here is named or called anything. ` +
        'Roots are voting power in the Silo at this block, not money held.',
    },
    sources,
    participants,
    holdings,
    relationships: [],
    events: [],
    module: { id: BEANSTALK_ID, version: BEANSTALK_VERSION },
  };
  return { snapshot, checks };
}

/** The stored module. `fixtures` is the folder holding index.json (default: this repo's). */
export function beanstalk(opts: { fixtures?: string } = {}): InputModule {
  const reads = storedReads(BEANSTALK_ID, opts);
  return {
    descriptor: BEANSTALK_DESCRIPTOR,
    resolveAt: (at) => reads.resolveAt(at),
    fetch: (at, _params, onProgress) => reads.fetch(at, onProgress),
  };
}

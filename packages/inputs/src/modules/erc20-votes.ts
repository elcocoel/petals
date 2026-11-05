// erc20-votes (T160): delegates and their votes on an ERC20Votes token, read from the chain.
// Any token that emits DelegateVotesChanged and answers getVotes; ENS is the test, others are
// untested.
//
// Stored: a network per token, served from fixtures/snapshots/. pullErc20Votes reads it again by
// paging every DelegateVotesChanged log (about 50 keyless calls for ENS) and keeping only the
// latest balance per delegate, so memory holds one page at a time.
//
// Check: getVotes at the block equals the replay for the 400 largest delegates, which covers every
// delegate a flower can draw (at most 300 petals). A second one comes free: each log's previous
// balance must equal the balance replayed so far, so a missing page cannot pass unnoticed.
//
// Plain flower only: delegates and votes. Backer segments wait, because segments/backers.ts holds
// NEAR labels. No names: reverse ENS records are not read here.
import type {
  Holding,
  NetworkDescriptor,
  Participant,
  Progress,
  Snapshot,
} from '@petal/core/types';
import { InputError } from '../errors.ts';
import { addressOf, encodeCall, eventTopic, shortAddress, stringAt, wordAt } from '../evm/abi.ts';
import { ETHEREUM_CHAIN, EVM_ENDPOINTS, type EvmLog, type EvmReader } from '../evm/reader.ts';
import { fromBaseUnits } from '../import/spike.ts';
import type { InputModule } from '../index.ts';
import { dayOf, grouped, percent2, plainCapabilities } from './plain.ts';
import { storedReads } from './stored.ts';

export const ERC20_VOTES_MODULE = 'erc20-votes';
export const ERC20_VOTES_VERSION = 'evm/1';
/** Delegates checked against getVotes. A flower draws at most 300. */
export const VOTES_CHECKED = 400;
const VOTES_CHANGED = eventTopic('DelegateVotesChanged(address,uint256,uint256)');
/** When the token's documents were last read. */
const DOCS_CHECKED_AT = '2026-11-05T12:00:00Z';

const S = {
  logs: 'erc20-votes-logs',
  state: 'erc20-votes-state',
  docs: 'erc20-votes-token-docs',
} as const;

export interface VotesToken {
  /** the network id, e.g. ens-delegates */
  id: string;
  symbol: string;
  address: string;
  /** the token's deployment block, or earlier */
  from_block: number;
  title: string;
  population: string;
  /** a page that names this contract as the token */
  docs: { url: string; says: string };
}

export const ENS_TOKEN: VotesToken = {
  id: 'ens-delegates',
  symbol: 'ENS',
  address: '0xc18360217d8f7ab5e7c516566761ea12ce7f9d72',
  from_block: 13533418,
  title: 'ENS delegates',
  population: 'ens-delegates',
  docs: {
    url: 'https://docs.ens.domains/dao/token',
    says: 'names the ENS token, token.ensdao.eth',
  },
};

export function votesDescriptor(t: VotesToken): NetworkDescriptor {
  return {
    id: t.id,
    chain: ETHEREUM_CHAIN,
    population: t.population,
    kind: 'dao',
    title: t.title,
    description: `Delegates on the ${t.symbol} token on Ethereum and the votes delegated to each, at one block. Holders who set no delegate carry no votes and are not here. Whether a delegate has voted is not read.`,
    params: {},
    capabilities: plainCapabilities({
      measure: { id: 'delegated_votes', unit: t.symbol, label: `${t.symbol} delegated votes` },
      sources: [S.logs, S.state],
      kind: { meaning: 'every delegate is an address of unknown kind', sources: [S.logs] },
      identity: { meaning: 'anonymous: names are not read here', sources: [S.logs] },
    }),
    live: false,
    cost: {
      calls: 0,
      seconds: 0,
      note: 'stored: served from the fixture. pullErc20Votes reads it again by paging every DelegateVotesChanged log, about 50 keyless calls for ENS.',
    },
    sources: [
      { id: S.logs, kind: 'chain', url: EVM_ENDPOINTS[0]?.url ?? '' },
      { id: S.state, kind: 'chain', url: EVM_ENDPOINTS[0]?.url ?? '' },
      { id: S.docs, kind: 'docs', url: t.docs.url },
    ],
  };
}

/** Running state of the replay: the latest balance per delegate. */
export interface VotesReplay {
  votes: Map<string, bigint>;
  logs: number;
  /** logs whose previous balance is not the balance replayed so far */
  breaks: number;
}

export const newVotesReplay = (): VotesReplay => ({ votes: new Map(), logs: 0, breaks: 0 });

/** Apply one page, in block order. Mutates and returns `r`. */
export function applyVotesLogs(r: VotesReplay, page: EvmLog[]): VotesReplay {
  for (const l of page) {
    const topic = l.topics[1];
    if (!topic) continue;
    const delegate = addressOf(topic);
    if (wordAt(l.data, 0) !== (r.votes.get(delegate) ?? 0n)) r.breaks++;
    r.votes.set(delegate, wordAt(l.data, 1));
    r.logs++;
  }
  return r;
}

export interface VotesCheck {
  block: number;
  checked: number;
  /** delegates whose getVotes differs from the replay */
  mismatches: string[];
}

/** getVotes at the block against the replayed votes of the given delegates. */
export async function checkGetVotes(
  reader: EvmReader,
  token: Pick<VotesToken, 'address'>,
  block: number,
  rows: { address: string; votes: bigint }[],
): Promise<VotesCheck> {
  const answers = await reader.multicall(
    rows.map((r) => ({ to: token.address, data: encodeCall('getVotes(address)', r.address) })),
    block,
  );
  const mismatches = rows
    .filter((r, i) => {
      const a = answers[i];
      return !a?.ok || wordAt(a.data, 0) !== r.votes;
    })
    .map((r) => r.address);
  return { block, checked: rows.length, mismatches };
}

export interface VotesChecks extends VotesCheck {
  logs: number;
  breaks: number;
  delegates: number;
  sum_raw: string;
  total_supply_raw: string;
}

/** Read the snapshot from the chain and check it. Throws when a check fails. */
export async function pullErc20Votes(
  token: VotesToken,
  opts: { reader: EvmReader; block?: number; onProgress?: Progress },
): Promise<{ snapshot: Snapshot; checks: VotesChecks }> {
  const { reader, onProgress } = opts;
  const say = (message: string) => onProgress?.({ stage: 'fetching', message });
  const at = await reader.block(opts.block ?? 'finalized');

  const replay = newVotesReplay();
  for await (const page of reader.logPages(
    { address: token.address, topics: [VOTES_CHANGED] },
    token.from_block,
    at.number,
  )) {
    applyVotesLogs(replay, page);
    say(`${grouped(replay.logs)} logs, ${grouped(replay.votes.size)} delegates so far`);
  }

  const rows = [...replay.votes.entries()]
    .filter(([, v]) => v > 0n)
    .map(([address, votes]) => ({ address, votes }))
    .sort((a, b) =>
      a.votes > b.votes ? -1 : a.votes < b.votes ? 1 : a.address < b.address ? -1 : 1,
    );
  const sum = rows.reduce((a, r) => a + r.votes, 0n);

  const facts = await reader.multicall(
    ['decimals()', 'totalSupply()', 'symbol()'].map((sig) => ({
      to: token.address,
      data: encodeCall(sig),
    })),
    at.number,
  );
  const [decimalsAnswer, supplyAnswer, symbolAnswer] = facts;
  if (!decimalsAnswer?.ok || !supplyAnswer?.ok || !symbolAnswer?.ok)
    throw new InputError('source_failed', `${token.id}: decimals() or totalSupply() failed`);
  const decimals = Number(wordAt(decimalsAnswer.data, 0));
  const supply = wordAt(supplyAnswer.data, 0);
  const onChainSymbol = stringAt(symbolAnswer.data, 0);
  if (onChainSymbol !== token.symbol)
    throw new InputError(
      'source_failed',
      `${token.id}: the contract says its symbol is ${onChainSymbol}, not ${token.symbol}`,
    );

  say(`checking the ${Math.min(VOTES_CHECKED, rows.length)} largest delegates against getVotes`);
  const check = await checkGetVotes(reader, token, at.number, rows.slice(0, VOTES_CHECKED));
  const checks: VotesChecks = {
    ...check,
    logs: replay.logs,
    breaks: replay.breaks,
    delegates: rows.length,
    sum_raw: sum.toString(),
    total_supply_raw: supply.toString(),
  };
  if (check.mismatches.length > 0 || replay.breaks > 0)
    throw new InputError(
      'source_failed',
      `${token.id}: the replay does not match the contract: ${check.mismatches.length} getVotes mismatches, ${replay.breaks} breaks in ${replay.logs} logs`,
    );

  const participants: Participant[] = rows.map(({ address }) => ({
    id: address,
    label: shortAddress(address),
    kind: 'unknown',
    identity: null,
    source: S.logs,
  }));
  const holdings: Holding[] = rows.map(({ address, votes }) => ({
    participant: address,
    asset: token.address,
    measure: 'delegated_votes',
    amount: fromBaseUnits(votes, decimals),
    amount_raw: votes.toString(),
    unit: token.symbol,
    as_of: at.as_of,
    source: S.logs,
  }));
  const sources: Snapshot['sources'] = [
    {
      id: S.logs,
      kind: 'chain',
      url: reader.servedBy('logs'),
      method: `eth_getLogs on ${token.address}: DelegateVotesChanged, replayed to the latest balance per delegate`,
      fetched_at: at.as_of,
      block_height: at.number,
    },
    {
      id: S.state,
      kind: 'chain',
      url: reader.servedBy('state'),
      method:
        'getVotes(address), totalSupply(), decimals() and symbol() through Multicall3, pinned to the block',
      fetched_at: at.as_of,
      block_height: at.number,
    },
    {
      id: S.docs,
      kind: 'docs',
      url: token.docs.url,
      method: token.docs.says,
      fetched_at: DOCS_CHECKED_AT,
    },
  ];
  const total = fromBaseUnits(sum, decimals);
  const snapshot: Snapshot = {
    petal: 'snapshot/v1',
    network: {
      id: token.id,
      chain: ETHEREUM_CHAIN,
      population: token.population,
      title: token.title,
      description: votesDescriptor(token).description,
      params: { token: token.address },
    },
    snapshot: { as_of: at.as_of, block_height: at.number, block_hash: at.hash, final: true },
    coverage: {
      participants_total: rows.length,
      participants_included: rows.length,
      amount_total: total,
      amount_included: total,
      unit: token.symbol,
      measure: 'delegated_votes',
      note:
        `Delegated votes at block ${grouped(at.number)} (${dayOf(at.as_of)}), by replay of ${grouped(replay.logs)} DelegateVotesChanged logs; each log's previous balance equals the replayed one. ` +
        `Check: getVotes equals the replay for the ${grouped(check.checked)} largest delegates, which covers every delegate a flower can draw. ` +
        `All delegated votes are ${total} ${token.symbol}, ${percent2(sum, supply)}% of totalSupply() ${fromBaseUnits(supply, decimals)}: tokens with no delegate set carry no votes and are not here. ` +
        'Having votes is not having used them: VoteCast and off-chain Snapshot votes are not read here. Anyone can delegate to anyone without consent, and a large backer may be the delegate itself. ' +
        'No names: reverse records are not read, so every delegate is an address. Who backs each delegate is not split out.',
    },
    sources,
    participants,
    holdings,
    relationships: [],
    events: [],
    module: { id: ERC20_VOTES_MODULE, version: ERC20_VOTES_VERSION },
  };
  return { snapshot, checks };
}

/** The stored module for one token. `fixtures` is the folder holding index.json. */
export function erc20Votes(token: VotesToken, opts: { fixtures?: string } = {}): InputModule {
  const reads = storedReads(token.id, opts);
  return {
    descriptor: votesDescriptor(token),
    resolveAt: (at) => reads.resolveAt(at),
    fetch: (at, _params, onProgress) => reads.fetch(at, onProgress),
  };
}

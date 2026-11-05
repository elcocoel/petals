// erc20-votes (T160): delegates and their votes on an ERC20Votes token, read from the chain. The
// target is a parameter: `token`, and optionally `chain`. A fixture with the same parameters answers
// first; otherwise pullErc20Votes pages every DelegateVotesChanged log and keeps only the latest
// balance per delegate, so memory holds one page at a time. This replays the token's whole history.
//
// Check: getVotes at the block (getCurrentVotes on a Compound-style token such as UNI) equals the
// replay for the 400 largest delegates, which covers every delegate a flower can draw (at most 300
// petals). A second one comes free: each log's previous balance must equal the balance replayed so
// far, so a missing page cannot pass unnoticed.
//
// Plain flower only: delegates and votes. Backer segments wait, because segments/backers.ts holds
// NEAR labels. No names: reverse ENS records are not read here.
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
import { dayOf, grouped, percent2, plainCapabilities } from './plain.ts';
import { paramModule } from './stored.ts';

export const ERC20_VOTES_MODULE = 'erc20-votes';
export const ERC20_VOTES_VERSION = 'evm/1';
/** Delegates checked against getVotes. A flower draws at most 300. */
export const VOTES_CHECKED = 400;
const VOTES_CHANGED = eventTopic('DelegateVotesChanged(address,uint256,uint256)');
/** A read through get_snapshot stops here and says so: about 600,000 logs, about a minute. */
const MAX_LOG_CALLS = 60;

const S = { logs: 'erc20-votes-logs', state: 'erc20-votes-state' } as const;

export interface VotesToken {
  chain: EvmChain;
  /** lowercase */
  token: string;
  population: string;
  /** a block before the token's first delegation, default 0 */
  from_block?: number;
}

/** The target in a request's parameters. */
export function votesTarget(params: Params | undefined): VotesToken {
  const chain = EVM_CHAINS[params?.chain ?? 'ethereum'];
  const token = String(params?.token ?? '').toLowerCase();
  if (!chain || !/^0x[0-9a-f]{40}$/.test(token))
    throw new InputError('bad_input', 'erc20-votes needs a token address', {
      hint: 'token: 0x and 40 hex digits; chain: ethereum, base or arbitrum',
    });
  return { chain, token, population: `erc20-votes-${chain.id}-${token}` };
}

export const ERC20_VOTES_DESCRIPTOR: NetworkDescriptor = {
  id: ERC20_VOTES_MODULE,
  chain: ETHEREUM.caip2,
  population: 'erc20-votes',
  kind: 'dao',
  title: 'ERC20Votes delegates',
  description:
    'Delegates on an ERC20Votes token and the votes delegated to each, at one block. Holders who set no delegate carry no votes and are not here. Whether a delegate has voted is not read. Give the token address.',
  params: {
    token: {
      required: true,
      description: 'the token contract address; it must answer getVotes or getCurrentVotes',
      pattern: '^0x[0-9a-fA-F]{40}$',
      example: '0xc18360217d8f7ab5e7c516566761ea12ce7f9d72',
    },
    chain: {
      required: false,
      description: 'ethereum (default), base or arbitrum',
      pattern: '^(ethereum|base|arbitrum)$',
      example: 'ethereum',
    },
  },
  capabilities: plainCapabilities({
    measure: { id: 'delegated_votes', unit: 'votes', label: 'delegated votes' },
    sources: [S.logs, S.state],
    kind: { meaning: 'every delegate is an address of unknown kind', sources: [S.logs] },
    identity: { meaning: 'anonymous: names are not read here', sources: [S.logs] },
  }),
  live: true,
  cost: {
    calls: 50,
    seconds: 30,
    note: "a replay of the token's whole delegation history: 2 calls per 20,000 logs. Stops at 60 log calls and says so.",
  },
  sources: [
    { id: S.logs, kind: 'chain', url: EVM_ENDPOINTS[0]?.url ?? '' },
    { id: S.state, kind: 'chain', url: EVM_ENDPOINTS[0]?.url ?? '' },
  ],
};

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
  /** delegates whose votes on the contract differ from the replay */
  mismatches: string[];
  /** which function answered: getVotes or getCurrentVotes */
  fn: string;
}

/**
 * The replayed votes against the contract at the block: getVotes, or getCurrentVotes on a
 * Compound-style token (UNI, COMP), which has no getVotes.
 */
export async function checkGetVotes(
  reader: EvmReader,
  token: string,
  block: number,
  rows: { address: string; votes: bigint }[],
): Promise<VotesCheck> {
  const ask = (fn: string) =>
    reader.multicall(
      rows.map((r) => ({ to: token, data: encodeCall(`${fn}(address)`, r.address) })),
      block,
    );
  let fn = 'getVotes';
  let answers = await ask(fn);
  if (rows.length > 0 && answers.every((a) => !a.ok)) {
    fn = 'getCurrentVotes';
    answers = await ask(fn);
  }
  const mismatches = rows
    .filter((r, i) => {
      const a = answers[i];
      return !a?.ok || wordAt(a.data, 0) !== r.votes;
    })
    .map((r) => r.address);
  return { block, checked: rows.length, mismatches, fn };
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
    { address: token.token, topics: [VOTES_CHANGED] },
    token.from_block ?? 0,
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
      to: token.token,
      data: encodeCall(sig),
    })),
    at.number,
  );
  const [decimalsAnswer, supplyAnswer, symbolAnswer] = facts;
  if (!decimalsAnswer?.ok || !supplyAnswer?.ok || !symbolAnswer?.ok)
    throw new InputError('source_failed', `${token.token}: decimals() or totalSupply() failed`);
  const decimals = Number(wordAt(decimalsAnswer.data, 0));
  const supply = wordAt(supplyAnswer.data, 0);
  const symbol = stringAt(symbolAnswer.data, 0);

  say(
    `checking the ${Math.min(VOTES_CHECKED, rows.length)} largest delegates against the contract`,
  );
  const check = await checkGetVotes(reader, token.token, at.number, rows.slice(0, VOTES_CHECKED));
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
      `${token.token}: the replay does not match the contract: ${check.mismatches.length} getVotes mismatches, ${replay.breaks} breaks in ${replay.logs} logs`,
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
    asset: token.token,
    measure: 'delegated_votes',
    amount: fromBaseUnits(votes, decimals),
    amount_raw: votes.toString(),
    unit: symbol,
    as_of: at.as_of,
    source: S.logs,
  }));
  const sources: Snapshot['sources'] = [
    {
      id: S.logs,
      kind: 'chain',
      url: reader.servedBy('logs'),
      method: `eth_getLogs on ${token.token}: DelegateVotesChanged, replayed to the latest balance per delegate`,
      fetched_at: at.as_of,
      block_height: at.number,
    },
    {
      id: S.state,
      kind: 'chain',
      url: reader.servedBy('state'),
      method: `${check.fn}(address), totalSupply(), decimals() and symbol() through Multicall3, pinned to the block`,
      fetched_at: at.as_of,
      block_height: at.number,
    },
  ];
  const total = fromBaseUnits(sum, decimals);
  const snapshot: Snapshot = {
    petal: 'snapshot/v1',
    network: {
      id: ERC20_VOTES_MODULE,
      chain: token.chain.caip2,
      population: token.population,
      title: `${symbol} delegates`,
      description: ERC20_VOTES_DESCRIPTOR.description,
      params: { token: token.token, chain: token.chain.id },
    },
    snapshot: { as_of: at.as_of, block_height: at.number, block_hash: at.hash, final: true },
    coverage: {
      participants_total: rows.length,
      participants_included: rows.length,
      amount_total: total,
      amount_included: total,
      unit: symbol,
      measure: 'delegated_votes',
      note:
        `Delegated votes at block ${grouped(at.number)} (${dayOf(at.as_of)}), by replay of ${grouped(replay.logs)} DelegateVotesChanged logs; each log's previous balance equals the replayed one. ` +
        `Check: ${check.fn} equals the replay for the ${grouped(check.checked)} largest delegates, which covers every delegate a flower can draw. ` +
        `All delegated votes are ${total} ${symbol}, ${percent2(sum, supply)}% of totalSupply() ${fromBaseUnits(supply, decimals)}: tokens with no delegate set carry no votes and are not here. ` +
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

/** Any ERC20Votes token. `fixtures` is the folder holding index.json (default: this repo's). */
export function erc20Votes(opts: { fixtures?: string } = {}): InputModule {
  return paramModule({
    descriptor: ERC20_VOTES_DESCRIPTOR,
    keyFor: (params) => {
      const t = votesTarget(params);
      return { chain: t.chain.caip2, population: t.population };
    },
    pinnable: true,
    head: async (params, block) => {
      const b = await evmReader({ chain: votesTarget(params).chain }).block(block ?? 'finalized');
      return { block_height: b.number, as_of: b.as_of };
    },
    pull: async (at, params, onProgress) => {
      const target = votesTarget(params);
      const { snapshot } = await pullErc20Votes(target, {
        reader: evmReader({ chain: target.chain, maxLogCalls: MAX_LOG_CALLS }),
        block: at.block_height,
        ...(onProgress ? { onProgress } : {}),
      });
      return snapshot;
    },
    ...opts,
  });
}

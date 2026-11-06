// Ask the chain what an address is (T164): a few free eth_calls, keyless. An address from anywhere, a search site or a model's memory, is confirmed here before anything is
// drawn.
//
// A token is a ledger of holdings, and transferability is a property of it. ERC-20 balances move
// with transfer(); Moloch shares are a token too, kept in members(), with no transfer function: they
// change by passed proposals and ragequit. Which ledger an address keeps is read from what it
// answers, never assumed.
import { encodeCall, stringAt } from './abi.ts';
import { type AskOptions, askChain } from './ask.ts';
import type { EvmChain } from './chains.ts';
import { decodeAggregate, encodeAggregate3, MULTICALL3 } from './reader.ts';

export type Ledger = 'erc20' | 'moloch-v1' | 'moloch-v2' | 'other';

export interface ContractIdentity {
  /** lowercase */
  address: string;
  /** the ledger of holdings it keeps, or null when it answers none of these calls */
  ledger: Ledger | null;
  /** does transfer() answer? null when the chain's answers don't settle it */
  transferable: boolean | null;
  symbol: string | null;
  /** which function reads delegated votes, on a token that has them */
  votes: 'getVotes' | 'getCurrentVotes' | null;
  /** the calls it answered: the evidence, in plain signatures */
  answered: string[];
  /** the endpoint that answered */
  served_by: string;
}

const SOMEONE = '0x000000000000000000000000000000000000dead';
const CALLS: [string, ...(string | number)[]][] = [
  ['symbol()'],
  ['decimals()'],
  ['totalSupply()'],
  ['balanceOf(address)', SOMEONE],
  ['transfer(address,uint256)', SOMEONE, 0],
  ['getVotes(address)', SOMEONE],
  ['getCurrentVotes(address)', SOMEONE],
  ['totalShares()'],
  ['members(address)', SOMEONE],
  ['approvedToken()'],
  ['depositToken()'],
];

function symbolOf(data: string): string | null {
  try {
    if (data.length === 66)
      return Buffer.from(data.slice(2), 'hex').toString('utf8').replace(/\0+$/, '') || null;
    return stringAt(data, 0) || null;
  } catch {
    return null;
  }
}

/**
 * One eth_call through Multicall3, whatever the number of addresses. An old contract can burn all
 * the gas it is given on a call it doesn't know, which sinks the whole multicall (seen live: "out of
 * gas"), so ask about few addresses at a time. Tenderly refuses plain JSON-RPC batches with HTTP 429.
 * Tries each of the chain's endpoints, and throws ChainDown when none answers.
 */
export async function identifyContracts(
  chain: EvmChain,
  addresses: string[],
  opts: AskOptions = {},
): Promise<ContractIdentity[]> {
  const list = addresses.map((a) => a.toLowerCase());
  const calls = list.flatMap((to) =>
    CALLS.map(([sig, ...args]) => ({ to, data: encodeCall(sig, ...args) })),
  );
  const { result, url } = await askChain<string>(
    chain,
    'eth_call',
    [{ to: MULTICALL3.address, data: encodeAggregate3(calls) }, 'latest'],
    { ...opts, accept: (r) => typeof r === 'string' && r !== '0x' },
  );
  const answers = decodeAggregate(result);
  return list.map((address, i) => {
    const part = answers.slice(i * CALLS.length, (i + 1) * CALLS.length);
    const data = (sig: string) => part[CALLS.findIndex(([s]) => s === sig)];
    const has = (sig: string) => {
      const a = data(sig);
      return a?.ok === true && a.data.length >= 66;
    };
    const answered = CALLS.map(([sig]) => sig).filter(has);
    const shares = has('totalShares()') && has('members(address)');
    const supply = has('totalSupply()') && has('balanceOf(address)');
    const ledger: Ledger | null =
      shares && has('approvedToken()')
        ? 'moloch-v1'
        : shares && has('depositToken()')
          ? 'moloch-v2'
          : supply && has('decimals()')
            ? 'erc20'
            : supply || shares
              ? 'other'
              : null;
    return {
      address,
      ledger,
      transferable: has('transfer(address,uint256)')
        ? true
        : ledger === 'moloch-v1' || ledger === 'moloch-v2'
          ? false
          : null,
      symbol: has('symbol()') ? symbolOf(data('symbol()')?.data ?? '') : null,
      votes: has('getVotes(address)')
        ? 'getVotes'
        : has('getCurrentVotes(address)')
          ? 'getCurrentVotes'
          : null,
      answered,
      served_by: url,
    };
  });
}

// A Baal DAO's (Moloch v3, DAOhaus) proposals and each member's vote (board #93; META's pick, 11 Nov: RaidGuild's
// after NEAR's Marketing DAO), as proposals/v1, from the DAO's own events, keyless, in one log read: each
// proposal's submission, its sponsoring (when voting starts), every vote (approved or not) and its processing
// (passed, and whether its action ran) or cancelling. Baal has no abstain. Each vote and decision has its block
// time. A map of the DAO's shares token finds its Baal by the token's owner, whose sharesToken() names it back.
import {
  type Outcome,
  PROPOSALS_VERSION,
  type Proposal,
  type Proposals,
  titleOf,
} from '@petal/core';
import { addressOf, encodeCall, stringAt, wordAt, wordHex } from '../evm/abi.ts';
import { askChain } from '../evm/ask.ts';
import type { EvmChain } from '../evm/chains.ts';
import type { Fetch } from '../marks/lists.ts';

/** Its events, by topic. */
export const BAAL_EVENTS = {
  submit: '0xb9956173924f9c1204bae41dd3737d7ed1161846d13183879cdc03c4b9f8d019',
  sponsor: '0xd45ad122361f16d6f50d7c4a73638f20ee48eff6186af15224e2a4a1f6d50171',
  vote: '0x786755545a7e27c12c90cc7f0934514d03fdacfe3684a340b8c4100531e7ecd5',
  process: '0xb4571f7e4e2c2b6e6185e47ab5caa5fe34087299bd49fbae945a4583101ee3f0',
  cancel: '0x8896f24cff41b54acf76c2560861f33cd20fd76c4df0b68a3515c354e4b6c81a',
} as const;
const SIGNATURES =
  'SubmitProposal(uint256,bytes32,uint256,bytes,uint256,uint256,bool,uint256,string), SponsorProposal(address,uint256,uint256), SubmitVote(address,uint256,uint256,bool), ProcessProposal(uint256,bool,bool), CancelProposal(uint256)';

/** How long one endpoint gets for the whole log read (rpc.gnosischain.com took about 10 s for RaidGuild's 1,199 events, 11 Nov). */
export const LOGS_TIMEOUT_MS = 60_000;

export interface BaalLog {
  topics: string[];
  data: string;
  blockNumber: string;
  blockTimestamp?: string;
  transactionHash?: string;
}

const opts = (fetchImpl?: Fetch) => (fetchImpl ? { fetch: fetchImpl } : {});

/** The Baal behind a shares token: the token's owner, when its sharesToken() is this token. */
export async function baalOf(
  chain: EvmChain,
  token: string,
  fetchImpl?: Fetch,
): Promise<string | null> {
  const call = async (to: string, sig: string) => {
    try {
      const { result } = await askChain<string>(
        chain,
        'eth_call',
        [{ to, data: encodeCall(sig) }, 'latest'],
        opts(fetchImpl),
      );
      return result && result.length === 66 ? result : null;
    } catch {
      return null;
    }
  };
  const owner = await call(token, 'owner()');
  if (!owner) return null;
  const dao = addressOf(owner);
  const shares = await call(dao, 'sharesToken()');
  return shares && addressOf(shares) === token.toLowerCase() ? dao : null;
}

/** Every event the proposals are made of, in one read of the DAO's logs. */
export async function baalLogs(
  chain: EvmChain,
  dao: string,
  fetchImpl?: Fetch,
): Promise<BaalLog[]> {
  const { result } = await askChain<BaalLog[]>(
    chain,
    'eth_getLogs',
    [{ address: dao, fromBlock: '0x0', toBlock: 'latest', topics: [Object.values(BAAL_EVENTS)] }],
    // one read of the DAO's whole history: a public endpoint takes seconds for it, more than a call's usual 4
    { accept: (r) => Array.isArray(r), timeoutMs: LOGS_TIMEOUT_MS, ...opts(fetchImpl) },
  );
  return result;
}

const timeOf = (l: BaalLog): string | null =>
  l.blockTimestamp ? new Date(Number(BigInt(l.blockTimestamp)) * 1000).toISOString() : null;
const idOf = (topic: string) => BigInt(topic).toString();
const secondsIso = (s: bigint) => new Date(Number(s) * 1000).toISOString();

/** A Baal proposal's title: the title in its details' JSON, or its first words. */
export function baalTitle(details: string): string {
  try {
    const d = JSON.parse(details) as { title?: unknown };
    if (typeof d.title === 'string' && d.title.trim()) return titleOf(d.title);
  } catch {
    // details that aren't JSON: their own first words
  }
  return titleOf(details);
}

/** The DAO's proposals as proposals/v1, from its events. */
export function baalProposals(
  about: string,
  chain: EvmChain,
  dao: string,
  logs: readonly BaalLog[],
  readAt: string,
  now = Date.now(),
): Proposals {
  const byId = new Map<
    string,
    Proposal & { expiration: bigint; period: bigint; self: boolean; submitted: bigint }
  >();
  const sorted = [...logs].sort((a, b) => Number(BigInt(a.blockNumber) - BigInt(b.blockNumber)));
  for (const l of sorted.filter((x) => x.topics[0] === BAAL_EVENTS.submit)) {
    const id = idOf(l.topics[1] as string);
    const period = wordAt(l.data, 0);
    const expiration = wordAt(l.data, 2);
    const self = wordAt(l.data, 4) === 1n;
    const submitted = wordAt(l.data, 5);
    let details = '';
    try {
      details = stringAt(l.data, 6);
    } catch {
      // no details
    }
    byId.set(id, {
      id,
      title: baalTitle(details),
      kind: null,
      proposer: null,
      at: submitted > 0n ? secondsIso(submitted) : (timeOf(l) ?? readAt),
      closes_at: null,
      decided_at: null,
      outcome: 'in progress',
      as_said: 'submitted',
      ref: `proposal:${chain.caip2}:${dao}:${id}`,
      votes: [],
      expiration,
      period,
      self,
      submitted,
    });
  }
  for (const l of sorted) {
    const t = l.topics[0];
    if (t === BAAL_EVENTS.sponsor) {
      const p = byId.get(idOf(l.topics[2] as string));
      if (p) {
        const starts = BigInt(l.topics[3] as string);
        p.closes_at = secondsIso(starts + p.period);
        p.as_said = 'sponsored';
      }
    } else if (t === BAAL_EVENTS.vote) {
      const p = byId.get(idOf(l.topics[2] as string));
      if (p) {
        const approved = BigInt(l.topics[3] as string) === 1n;
        p.votes.push({
          account: addressOf(l.topics[1] as string),
          vote: approved ? 'for' : 'against',
          as_said: approved ? 'approved' : 'not approved',
          at: timeOf(l),
        });
      }
    } else if (t === BAAL_EVENTS.process) {
      const p = byId.get(idOf(l.topics[1] as string));
      if (p) {
        const passed = BigInt(`0x${wordHex(l.data, 0)}`) === 1n;
        const actionFailed = BigInt(`0x${wordHex(l.data, 1)}`) === 1n;
        const outcome: Outcome = passed ? (actionFailed ? 'failed' : 'passed') : 'rejected';
        p.outcome = outcome;
        p.as_said = passed ? (actionFailed ? 'passed, action failed' : 'passed') : 'not passed';
        p.decided_at = timeOf(l);
      }
    } else if (t === BAAL_EVENTS.cancel) {
      const p = byId.get(idOf(l.topics[1] as string));
      if (p) {
        p.outcome = 'cancelled';
        p.as_said = 'cancelled';
        p.decided_at = timeOf(l);
      }
    }
  }
  const proposals: Proposal[] = [...byId.values()].map(
    ({ expiration, period, self, submitted, ...p }) => {
      // a proposal its member sponsored at submission starts its vote then: its period from there
      const closes =
        p.closes_at ?? (self && submitted > 0n ? secondsIso(submitted + period) : null);
      const q = { ...p, closes_at: closes };
      return q.outcome === 'in progress' && expiration > 0n && Number(expiration) * 1000 < now
        ? { ...q, outcome: 'expired' as const, as_said: `${q.as_said}, past its expiration` }
        : q;
    },
  );
  return {
    petal: PROPOSALS_VERSION,
    about,
    source: {
      kind: 'baal',
      contract: `${chain.caip2}:${dao}`,
      ref: `eth_getLogs on ${dao} from its first block: ${SIGNATURES}`,
      at: readAt,
    },
    proposals,
    read_at: readAt,
  };
}

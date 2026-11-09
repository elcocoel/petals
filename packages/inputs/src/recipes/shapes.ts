// The reading shapes a recipe can name (specs/005-mapping-brain/data.md, Readers). Each is generic:
// a recipe gives it a contract, a call or an event, and it answers a value per address. Three now,
// the ones Moloch v3 needs; the other four of the seven are today's modules until a recipe needs one.
import type { Participant } from '@petal/core/types';
import { InputError } from '../errors.ts';
import { addressOf, encodeCall, eventTopic } from '../evm/abi.ts';
import type { EvmChain } from '../evm/chains.ts';
import type { EvmLog, EvmReader } from '../evm/reader.ts';
import { pullErc20Holders } from '../modules/erc20-holders.ts';

export interface ShapeRows {
  values: { id: string; amount: string; raw?: string }[];
  /** the token or contract the values are in */
  asset?: string;
  /** participants as the shape knows them (a holder's kind, a folded tail), where it knows more */
  participants?: Participant[];
  note?: string;
}

const descending = <T extends { n: number; id: string }>(a: T, b: T) =>
  b.n - a.n || (a.id < b.id ? -1 : 1);

/** The holders of the token a contract names through a call, from the token's whole history. */
export async function tokenBalances(
  reader: EvmReader,
  chain: EvmChain,
  contract: string,
  call: string,
  block: number,
  from: number,
): Promise<ShapeRows> {
  const answer = await reader.call(contract, encodeCall(call), block);
  const token = addressOf(answer.slice(2, 66).padStart(64, '0'));
  if (/^0x0{40}$/.test(token))
    throw new InputError('cannot_read', `${call} on ${contract} names no token`, {
      hint: 'This contract may not have that token set up.',
    });
  const { snapshot } = await pullErc20Holders(
    { chain, token, population: `erc20-token-${chain.id}-${token}-full`, from_block: from },
    { reader, block, full: true, ...(chain.blockscout ? {} : { list: 'replay' as const }) },
  );
  return {
    asset: token,
    participants: snapshot.participants,
    values: snapshot.holdings
      .filter((h) => h.measure === 'token_balance')
      .map((h) => ({
        id: h.participant,
        amount: h.amount,
        ...(h.amount_raw ? { raw: h.amount_raw } : {}),
      })),
    note: `token ${token}`,
  };
}

async function eventLogs(
  reader: EvmReader,
  contract: string,
  event: string,
  from: number,
  to: number,
) {
  return reader.logs({ address: contract, topics: [eventTopic(event)] }, from, to);
}

/** How many times each address appears in an indexed field of an event. */
export async function countByParticipant(
  reader: EvmReader,
  contract: string,
  event: string,
  topic: number,
  from: number,
  to: number,
): Promise<ShapeRows> {
  const logs = await eventLogs(reader, contract, event, from, to);
  const counts = new Map<string, number>();
  for (const l of logs) {
    const word = l.topics[topic];
    if (!word) continue;
    const id = addressOf(word);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return {
    values: [...counts]
      .map(([id, n]) => ({ id, n }))
      .sort(descending)
      .map(({ id, n }) => ({ id, amount: String(n) })),
    note: `${logs.length} ${event.slice(0, event.indexOf('('))} events`,
  };
}

/**
 * How many times each address sent the transaction behind an event: for events that don't name who
 * acted, such as a Baal proposal's submission. One read per transaction, so it stops at `max`.
 */
export async function countBySender(
  reader: EvmReader,
  contract: string,
  event: string,
  from: number,
  to: number,
  max: number,
  say?: (message: string) => void,
): Promise<ShapeRows> {
  if (!reader.transaction)
    throw new InputError('cannot_read', 'this reader cannot read transactions', {
      hint: 'count_by_sender needs eth_getTransactionByHash',
    });
  const logs: EvmLog[] = await eventLogs(reader, contract, event, from, to);
  const hashes = [...new Set(logs.map((l) => l.transactionHash))];
  if (hashes.length > max)
    throw new InputError(
      'cannot_read',
      `${hashes.length} transactions sent ${event.slice(0, event.indexOf('('))} here, more than the ${max} this reads`,
      { hint: 'This measure costs one call per transaction, so it stops at its bound.' },
    );
  const sender = new Map<string, string>();
  for (const [i, hash] of hashes.entries()) {
    if (i % 25 === 0)
      say?.(`reading who sent ${i + 1} to ${Math.min(i + 25, hashes.length)} of ${hashes.length}`);
    sender.set(hash, (await reader.transaction(hash)).from);
  }
  const counts = new Map<string, number>();
  for (const l of logs) {
    const id = sender.get(l.transactionHash) as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return {
    values: [...counts]
      .map(([id, n]) => ({ id, n }))
      .sort(descending)
      .map(({ id, n }) => ({ id, amount: String(n) })),
    note: `${logs.length} events in ${hashes.length} transactions, counted by sender`,
  };
}

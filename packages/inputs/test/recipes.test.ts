// Reading recipes (specs/005-mapping-brain/data.md): the brain's files are all listed and valid, a
// bad recipe is refused, and the counting shapes read a contract's events as a recipe says.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { eventTopic } from '../src/evm/abi.ts';
import type { EvmLog, EvmReader } from '../src/evm/reader.ts';
import { checkRecipe, pullRecipe, RECIPES } from '../src/index.ts';
import { countByParticipant, countBySender } from '../src/recipes/shapes.ts';

const RECIPE_DIR = fileURLToPath(new URL('../../../brain/recipes/', import.meta.url));
const DAO = '0xf02fd4286917270cb94fbc13a0f4e1ed76f7e986';
const word = (a: string) => `0x${a.slice(2).padStart(64, '0')}`;
const A = '0x1a9c000000000000000000000000000000020cd0';
const B = '0xced6000000000000000000000000000000075b00';

const log = (event: string, topics: string[], tx: string, block = 100): EvmLog => ({
  address: DAO,
  topics: [eventTopic(event), ...topics],
  data: '0x',
  blockNumber: `0x${block.toString(16)}`,
  transactionHash: tx,
  logIndex: '0x0',
});

/** A chain that answers the Baal calls, holds these logs, and knows who sent each transaction. */
function fakeChain(logs: EvmLog[], senders: Record<string, string>): EvmReader {
  return {
    block: async () => ({
      number: 1000,
      hash: '0xabc',
      timestamp: 0,
      as_of: '2026-11-09T00:00:00Z',
    }),
    call: async () => word('0x0000000000000000000000000000000000000001'),
    multicall: async () => [],
    async *logPages(filter) {
      yield logs.filter((l) => !filter.topics?.[0] || l.topics[0] === filter.topics[0]);
    },
    logs: async (filter) =>
      logs.filter((l) => !filter.topics?.[0] || l.topics[0] === filter.topics[0]),
    servedBy: () => 'https://rpc.example',
    stats: () => ({ calls: 0 }) as never,
    transaction: async (hash) => ({ from: senders[hash] as string, to: DAO, blockNumber: 100 }),
  };
}

const SPONSOR = 'SponsorProposal(address,uint256,uint256)';
const SUBMIT = 'SubmitProposal(uint256,bytes32,uint256,bytes,uint256,uint256,bool,uint256,string)';
const VOTE = 'SubmitVote(address,uint256,uint256,bool)';

describe("the brain's recipes", () => {
  test('every file in brain/recipes is listed, and each is a valid recipe', () => {
    const files = readdirSync(RECIPE_DIR).filter((f) => f.endsWith('.json'));
    expect(RECIPES.map((r) => `${r.id}.json`).sort()).toEqual(files.sort());
    expect(RECIPES.find((r) => r.id === 'moloch-v3')?.measures.map((m) => m.name)).toEqual([
      'shares',
      'loot',
      'proposals_sponsored',
      'votes_cast',
      'proposals_written',
    ]);
  });

  test('a recipe that asks for too much, or names a shape there is none of, is refused', () => {
    const good = RECIPES[0] as object;
    expect(() =>
      checkRecipe({ ...good, bounds: { max_log_calls: 5000, max_sender_calls: 1 } }),
    ).toThrow(/at most/);
    expect(() =>
      checkRecipe({
        ...good,
        measures: [{ name: 'x', unit: 'u', kind: 'count', label: 'x', shape: 'run_code' }],
      }),
    ).toThrow(/shape must be/);
    expect(() => checkRecipe({ ...good, chains: ['moon'] })).toThrow(/doesn't read the chain/);
  });
});

describe('the counting shapes', () => {
  const logs = [
    log(SPONSOR, [word(A), word('0x01'), word('0x02')], '0xt1'),
    log(SPONSOR, [word(A), word('0x02'), word('0x03')], '0xt2'),
    log(SPONSOR, [word(B), word('0x03'), word('0x04')], '0xt3'),
    log(SUBMIT, [word('0x01'), word('0x00')], '0xs1'),
    log(SUBMIT, [word('0x02'), word('0x00')], '0xs2'),
    log(SUBMIT, [word('0x03'), word('0x00')], '0xs3'),
    log(VOTE, [word(B), word('0x01'), word('0x01')], '0xv1'),
  ];
  const senders = { '0xs1': A, '0xs2': A, '0xs3': B };

  test('count by participant reads an indexed address', async () => {
    const r = await countByParticipant(fakeChain(logs, senders), DAO, SPONSOR, 1, 0, 1000);
    expect(r.values).toEqual([
      { id: A, amount: '2' },
      { id: B, amount: '1' },
    ]);
  });

  test("count by sender reads who sent each event's transaction, and stops at its bound", async () => {
    const r = await countBySender(fakeChain(logs, senders), DAO, SUBMIT, 0, 1000, 10);
    expect(r.values).toEqual([
      { id: A, amount: '2' },
      { id: B, amount: '1' },
    ]);
    await expect(countBySender(fakeChain(logs, senders), DAO, SUBMIT, 0, 1000, 2)).rejects.toThrow(
      /more than the 2/,
    );
  });

  test('a recipe run makes one reading with a measure per shape', async () => {
    const recipe = RECIPES.find((r) => r.id === 'moloch-v3');
    const s = await pullRecipe(
      recipe as never,
      { dao: DAO, chain: 'gnosis', measures: 'proposals_sponsored,proposals_written' },
      { reader: fakeChain(logs, senders) },
    );
    expect(s.module).toEqual({ id: 'moloch-v3', version: 'recipe/v1' });
    expect(s.network.population).toBe(
      `moloch-v3-gnosis-${DAO}-proposals_sponsored+proposals_written`,
    );
    const of = (m: string) =>
      Object.fromEntries(
        s.holdings.filter((h) => h.measure === m).map((h) => [h.participant, h.amount]),
      );
    expect(of('proposals_sponsored')).toEqual({ [A]: '2', [B]: '1' });
    expect(of('proposals_written')).toEqual({ [A]: '2', [B]: '1' });
    expect(s.coverage.measure).toBe('proposals_sponsored');
  });
});

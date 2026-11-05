// T160: erc20-votes, ENS as the test, offline. The check: getVotes at the block equals the replay
// for every delegate a flower can draw. The full log walk is hundreds of MB, so it is exercised
// here on a small made-up token, and the stored ENS rows are checked against recorded getVotes.
import { computeFigures, validateSnapshot } from '@petal/core';
import { describe, expect, test } from 'vitest';
import { encodeCall, eventTopic } from '../src/evm/abi.ts';
import type { EvmLog, EvmReader } from '../src/evm/reader.ts';
import { evmReader } from '../src/evm/reader.ts';
import { modules } from '../src/index.ts';
import {
  applyVotesLogs,
  checkGetVotes,
  ENS_TOKEN,
  newVotesReplay,
  pullErc20Votes,
  VOTES_CHECKED,
  type VotesToken,
  votesDescriptor,
} from '../src/modules/erc20-votes.ts';
import { replayFetch } from '../src/rpc/recording.ts';
import { encodeSnapshot } from '../src/store/file-store.ts';
import { indexRows, loadRecording, noSleep, storedSnapshot } from './helpers/recordings.ts';

const row = indexRows('ens-delegates')[0];
if (!row) throw new Error('no stored ens-delegates snapshot');
const stored = storedSnapshot(row);
const block = row.block_height as number;

const top = () =>
  stored.holdings.slice(0, VOTES_CHECKED).map((h) => ({
    address: h.participant,
    votes: BigInt(h.amount_raw ?? '0'),
  }));

const replayReader = () =>
  evmReader({ fetch: replayFetch(loadRecording('ens-delegates')).fetch, sleep: noSleep });

describe('ens-delegates, stored', () => {
  test('is registered, stored only, and valid', async () => {
    const mod = modules['ens-delegates'];
    if (!mod) throw new Error('not registered');
    expect(mod.descriptor).toMatchObject({ chain: 'eip155:1', live: false, kind: 'dao' });
    expect(validateSnapshot(stored).ok).toBe(true);
    const at = await mod.resolveAt('latest');
    expect(at.block_height).toBe(block);
    expect(encodeSnapshot(await mod.fetch(at, undefined)).sha256).toBe(row.sha256);
  });

  test('check: getVotes equals the stored votes for all 400, offline', async () => {
    expect(VOTES_CHECKED).toBeGreaterThanOrEqual(300); // a flower draws at most 300 petals
    const check = await checkGetVotes(replayReader(), ENS_TOKEN, block, top());
    expect(check).toEqual({ block, checked: 400, mismatches: [] });
  });

  test('a stored row that differs from getVotes is caught', async () => {
    const rows = top();
    const first = rows[0];
    if (!first) throw new Error('no rows');
    first.votes += 1n;
    const check = await checkGetVotes(replayReader(), ENS_TOKEN, block, rows);
    expect(check.mismatches).toEqual([first.address]);
  });

  test('every delegate with votes, summed exactly; the figures match the research', () => {
    expect(stored.participants).toHaveLength(8561);
    expect(stored.coverage).toMatchObject({
      participants_total: 8561,
      participants_included: 8561,
      unit: 'ENS',
      measure: 'delegated_votes',
    });
    expect(stored.coverage.amount_included).toBe(stored.coverage.amount_total);
    expect(stored.coverage.grouped).toBeUndefined();
    const f = computeFigures(stored, { measure: 'delegated_votes', petals: 60, topK: [10] });
    expect(f.total).toBe(stored.coverage.amount_total);
    expect(f.top_k_share['10']).toBeCloseTo(0.3948, 3);
    expect(f.nakamoto.count).toBe(15);
    expect(f.tail.count).toBe(8501);
  });

  test('says what it does not show, and names nobody', () => {
    const note = stored.coverage.note ?? '';
    expect(note).toMatch(/3\.99% of totalSupply/);
    expect(note).toMatch(/Having votes is not having used them/);
    expect(note).toMatch(/off-chain Snapshot/);
    expect(note).not.toMatch(/inactive/i);
    for (const p of stored.participants) expect(p.identity).toBeNull();
    expect(stored.sources.find((s) => s.id === 'erc20-votes-logs')?.url).toBe(
      'https://mainnet.gateway.tenderly.co',
    );
  });
});

const TOKEN: VotesToken = {
  id: 'test-votes',
  symbol: 'TV',
  address: '0x00000000000000000000000000000000000000aa',
  from_block: 1,
  title: 'Test votes',
  population: 'test-votes',
  docs: { url: 'https://example.test/token', says: 'names the token' },
};
const A = `0x${'a'.repeat(40)}`;
const B = `0x${'b'.repeat(40)}`;
const C = `0x${'c'.repeat(40)}`;
const word = (n: bigint) => n.toString(16).padStart(64, '0');
const change = (delegate: string, from: bigint, to: bigint, blockNumber = 5): EvmLog => ({
  address: TOKEN.address,
  topics: [
    eventTopic('DelegateVotesChanged(address,uint256,uint256)'),
    `0x${delegate.slice(2).padStart(64, '0')}`,
  ],
  data: `0x${word(from)}${word(to)}`,
  blockNumber: `0x${blockNumber.toString(16)}`,
  transactionHash: '0xt',
  logIndex: '0x0',
});

describe('the replay', () => {
  test('the latest balance wins, across pages', () => {
    const r = newVotesReplay();
    applyVotesLogs(r, [change(A, 0n, 5n), change(B, 0n, 2n)]);
    applyVotesLogs(r, [change(A, 5n, 9n), change(B, 2n, 0n)]);
    expect(r).toMatchObject({ logs: 4, breaks: 0 });
    expect(r.votes.get(A)).toBe(9n);
    expect(r.votes.get(B)).toBe(0n);
  });

  test('a missing page shows as a break', () => {
    const r = newVotesReplay();
    applyVotesLogs(r, [change(A, 0n, 5n)]);
    applyVotesLogs(r, [change(A, 7n, 9n)]);
    expect(r.breaks).toBe(1);
  });
});

function fakeReader(pages: EvmLog[][], votes: Record<string, bigint>, symbol = 'TV'): EvmReader {
  const text = Buffer.from(symbol).toString('hex').padEnd(64, '0');
  const answers = new Map<string, string>([
    [encodeCall('decimals()'), `0x${word(18n)}`],
    [encodeCall('totalSupply()'), `0x${word(100n * 10n ** 18n)}`],
    [encodeCall('symbol()'), `0x${word(0x20n)}${word(BigInt(symbol.length))}${text}`],
    ...Object.entries(votes).map(
      ([a, v]) => [encodeCall('getVotes(address)', a), `0x${word(v)}`] as [string, string],
    ),
  ]);
  return {
    block: async () => ({
      number: 100,
      hash: '0xh',
      timestamp: 86400,
      as_of: '1970-01-02T00:00:00Z',
    }),
    call: async () => '0x',
    multicall: async (calls) =>
      calls.map((c) => ({ ok: answers.has(c.data), data: answers.get(c.data) ?? '0x' })),
    logPages: async function* () {
      yield* pages;
    },
    logs: async () => pages.flat(),
    servedBy: () => 'https://rpc.test',
    stats: () => ({ calls: {}, http_429: {}, failures: {} }),
  };
}

describe('pullErc20Votes on a small made-up token', () => {
  const pages = [
    [change(A, 0n, 3n * 10n ** 18n), change(B, 0n, 5n * 10n ** 18n)],
    [change(C, 0n, 1n), change(C, 1n, 0n)],
  ];

  test('builds a valid snapshot of delegates with votes', async () => {
    const reader = fakeReader(pages, { [A]: 3n * 10n ** 18n, [B]: 5n * 10n ** 18n });
    const { snapshot, checks } = await pullErc20Votes(TOKEN, { reader });
    expect(validateSnapshot(snapshot).ok).toBe(true);
    expect(snapshot.holdings.map((h) => [h.participant, h.amount])).toEqual([
      [B, '5'],
      [A, '3'],
    ]);
    expect(checks).toMatchObject({ logs: 4, breaks: 0, delegates: 2, checked: 2, mismatches: [] });
    expect(snapshot.coverage.amount_total).toBe('8');
    expect(snapshot.coverage.note).toMatch(/8\.00% of totalSupply/);
    expect(snapshot.network).toMatchObject({ id: 'test-votes', params: { token: TOKEN.address } });
    expect(votesDescriptor(TOKEN).capabilities.segments).toEqual([]);
  });

  test('throws when getVotes disagrees, when a page is missing, or on the wrong token', async () => {
    await expect(
      pullErc20Votes(TOKEN, { reader: fakeReader(pages, { [A]: 1n, [B]: 5n * 10n ** 18n }) }),
    ).rejects.toThrow(/1 getVotes mismatches/);
    await expect(
      pullErc20Votes(TOKEN, {
        reader: fakeReader([[change(A, 9n, 3n)]], { [A]: 3n }),
      }),
    ).rejects.toThrow(/1 breaks/);
    await expect(
      pullErc20Votes(TOKEN, { reader: fakeReader(pages, { [A]: 1n, [B]: 1n }, 'NOPE') }),
    ).rejects.toThrow(/its symbol is NOPE/);
  });
});

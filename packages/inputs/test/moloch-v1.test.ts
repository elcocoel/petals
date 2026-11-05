// T157: moloch-v1 offline, from a recording of the real pull. The check: the replay equals
// members() for every address, and the sum equals totalShares().
import { computeFigures, validateSnapshot } from '@petal/core';
import { describe, expect, test } from 'vitest';
import { eventTopic } from '../src/evm/abi.ts';
import { evmReader } from '../src/evm/reader.ts';
import { modules } from '../src/index.ts';
import {
  MOLOCH_V1_DESCRIPTOR,
  molochTarget,
  molochV1,
  nameFromProposal,
  pullMolochV1,
} from '../src/modules/moloch-v1.ts';
import { replayFetch } from '../src/rpc/recording.ts';
import { encodeSnapshot } from '../src/store/file-store.ts';
import { loadRecording, noSleep, rowFor, storedSnapshot } from './helpers/recordings.ts';
import { MOLOCH } from './helpers/targets.ts';

const recording = loadRecording('moloch-v1');
const row = rowFor('moloch-v1', MOLOCH.params);
const MOLOCH_V1_BLOCK = MOLOCH.block;
const pull = (reader: ReturnType<typeof evmReader>) =>
  pullMolochV1({
    reader,
    dao: MOLOCH.params.dao,
    block: MOLOCH.block,
    head: 'finalized',
    fromBlock: MOLOCH.fromBlock,
    note: MOLOCH.note,
  });
const stored = storedSnapshot(row);

const replayReader = (rec = recording) => {
  const replay = replayFetch(rec);
  return { replay, reader: evmReader({ fetch: replay.fetch, sleep: noSleep }) };
};

describe('moloch-v1', () => {
  test('is registered, and takes its target as a parameter', () => {
    expect(modules['moloch-v1']?.descriptor).toBe(MOLOCH_V1_DESCRIPTOR);
    expect(MOLOCH_V1_DESCRIPTOR).toMatchObject({ chain: 'eip155:1', live: true, kind: 'dao' });
    expect(MOLOCH_V1_DESCRIPTOR.params.dao?.required).toBe(true);
    expect(molochTarget({ dao: MOLOCH.params.dao }).population).toBe(row.population);
    expect(() => molochTarget({ dao: '0x12' })).toThrow(/needs a dao/);
    expect(() => molochTarget(undefined)).toThrow(/needs a dao/);
  });

  test('serves the stored snapshot, valid, at the block before proposal 143', async () => {
    const mod = molochV1();
    const at = await mod.resolveAt('latest', MOLOCH.params);
    expect(at.block_height).toBe(MOLOCH_V1_BLOCK);
    const s = await mod.fetch(at, MOLOCH.params);
    expect(validateSnapshot(s).ok).toBe(true);
    expect(encodeSnapshot(s).sha256).toBe(row.sha256);
    expect(s.snapshot).toMatchObject({ block_height: MOLOCH_V1_BLOCK, final: true });
    await expect(mod.resolveAt('2001-01-01', MOLOCH.params)).rejects.toMatchObject({
      code: 'cannot_read',
    });
  });

  test('check: replay equals members() for all 108 addresses, offline', async () => {
    const { reader, replay } = replayReader();
    const finalized = recording.calls.find(
      (c) =>
        c.request.method === 'eth_getBlockByNumber' &&
        (c.request.params as string[])[0] === 'finalized',
    );
    if (!finalized) throw new Error('no finalized block in the recording');
    const head = (finalized.response as { result: { number: string } }).result.number;
    const { snapshot, checks } = await pull(reader);
    expect(replay.missing).toEqual([]);
    expect(checks).toMatchObject({
      block: MOLOCH_V1_BLOCK,
      addresses: 107,
      mismatches: [],
      total_shares_replay: '3760',
      total_shares_contract: '3760',
      head_block: Number.parseInt(head, 16),
      head_addresses: 108,
      head_mismatches: [],
      head_total_shares_replay: '3759',
      head_total_shares_contract: '3759',
    });
    // the same bytes as the stored fixture: the fixture is what this code reads from the chain
    expect(encodeSnapshot(snapshot).sha256).toBe(row.sha256);
  });

  test('a replay that disagrees with the contract throws', async () => {
    const rag = eventTopic('Ragequit(address,uint256)');
    const rec = structuredClone(recording);
    const logs = rec.calls.find((c) => c.request.method === 'eth_getLogs')?.response as {
      result: { topics: string[]; data: string }[];
    };
    const one = logs.result.find((l) => l.topics[0] === rag);
    if (!one) throw new Error('no ragequit in the recording');
    one.data = `0x${(BigInt(one.data) + 7n).toString(16).padStart(64, '0')}`;
    const { reader } = replayReader(rec);
    await expect(pull(reader)).rejects.toThrow(/does not match the contract/);
  });

  test('70 members; the figures match the research', () => {
    expect(stored.participants).toHaveLength(70);
    expect(stored.coverage).toMatchObject({
      participants_total: 70,
      amount_total: '3760',
      amount_included: '3760',
      unit: 'shares',
    });
    const f = computeFigures(stored, { measure: 'shares', petals: 70 });
    expect(f.total).toBe('3760');
    expect(f.shares[0]).toMatchObject({ amount: '1000', share: 0.265957 });
    expect(f.shares[1]).toMatchObject({ amount: '500' });
    expect(f.tail.count).toBe(0);
  });

  test('says what the date is and what a share is not', () => {
    const note = stored.coverage.note ?? '';
    expect(note).toMatch(/Shares for V2 Migration/);
    expect(note).toMatch(/1,000,000,000,000 shares/);
    expect(note).toMatch(/Last action on the contract: block 13,233,581 \(2021-09-16\)/);
    expect(note).toMatch(/Last check: block [\d,]+ \(2026-11-05\)/);
    expect(note).toMatch(/A share is not money/);
  });

  test('every identity is self-declared and cites the proposal text', () => {
    const named = stored.participants.filter((p) => p.identity);
    expect(named.length).toBeGreaterThan(0);
    for (const p of named) {
      expect(p.identity).toMatchObject({ status: 'self-declared', source: 'moloch-proposal-text' });
      expect((p.detail as { named_by_proposal?: unknown }).named_by_proposal).toEqual(
        expect.any(Number),
      );
    }
    const kinds = new Set(stored.participants.map((p) => p.kind));
    expect([...kinds]).toEqual(['unknown']);
  });

  test('reads a name only from the fixed form', () => {
    expect(
      nameFromProposal('{"title":"Membership Proposal: Vitalik Buterin","description":"YOLO"}'),
    ).toBe('Vitalik Buterin');
    expect(
      nameFromProposal('{title:Member Proposal: Anon,description:https://etherpad.net/p/x}'),
    ).toBe('Anon');
    expect(
      nameFromProposal(
        '{title:Membership Proposal: Santiago Siri (democracy.earth),description:x}',
      ),
    ).toBe('Santiago Siri (democracy.earth)');
    for (const text of [
      'shut up and take my money',
      'Mr. Bigglesworth',
      '{"title":"MGP 12.2 - $500 for Peter Pan"}',
      '{"title":"Membership Proposal for SWIFT J195509+261406"}',
      '',
    ])
      expect(nameFromProposal(text)).toBeNull();
  });
});

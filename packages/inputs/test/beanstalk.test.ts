// T159: beanstalk offline. The check: 79.63% of totalRoots reproduced from the stored fixture.
import { computeFigures, validateSnapshot } from '@petal/core';
import type { Snapshot } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { evmReader } from '../src/evm/reader.ts';
import { modules } from '../src/index.ts';
import {
  BEANSTALK_ATTACK,
  BEANSTALK_BEFORE,
  BEANSTALK_DESCRIPTOR,
  type BeanstalkList,
  beanstalk,
  pullBeanstalk,
} from '../src/modules/beanstalk.ts';
import { percent2 } from '../src/modules/plain.ts';
import { replayFetch } from '../src/rpc/recording.ts';
import { encodeSnapshot } from '../src/store/file-store.ts';
import { indexRows, loadRecording, noSleep, storedSnapshot } from './helpers/recordings.ts';

const ADDRESS = '0x79224bc0bf70ec34f0ef56ed8251619499a59def';
const recording = loadRecording('beanstalk');
const list = recording.list as BeanstalkList;
const rows = indexRows('beanstalk');
const at = (block: number): Snapshot => {
  const row = rows.find((r) => r.block_height === block);
  if (!row) throw new Error(`no stored snapshot at ${block}`);
  return storedSnapshot(row);
};
const before = at(BEANSTALK_BEFORE);
const after = at(BEANSTALK_ATTACK);
const rootsOf = (s: Snapshot, id: string) =>
  BigInt(s.holdings.find((h) => h.participant === id)?.amount_raw ?? '0');
const sum = (s: Snapshot) => s.holdings.reduce((a, h) => a + BigInt(h.amount_raw ?? '0'), 0n);

describe('beanstalk', () => {
  test('is registered, stored only, with two dated snapshots a block apart', async () => {
    expect(modules.beanstalk?.descriptor).toBe(BEANSTALK_DESCRIPTOR);
    expect(BEANSTALK_DESCRIPTOR).toMatchObject({ chain: 'eip155:1', live: false });
    expect(rows.map((r) => r.block_height)).toEqual([BEANSTALK_BEFORE, BEANSTALK_ATTACK]);
    expect(before.snapshot.as_of).toBe('2022-04-17T12:24:02Z');
    expect(after.snapshot.as_of).toBe('2022-04-17T12:24:16Z');
    for (const s of [before, after]) expect(validateSnapshot(s).ok).toBe(true);
    const mod = beanstalk();
    expect((await mod.resolveAt('latest')).block_height).toBe(BEANSTALK_ATTACK);
    expect((await mod.resolveAt({ block_height: BEANSTALK_BEFORE })).as_of).toBe(
      before.snapshot.as_of,
    );
    expect((await mod.resolveAt('2022-04-17T12:24:10Z')).block_height).toBe(BEANSTALK_BEFORE);
    await expect(mod.resolveAt({ block_height: 1 })).rejects.toMatchObject({ code: 'cannot_read' });
  });

  test('check: 79.63% of totalRoots reproduced from the stored fixture', () => {
    expect(percent2(rootsOf(after, ADDRESS), BigInt(after.coverage.amount_total))).toBe('79.63');
    const largest = [...after.holdings].sort((a, b) =>
      BigInt(a.amount_raw ?? '0') > BigInt(b.amount_raw ?? '0') ? -1 : 1,
    )[0];
    expect(largest?.participant).toBe(ADDRESS);
    expect(after.coverage.note).toContain(`${ADDRESS} with 79.63% of totalRoots`);
  });

  test('the same address holds nothing one block earlier', () => {
    expect(rootsOf(before, ADDRESS)).toBe(0n);
    expect(before.participants.some((p) => p.id === ADDRESS)).toBe(false);
    const total = BigInt(before.coverage.amount_total);
    const top = '0x10bf1dcb5ab7860bab1c3320163c6dddf8dcc0e4';
    expect(percent2(rootsOf(before, top), total)).toBe('3.98');
    expect(percent2(rootsOf(after, top), BigInt(after.coverage.amount_total))).toBe('0.81');
  });

  test('the rows sum to totalRoots less one stated remainder, the same at both blocks', () => {
    const left = BigInt(before.coverage.amount_total) - sum(before);
    expect(left).toBe(BigInt(after.coverage.amount_total) - sum(after));
    expect(left).toBeGreaterThan(0n);
    for (const s of [before, after]) {
      expect(s.coverage.amount_included).toBe(sum(s).toString());
      expect(s.coverage.note).toMatch(/not explained here/);
      expect(s.coverage.grouped).toBeUndefined();
    }
  });

  test('replaying the recording gives the stored bytes, offline', async () => {
    const replay = replayFetch(recording);
    const reader = evmReader({ fetch: replay.fetch, sleep: noSleep });
    for (const row of rows) {
      const { snapshot } = await pullBeanstalk({
        reader,
        block: row.block_height as number,
        list,
      });
      expect(encodeSnapshot(snapshot).sha256).toBe(row.sha256);
    }
    expect(replay.missing).toEqual([]);
  });

  test('a list that misses most of the roots is refused', async () => {
    const reader = evmReader({ fetch: replayFetch(recording).fetch, sleep: noSleep });
    const short = { depositors: list.depositors.slice(0, 10), votes: [] };
    await expect(
      pullBeanstalk({ reader, block: BEANSTALK_ATTACK, list: short }),
    ).rejects.toMatchObject({ code: 'source_failed' });
  });

  test('no address is named; the vote is what the chain says', () => {
    for (const s of [before, after]) for (const p of s.participants) expect(p.identity).toBeNull();
    const voter = after.participants.find((p) => p.id === ADDRESS);
    expect(voter?.detail).toMatchObject({ votes: [{ bip: 18, block: BEANSTALK_ATTACK }] });
    expect(after.coverage.note).toContain('cast a Vote on bip 18');
    expect(after.coverage.note).not.toMatch(/attacker/i);
    expect(after.sources.map((x) => x.id)).toContain('beanstalk-readme');
  });

  test('figures are of the rows; the top share still reads 79.63%', () => {
    const f = computeFigures(after, { measure: 'voting_roots', petals: 60 });
    expect(f.shares[0]?.id).toBe(ADDRESS);
    expect(f.shares[0]?.share).toBeCloseTo(0.7963, 3);
    expect(f.participants_total).toBe(after.participants.length);
    expect(f.nakamoto.count).toBe(1);
    const g = computeFigures(before, { measure: 'voting_roots', petals: 60 });
    expect(g.shares[0]?.share).toBeLessThan(0.05);
    expect(g.nakamoto.count).toBeGreaterThan(10);
  });
});

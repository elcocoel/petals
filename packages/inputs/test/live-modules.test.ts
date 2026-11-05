// The Ethereum and Solana modules against their real public sources. Off unless PETAL_LIVE=1;
// everything else in this package runs offline from recordings.
import { validateSnapshot } from '@petal/core';
import { describe, expect, test } from 'vitest';
import { evmReader } from '../src/evm/reader.ts';
import { MOLOCH_V1_BLOCK, pullMolochV1 } from '../src/modules/moloch-v1.ts';
import { encodeSnapshot } from '../src/store/file-store.ts';
import { indexRows } from './helpers/recordings.ts';

describe.skipIf(process.env.PETAL_LIVE !== '1')('live modules (PETAL_LIVE=1)', () => {
  test('moloch-v1: about 12 calls, the same members as the fixture', {
    timeout: 120_000,
  }, async () => {
    const reader = evmReader();
    const { snapshot, checks } = await pullMolochV1({ reader });
    expect(checks.mismatches).toEqual([]);
    expect(checks.head_mismatches).toEqual([]);
    expect(validateSnapshot(snapshot).ok).toBe(true);
    expect(snapshot.snapshot.block_height).toBe(MOLOCH_V1_BLOCK);
    const stored = indexRows('moloch-v1')[0];
    expect(stored?.bytes).toBeCloseTo(encodeSnapshot(snapshot).canonical.length, -2);
  });
});

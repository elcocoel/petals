// Live House of Stake through getSnapshot, on the real keyless pool. Off unless PETAL_LIVE=1
// (~17 view calls on dRPC). Everything else in this package runs offline from recordings.
import { describe, expect, test } from 'vitest';
import { fileStore, getSnapshot } from '../src/index.ts';
import { mapIndexOver } from './helpers/map.ts';
import { snapshotProblems } from './helpers/schema.ts';
import { FIXTURES, tmp } from './helpers/snapshots.ts';

describe.skipIf(process.env.PETAL_LIVE !== '1')('live: House of Stake (PETAL_LIVE=1)', () => {
  test('fetches at a final block, then reuses it', { timeout: 120_000 }, async () => {
    const store = fileStore({ fixtures: FIXTURES, cache: tmp('live') });
    const map = mapIndexOver();
    const first = await getSnapshot({ network: 'near-house-of-stake' }, { store, map });
    expect(first).toMatchObject({ reused: false, where: 'fetched', snapshot: { final: true } });
    expect(first.coverage.amount_included).toBe(first.coverage.amount_total);
    expect(first.counts.participants).toBeGreaterThan(400);
    expect(snapshotProblems(await store.get(first.sha256))).toEqual([]);
    expect(map.map.writes()).toHaveLength(1);

    const t = performance.now();
    const second = await getSnapshot({ network: 'near-house-of-stake' }, { store, map });
    expect(second).toMatchObject({ sha256: first.sha256, reused: true });
    expect(performance.now() - t).toBeLessThan(1000);
  });
});

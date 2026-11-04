// The recorded House of Stake answers (test/fixtures/hos/), replayed through a real pool with
// no pacing. Re-record with: node packages/inputs/scripts/record-hos.ts (keyless, ~22 calls).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { nearHouseOfStake } from '../../src/modules/near-house-of-stake.ts';
import { DEFAULT_ENDPOINTS, rpcPool } from '../../src/rpc/pool.ts';
import { type Recording, recordingKey, replayFetch } from '../../src/rpc/recording.ts';

const dir = join(import.meta.dirname, '..', 'fixtures', 'hos');

export const recording = JSON.parse(
  gunzipSync(readFileSync(join(dir, 'recording.json.gz'))).toString('utf8'),
) as Recording & { block_height: number; as_of: string };

export const expected = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8')) as {
  block_height: number;
  as_of: string;
  sha256: string;
  bytes: number;
  counts: { participants: number; holdings: number; relationships: number; events: number };
  amount_total: string;
  amount_included: string;
  power_checks: { account: string; ft_balance_of: string; computed: string }[];
};

export const unpaced = DEFAULT_ENDPOINTS.map((e) => ({ ...e, intervalMs: 0 }));

/** A House of Stake module on the recording; `calls` filters or `overrides` replace answers. */
export function replayedHos(
  o: { calls?: Recording['calls']; overrides?: Record<string, unknown> } = {},
) {
  // The recorded head also answers `block` by its height, for `at: { block_height }`.
  const head = recording.calls.find((c) => c.request.method === 'block')?.response;
  const byHeight = { [recordingKey('block', { block_id: recording.block_height })]: head };
  const replay = replayFetch(
    { calls: o.calls ?? recording.calls },
    { ...byHeight, ...o.overrides },
  );
  const rpc = rpcPool({
    fetch: replay.fetch,
    endpoints: unpaced,
    rounds: 1,
    sleep: async () => {},
  });
  return { module: nearHouseOfStake({ rpc }), rpc, replay };
}

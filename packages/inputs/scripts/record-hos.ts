// Record the House of Stake responses the module tests replay (T036). Keyless public reads only.
//   node packages/inputs/scripts/record-hos.ts            live: ~23 view calls, mostly on dRPC
//   node packages/inputs/scripts/record-hos.ts --replay   offline: recompute expected.json
// Writes packages/inputs/test/fixtures/hos/recording.json.gz and expected.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { nearHouseOfStake, VENEAR } from '../src/modules/near-house-of-stake.ts';
import { ownedTotal, type VeAccount } from '../src/modules/venear.ts';
import { rpcPool } from '../src/rpc/pool.ts';
import {
  RECORDING_FORMAT,
  type Recording,
  recordingFetch,
  replayFetch,
} from '../src/rpc/recording.ts';
import { encodeSnapshot } from '../src/store/file-store.ts';

const dir = join(import.meta.dirname, '..', 'test', 'fixtures', 'hos');
const recPath = join(dir, 'recording.json.gz');
const replay = process.argv.includes('--replay');

let calls: Recording['calls'];
let fetchImpl: typeof fetch;
if (replay) {
  const rec = JSON.parse(gunzipSync(readFileSync(recPath)).toString('utf8')) as Recording;
  calls = rec.calls;
  fetchImpl = replayFetch(rec).fetch;
} else {
  const r = recordingFetch();
  calls = r.calls;
  fetchImpl = r.fetch;
}

const pool = rpcPool({ fetch: fetchImpl });
const hos = nearHouseOfStake({ rpc: pool });
const t0 = Date.now();
// Replay resolves "latest" to the recorded head (the only `finality: final` block call).
const at = await hos.resolveAt('latest');
const s = await hos.fetch(at, undefined, (e) => console.log(`  ${e.message}`));
const { sha256, canonical } = encodeSnapshot(s);

// Check the ported power rule against the contract at the same block, for a few accounts:
// the largest, some that delegate, some with delegations in.
const pages = calls.filter(
  (c) =>
    (c.request.params as { method_name?: string }).method_name === 'get_accounts' &&
    (c.request.params as { block_id?: number }).block_id === at.block_height,
);
const accounts = pages.flatMap((c) =>
  (
    JSON.parse((c.response as { result: { result_text: string } }).result.result_text) as {
      account: VeAccount;
    }[]
  ).map((a) => a.account),
);
const byPower = [...accounts].sort((a, b) => {
  const d = ownedTotal(b).power - ownedTotal(a).power;
  return d > 0n ? 1 : d < 0n ? -1 : 0;
});
const sample = [
  ...byPower.slice(0, 2),
  ...accounts.filter((a) => (a.delegations ?? []).length > 0).slice(0, 2),
  ...accounts.filter((a) => a.delegated_balance.near_balance !== '0').slice(0, 2),
];
const checks = [];
for (const a of [...new Set(sample)]) {
  const r = await pool.view<string>(
    VENEAR,
    'ft_balance_of',
    { account_id: a.account_id },
    { block_id: at.block_height },
  );
  checks.push({
    account: a.account_id,
    ft_balance_of: r.value,
    computed: ownedTotal(a).power.toString(),
  });
}

const expected = {
  block_height: at.block_height,
  as_of: at.as_of,
  sha256,
  bytes: canonical.length,
  counts: {
    participants: s.participants.length,
    holdings: s.holdings.length,
    relationships: s.relationships.length,
    events: s.events.length,
  },
  amount_total: s.coverage.amount_total,
  amount_included: s.coverage.amount_included,
  power_checks: checks,
};

if (!replay) {
  const rec: Recording = {
    petal: RECORDING_FORMAT,
    note: 'House of Stake (venear.dao, vote.dao) read keyless at one final block by nearHouseOfStake, plus ft_balance_of checks. Public chain data.',
    recorded_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    block_height: at.block_height,
    as_of: at.as_of,
    calls,
  };
  writeFileSync(recPath, gzipSync(JSON.stringify(rec), { level: 9 }));
}
writeFileSync(join(dir, 'expected.json'), `${JSON.stringify(expected, null, 2)}\n`);
console.log(
  `${replay ? 'replayed' : 'recorded'} ${calls.length} calls in ${((Date.now() - t0) / 1000).toFixed(1)} s;` +
    ` block ${at.block_height} (${at.as_of}); sha256 ${sha256}; stats ${JSON.stringify(pool.stats())}`,
);
for (const c of checks)
  console.log(`  ${c.account}: ft_balance_of ${c.ft_balance_of} computed ${c.computed}`);

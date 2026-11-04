// Import the spike data into fixtures (T017, T018). Offline; reads ../research/data/ only.
//   pnpm import:spike [research-data-dir]
// Writes:
//   fixtures/snapshots/<sha256>.json.gz and fixtures/snapshots/index.json   (NEAR validators)
//   fixtures/golden/inputs/house-of-stake-2026-11-04.json.gz              (goldens only)
//   fixtures/snapshots/test/two-participants.json, tiny-backers.json      (unit tests)
// Fails unless every output is schema-valid and inside the fixture budget, and the validators
// fixture keeps 8,319 delegations individually carrying 98.76% of delegated stake.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { canonicalJson, schemas, sha256Hex } from '@petal/core';
import type { IndexRow, Snapshot } from '@petal/core/types';
import { importSpike, NEAR_VALIDATORS_RULES, NO_GROUPING } from '@petal/inputs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { makeTestSnapshots } from './test-snapshots.ts';

const root = join(import.meta.dirname, '..');
const data = process.argv[2] ?? join(root, '..', 'research', 'data');
const fixtures = join(root, 'fixtures');
const LIMIT_GZ = 5_000_000;

// Strict Ajv 2020 with formats, as in packages/core/src/schema/ajv.ts (validateSnapshot is W1's).
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormatsModule.default(ajv);
const validateSnapshot = ajv.compile(schemas.snapshot);

function check(name: string, s: Snapshot) {
  if (!validateSnapshot?.(s)) {
    const errors = (validateSnapshot?.errors ?? []).slice(0, 10);
    throw new Error(`${name}: not schema-valid:\n${JSON.stringify(errors, null, 1)}`);
  }
}

function encode(s: Snapshot) {
  const canonical = canonicalJson(s);
  const gz = gzipSync(canonical, { level: 9 });
  return { canonical, gz, sha256: sha256Hex(canonical), bytes: Buffer.byteLength(canonical) };
}

const mb = (n: number) => `${(n / 1e6).toFixed(2)} MB`;
const rows = (s: Snapshot) =>
  s.participants.length + s.holdings.length + s.relationships.length + s.events.length;

// --- T017: NEAR validators ------------------------------------------------------------------
const validators = await importSpike(join(data, 'near', 'producers.json'), NEAR_VALIDATORS_RULES);
check('near-validators', validators);
const v = encode(validators);

const individual = validators.relationships.filter(
  (r) => r.type === 'delegates_to' && !r.from.startsWith('group:'),
);
const yocto = (x?: string) => BigInt(x ?? '0');
const keptStake = individual.reduce((a, r) => a + yocto(r.amount_raw), 0n);
const allStake = validators.relationships
  .filter((r) => r.type === 'delegates_to')
  .reduce((a, r) => a + yocto(r.amount_raw), 0n);
const share = Number((keptStake * 1_000_000n) / allStake) / 10_000;
if (individual.length !== 8319)
  throw new Error(`expected 8,319 delegations, got ${individual.length}`);
if (share.toFixed(2) !== '98.76') throw new Error(`expected 98.76% of stake, got ${share}%`);
if (v.gz.length > LIMIT_GZ) throw new Error(`validators fixture is ${mb(v.gz.length)} gzipped`);

const snapDir = join(fixtures, 'snapshots');
mkdirSync(snapDir, { recursive: true });
const file = `${v.sha256}.json.gz`;
writeFileSync(join(snapDir, file), v.gz);

const indexPath = join(snapDir, 'index.json');
let index: { petal: 'snapshot-index/v1'; snapshots: IndexRow[] } = {
  petal: 'snapshot-index/v1',
  snapshots: [],
};
try {
  index = JSON.parse(readFileSync(indexPath, 'utf8'));
} catch {}
const row: IndexRow = {
  sha256: v.sha256,
  network: validators.network.id,
  chain: validators.network.chain,
  population: validators.network.population,
  block_height: validators.snapshot.block_height ?? null,
  as_of: validators.snapshot.as_of,
  final: validators.snapshot.final,
  bytes: v.bytes,
  gz_bytes: v.gz.length,
  file,
  where: 'fixture',
  module: validators.module,
};
index.snapshots = [
  ...index.snapshots.filter(
    (r) =>
      r.sha256 !== row.sha256 &&
      !(r.network === row.network && r.block_height === row.block_height),
  ),
  row,
].sort(
  (a, b) => a.network.localeCompare(b.network) || (a.block_height ?? 0) - (b.block_height ?? 0),
);
writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
console.log(
  `near-validators: ${relative(root, join(snapDir, file))}, ${rows(validators)} rows,` +
    ` ${mb(v.bytes)} raw, ${mb(v.gz.length)} gzipped; ${individual.length} delegations kept` +
    ` individually (${share.toFixed(2)}% of delegated stake), ${validators.coverage.grouped?.length ?? 0} grouping rules`,
);

// --- T018: House of Stake (golden input only, outside the store's lookup path) --------------
const hos = await importSpike(join(data, 'near-dao', 'house-of-stake.json'), NO_GROUPING);
check('near-house-of-stake', hos);
const h = encode(hos);
if (h.gz.length > LIMIT_GZ) throw new Error(`house of stake fixture is ${mb(h.gz.length)} gzipped`);
const goldenInputs = join(fixtures, 'golden', 'inputs');
mkdirSync(goldenInputs, { recursive: true });
writeFileSync(join(goldenInputs, 'house-of-stake-2026-11-04.json.gz'), h.gz);
console.log(
  `near-house-of-stake: fixtures/golden/inputs/house-of-stake-2026-11-04.json.gz, ${rows(hos)} rows,` +
    ` ${mb(h.gz.length)} gzipped, sha256 ${h.sha256}`,
);

// --- T018: small test snapshots ---------------------------------------------------------------
const testDir = join(snapDir, 'test');
mkdirSync(testDir, { recursive: true });
for (const [name, s] of Object.entries(makeTestSnapshots(validators, v.sha256))) {
  check(name, s);
  writeFileSync(join(testDir, `${name}.json`), `${JSON.stringify(s, null, 2)}\n`);
  console.log(
    `${name}: fixtures/snapshots/test/${name}.json, ${rows(s)} rows, sha256 ${encode(s).sha256}`,
  );
}

// Fixture loading for core tests and core scripts (tests may use node:, src may not).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { Snapshot } from '../src/types/index.ts';

export const REPO = join(import.meta.dirname, '..', '..', '..');
export const FIXTURES = join(REPO, 'fixtures');

export const VALIDATORS_SHA = '72a6d9676d967d63712dc82bcbb90282d2f61e5ca6495c3e2e54a4f9af77e9ec';

const cache = new Map<string, Snapshot>();

/** A fixture snapshot by path under fixtures/ (.json or .json.gz), parsed once per process. */
export function loadSnapshot(file: string): Snapshot {
  const hit = cache.get(file);
  if (hit) return hit;
  const bytes = readFileSync(join(FIXTURES, file));
  const s = JSON.parse((file.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8'));
  cache.set(file, s);
  return s;
}

export const validators = () => loadSnapshot(`snapshots/${VALIDATORS_SHA}.json.gz`);
export const houseOfStake = () => loadSnapshot('golden/inputs/house-of-stake-2026-11-04.json.gz');
export const twoParticipants = () => loadSnapshot('snapshots/test/two-participants.json');
export const tinyBackers = () => loadSnapshot('snapshots/test/tiny-backers.json');

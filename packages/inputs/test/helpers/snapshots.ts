// Small snapshots and folders for store and getSnapshot tests.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { Snapshot } from '@petal/core/types';

export const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
export const FIXTURES = join(ROOT, 'fixtures', 'snapshots');
export const VALIDATORS_SHA = '72a6d9676d967d63712dc82bcbb90282d2f61e5ca6495c3e2e54a4f9af77e9ec';

export const tmp = (name: string) => mkdtempSync(join(tmpdir(), `petal-inputs-${name}-`));

export function testSnapshot(name: 'two-participants' | 'tiny-backers'): Snapshot {
  return JSON.parse(readFileSync(join(FIXTURES, 'test', `${name}.json`), 'utf8')) as Snapshot;
}

export function readGz<T>(path: string): T {
  return JSON.parse(gunzipSync(readFileSync(path)).toString('utf8')) as T;
}

/** A snapshot of a made-up live network at a block. */
export function liveSnapshot(block: number, asOf: string, final = true): Snapshot {
  return {
    petal: 'snapshot/v1',
    network: {
      id: 'test-live',
      chain: 'near:testnet',
      population: 'test-live',
      title: 'Test live',
    },
    snapshot: { as_of: asOf, block_height: block, final },
    coverage: {
      participants_total: 2,
      participants_included: 2,
      amount_total: '3',
      amount_included: '3',
      unit: 'T',
      measure: 'power',
    },
    sources: [{ id: 'rpc', kind: 'chain', url: 'https://rpc.example', fetched_at: asOf }],
    participants: [
      { id: 'a.testnet', label: 'a.testnet', kind: 'unknown', identity: null, source: 'rpc' },
      { id: 'b.testnet', label: 'b.testnet', kind: 'unknown', identity: null, source: 'rpc' },
    ],
    holdings: [
      {
        participant: 'a.testnet',
        asset: 'T',
        measure: 'power',
        amount: String(1 + (block % 2)),
        unit: 'T',
        as_of: asOf,
        source: 'rpc',
      },
      {
        participant: 'b.testnet',
        asset: 'T',
        measure: 'power',
        amount: '1',
        unit: 'T',
        as_of: asOf,
        source: 'rpc',
      },
    ],
    relationships: [],
    events: [],
    module: { id: 'test-live', version: 'test/1' },
  };
}

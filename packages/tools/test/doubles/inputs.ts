// Double for @petal/inputs getSnapshot (W2 stub): reuse a final snapshot from the store, else
// fetch through a test module (with progress), store it and record it on the map index.
// See fallback.ts for how it is wired.
import type {
  MapIndex,
  Progress,
  Snapshot,
  SnapshotRequest,
  SnapshotResult,
} from '@petal/core/types';
import type { InputModule, SnapshotStore } from '@petal/inputs';
import { realOrFake } from './fallback.ts';

type Inputs = typeof import('@petal/inputs');

/** Modules the double fetches through (the real getSnapshot uses @petal/inputs' own). */
export const testModules: Record<string, InputModule> = {};

function resultOf(s: Snapshot, sha256: string, reused: boolean, where: SnapshotResult['where']) {
  return {
    sha256,
    reused,
    where,
    network: s.network,
    snapshot: {
      as_of: s.snapshot.as_of,
      ...(s.snapshot.block_height !== undefined ? { block_height: s.snapshot.block_height } : {}),
      final: s.snapshot.final,
    },
    coverage: s.coverage,
    sources: s.sources,
    counts: {
      participants: s.participants.length,
      holdings: s.holdings.length,
      relationships: s.relationships.length,
      events: s.events.length,
    },
    body_url: `/api/v1/snapshots/${sha256}`,
  } satisfies SnapshotResult;
}

async function fakeGetSnapshot(
  req: SnapshotRequest,
  deps: { store: SnapshotStore; map?: MapIndex; onProgress?: Progress },
): Promise<SnapshotResult> {
  deps.onProgress?.({ stage: 'reading_map', message: 'looking for a stored snapshot' });
  const rows = (await deps.store.list(req.network)).filter((r) => r.final);
  const row = rows.sort((a, b) => (b.block_height ?? 0) - (a.block_height ?? 0))[0];
  if (row && !(req.fresh && !row.final)) {
    const s = await deps.store.get(row.sha256);
    if (s) return resultOf(s, row.sha256, true, row.where);
  }
  const m = testModules[req.network];
  if (!m) {
    throw Object.assign(new Error(`no stored snapshot of ${req.network} and no live read`), {
      code: 'source_failed',
    });
  }
  const at = await m.resolveAt(req.at ?? 'latest', req.params);
  const s = await m.fetch(at, req.params, deps.onProgress);
  const { sha256, bytes } = await deps.store.put(s);
  if (s.snapshot.final && deps.map) {
    await deps.map.record({
      petal: 'snapshot-ref/v1',
      sha256,
      bytes,
      gz_bytes: bytes,
      rows: s.participants.length + s.holdings.length + s.relationships.length + s.events.length,
      network: { id: s.network.id, chain: s.network.chain, population: s.network.population },
      as_of: s.snapshot.as_of,
      block_height: s.snapshot.block_height ?? null,
      final: s.snapshot.final,
      module: s.module,
      urls: [`/api/v1/snapshots/${sha256}`],
    });
  }
  return resultOf(s, sha256, false, 'fetched');
}

export function mockInputs(inputs: Inputs): Inputs {
  return { ...inputs, getSnapshot: realOrFake(inputs.getSnapshot, fakeGetSnapshot) };
}

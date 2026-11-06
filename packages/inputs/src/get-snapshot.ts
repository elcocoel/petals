// getSnapshot (T037; tools.md get_snapshot; FR-028; data-model.md Snapshot state).
//
//   1. Resolve `at` to a block through the network's input module.
//   2. Look for that (chain, population, block): fixtures, then cache (the store), then the
//      map index. Found and final: return it with `reused: true`. Found but not final: reuse
//      it too, unless `fresh: true`.
//   3. "latest" (or no `at`): a final stored snapshot read in the last LATEST_REUSE_S seconds
//      before the resolved head counts as latest and is reused, unless `fresh: true`. Without
//      this a live chain would never reuse "latest", because its head moves every second.
//   4. Otherwise fetch through the module, check it, canonicalise, hash and store it; when it
//      is final and a map is set, write petal/v1/snapshot/<sha256> and the index key.
//
// A final snapshot at a given block is never fetched again: `fresh` only skips non-final data
// and the "latest" window.
import { validateSnapshot } from '@petal/core';
import type {
  MapIndex,
  Progress,
  Snapshot,
  SnapshotRef,
  SnapshotRequest,
  SnapshotResult,
  SnapshotWhere,
} from '@petal/core/types';
import { InputError } from './errors.ts';
import type { InputModule, SnapshotStore } from './index.ts';
import { modules } from './registry.ts';

/** How old a stored final snapshot may be and still answer "latest". */
export const LATEST_REUSE_S = 600;

/**
 * How long a read waits for its fingerprint to reach the map. The write goes on behind the read
 * (the mirror keeps it if it fails), so a slow chain never holds up the person waiting for data.
 */
export const RECORD_WAIT_MS = 2000;

/**
 * Additive (T300): who decides whether a read that would reach a public source may start. It throws a
 * refusal in the caller's own words. No gate: nothing is refused.
 */
export interface FreshGate {
  /** Throws when a read couldn't start now. Costs nothing. */
  check(): void;
  /** Runs the read, if it may start; counted, and stopped if it takes too long. */
  run<T>(work: () => Promise<T>): Promise<T>;
}

export const bodyUrl = (sha256: string) => `/api/v1/snapshots/${sha256}`;

const rowsOf = (s: Snapshot) =>
  s.participants.length + s.holdings.length + s.relationships.length + s.events.length;

function result(
  s: Snapshot,
  sha256: string,
  reused: boolean,
  where: SnapshotResult['where'],
): SnapshotResult {
  const snapshot: SnapshotResult['snapshot'] = { as_of: s.snapshot.as_of, final: s.snapshot.final };
  if (s.snapshot.block_height !== undefined) snapshot.block_height = s.snapshot.block_height;
  return {
    sha256,
    reused,
    where,
    network: s.network,
    snapshot,
    coverage: s.coverage,
    sources: s.sources,
    counts: {
      participants: s.participants.length,
      holdings: s.holdings.length,
      relationships: s.relationships.length,
      events: s.events.length,
    },
    body_url: bodyUrl(sha256),
  };
}

function moduleFor(req: SnapshotRequest, registry: Record<string, InputModule>): InputModule {
  const m = registry[req.network];
  if (!m)
    throw new InputError('cannot_read', `Petal has no input module for network "${req.network}"`, {
      hint: `Petal can read: ${Object.keys(registry).sort().join(', ')}`,
    });
  const spec = m.descriptor.params;
  const given = req.params ?? {};
  for (const k of Object.keys(given))
    if (!spec[k])
      throw new InputError('bad_input', `${req.network} takes no parameter "${k}"`, {
        hint: Object.keys(spec).length
          ? `parameters: ${Object.keys(spec).join(', ')}`
          : 'it takes no parameters',
      });
  for (const [k, p] of Object.entries(spec)) {
    const v = given[k];
    if (v === undefined) {
      if (p.required)
        throw new InputError(
          'bad_input',
          `${req.network} needs the parameter "${k}": ${p.description}`,
          {
            ...(p.example ? { hint: `e.g. ${k}: ${p.example}` } : {}),
          },
        );
    } else if (p.pattern && !new RegExp(p.pattern).test(v))
      throw new InputError('bad_input', `${req.network}: "${k}" does not match ${p.pattern}`, {
        ...(p.example ? { hint: `e.g. ${p.example}` } : {}),
      });
  }
  return m;
}

/** Every snapshot is validated before it is stored or served. */
function check(network: string, s: Snapshot): void {
  const r = validateSnapshot(s);
  if (!r.ok) {
    const first = r.errors
      .slice(0, 3)
      .map((x) => `${x.path} ${x.message}`)
      .join('; ');
    throw new InputError(
      'internal',
      `the ${network} module produced an invalid snapshot: ${first}`,
    );
  }
}

/**
 * Resolve `at`, reuse a final snapshot from the store or the map index, or fetch and store.
 * `deps.modules` (packages/v1.1, additive) is the module registry to read through; it defaults to
 * the built-in `modules`, so the tools can pass the ToolContext's modules.
 */
export async function getSnapshot(
  req: SnapshotRequest,
  deps: {
    store: SnapshotStore;
    map?: MapIndex;
    onProgress?: Progress;
    modules?: Record<string, InputModule>;
    fresh?: FreshGate;
  },
): Promise<SnapshotResult> {
  const { store, map, onProgress } = deps;
  const say = (stage: string, message: string) => onProgress?.({ stage, message });
  const mod = moduleFor(req, deps.modules ?? modules);
  const d = mod.descriptor;
  const latest = req.at === undefined || req.at === 'latest';
  // Only a module that reads a public source has anything to gate.
  const gate = d.live ? deps.fresh : undefined;
  const scope = mod.keyFor?.(req.params) ?? { chain: d.chain, population: d.population };
  const rows = await store.list(d.id);
  // Nothing stored for this target, so this can only be a fresh read: a refusal costs no call.
  if (gate && !rows.some((r) => r.chain === scope.chain && r.population === scope.population)) {
    gate.check();
  }

  say('resolving', `resolving ${latest ? 'latest' : JSON.stringify(req.at)} for ${d.id}`);
  const at = await mod.resolveAt(req.at ?? 'latest', req.params);
  const key = { ...scope, block_height: at.block_height };
  say(
    'reading_map',
    `looking for ${d.id} at block ${at.block_height} in fixtures, cache and the map`,
  );

  const whereOf = (sha: string): SnapshotWhere =>
    rows.find((r) => r.sha256 === sha)?.where ?? 'cache';
  const found = (s: Snapshot, sha: string, where: SnapshotWhere) => {
    say(
      'found',
      `snapshot found in the ${where} (reused: true, ${s.snapshot.final ? 'final' : 'not final'}, block ${s.snapshot.block_height ?? 'none'})`,
    );
    return result(s, sha, true, where);
  };

  // 2. this block, in the store
  const sha = await store.lookup(key);
  if (sha) {
    const s = await store.get(sha);
    if (s && (s.snapshot.final || !req.fresh)) return found(s, sha, whereOf(sha));
  }

  // 3. "latest": a final snapshot from the last few minutes
  if (latest && !req.fresh) {
    const headMs = Date.parse(at.as_of);
    const recent = rows
      .filter(
        (r) =>
          r.final &&
          r.chain === key.chain &&
          r.population === key.population &&
          r.block_height !== null &&
          r.block_height <= at.block_height &&
          headMs - Date.parse(r.as_of) <= LATEST_REUSE_S * 1000,
      )
      .sort((a, b) => (b.block_height ?? 0) - (a.block_height ?? 0))[0];
    if (recent) {
      const s = await store.get(recent.sha256);
      if (s) return found(s, recent.sha256, recent.where);
    }
  }

  // 2b. this block, on the map index (the body must be here; fetching it from urls[] is T103)
  let mapSha: string | null = null;
  if (map) {
    try {
      mapSha = await map.lookup(key);
    } catch (e) {
      say(
        'reading_map',
        `the map index could not be read (${(e as Error).message}); going on without it`,
      );
    }
    if (mapSha) {
      const s = await store.get(mapSha);
      if (s && (s.snapshot.final || !req.fresh)) return found(s, mapSha, 'map');
      say(
        'reading_map',
        `the map knows this block as ${mapSha.slice(0, 12)}…, but its body is not here; fetching`,
      );
    }
  }

  // 4. fetch, check, store, record
  say('fetching', `fetching ${d.id} at block ${at.block_height}${d.live ? ' (live)' : ''}`);
  const read = async () => {
    const s = await mod.fetch(at, req.params, onProgress);
    check(d.id, s);
    return { s, put: await store.put(s) };
  };
  const { s, put } = await (gate ? gate.run(read) : read());
  say('storing', `stored as ${put.sha256} (${put.bytes} bytes canonical)`);

  if (map && s.snapshot.final && mapSha !== put.sha256) {
    if (mapSha) {
      say(
        'recording',
        `the map already lists ${mapSha.slice(0, 12)}… for this block; not overwriting it`,
      );
    } else {
      const row = (await store.list(d.id)).find((r) => r.sha256 === put.sha256);
      const ref: SnapshotRef = {
        petal: 'snapshot-ref/v1',
        sha256: put.sha256,
        bytes: put.bytes,
        gz_bytes: row?.gz_bytes ?? 0,
        rows: rowsOf(s),
        network: { id: s.network.id, chain: s.network.chain, population: s.network.population },
        as_of: s.snapshot.as_of,
        block_height: s.snapshot.block_height ?? null,
        final: true,
        module: s.module,
        urls: [bodyUrl(put.sha256)],
      };
      const writing = map.record(ref).then(
        (tx) =>
          say(
            'recording',
            tx
              ? `fingerprint written to the map (tx ${tx.tx_hash})`
              : 'no map configured; fingerprint not written',
          ),
        (e: unknown) =>
          say(
            'recording',
            `the fingerprint could not be written to the map: ${(e as Error).message}`,
          ),
      );
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<'late'>((r) => {
        timer = setTimeout(() => r('late'), RECORD_WAIT_MS);
      });
      const first = await Promise.race([writing, late]);
      clearTimeout(timer);
      if (first === 'late')
        say('recording', 'the fingerprint is on its way to the map; not waiting');
    }
  }
  return result(s, put.sha256, false, 'fetched');
}

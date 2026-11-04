// T037: getSnapshot, on the file store and the map stand-in (fakeMap from @petal/near).
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import type { At, ProgressEvent, ResolvedAt, Snapshot } from '@petal/core/types';
import { fakeMap } from '@petal/near';
import { afterEach, describe, expect, test } from 'vitest';
import { fileStore, getSnapshot, type InputModule, LATEST_REUSE_S, modules } from '../src/index.ts';
import { HOUSE_OF_STAKE_DESCRIPTOR } from '../src/modules/near-house-of-stake.ts';
import { expected, recording, replayedHos } from './helpers/hos.ts';
import { indexKey, mapIndexOver, snapshotKey } from './helpers/map.ts';
import { FIXTURES, liveSnapshot, tmp, VALIDATORS_SHA } from './helpers/snapshots.ts';

const saved = { ...modules };
afterEach(() => {
  for (const k of Object.keys(modules)) if (!(k in saved)) delete modules[k];
  Object.assign(modules, saved);
});

const store = (cache = tmp('cache')) => fileStore({ fixtures: FIXTURES, cache });
const timed = async <T>(f: () => Promise<T>): Promise<[T, number]> => {
  const t = performance.now();
  const r = await f();
  return [r, performance.now() - t];
};

/** A live test network whose head the test moves; counts fetches. */
function fakeLive(head: { block: number; ms: number }, final = true) {
  let fetches = 0;
  const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const mod: InputModule = {
    descriptor: {
      ...HOUSE_OF_STAKE_DESCRIPTOR,
      id: 'test-live',
      chain: 'near:testnet',
      population: 'test-live',
      sources: [{ id: 'rpc', kind: 'chain', url: 'https://rpc.example' }],
    },
    async resolveAt(at: At) {
      if (typeof at === 'object')
        return { block_height: at.block_height, as_of: iso(head.ms - 1000) };
      return { block_height: head.block, as_of: iso(head.ms) };
    },
    async fetch(at: ResolvedAt): Promise<Snapshot> {
      fetches++;
      return liveSnapshot(at.block_height, at.as_of, final);
    },
  };
  modules['test-live'] = mod;
  return { fetches: () => fetches };
}

describe('getSnapshot', () => {
  test('NEAR validators: found in the fixtures, final, reused', async () => {
    const events: ProgressEvent[] = [];
    const [r, ms] = await timed(() =>
      getSnapshot(
        { network: 'near-validators' },
        { store: store(), onProgress: (e) => events.push(e) },
      ),
    );
    expect(r).toMatchObject({
      sha256: VALIDATORS_SHA,
      reused: true,
      where: 'fixture',
      snapshot: { as_of: '2026-11-03T19:42:00Z', block_height: 222915356, final: true },
      network: { id: 'near-validators', chain: 'near:mainnet', population: 'validators' },
      body_url: `/api/v1/snapshots/${VALIDATORS_SHA}`,
    });
    expect(r.counts.participants).toBe(8487);
    expect(r.coverage.measure).toBe('delegated_stake');
    expect(r.sources.length).toBe(8);
    expect('participants' in r).toBe(false); // never the body
    expect(events.map((e) => e.stage)).toEqual(['resolving', 'reading_map', 'found']);
    expect(ms).toBeLessThan(1000);
  });

  test('House of Stake: the first call fetches and writes the map, the second is reused in under 300 ms', async () => {
    modules['near-house-of-stake'] = replayedHos().module;
    const index = mapIndexOver();
    const deps = { store: store(), map: index };

    const events: ProgressEvent[] = [];
    const first = await getSnapshot(
      { network: 'near-house-of-stake' },
      { ...deps, onProgress: (e) => events.push(e) },
    );
    expect(first).toMatchObject({
      sha256: expected.sha256,
      reused: false,
      where: 'fetched',
      snapshot: { block_height: expected.block_height, as_of: expected.as_of, final: true },
      counts: expected.counts,
    });
    const stages = events.map((e) => e.stage);
    expect(stages.slice(0, 3)).toEqual(['resolving', 'reading_map', 'fetching']);
    expect(stages).toContain('storing');
    expect(stages.at(-1)).toBe('recording');

    // the map: the fingerprint and the index key, in one write
    const writes = index.map.writes();
    expect(writes).toHaveLength(1);
    const key = {
      chain: 'near:mainnet',
      population: 'house-of-stake',
      block_height: expected.block_height,
    };
    expect(writes[0]?.keys.sort()).toEqual([indexKey(key), snapshotKey(expected.sha256)].sort());
    expect((await index.map.get(indexKey(key), index.map.writer))?.value).toEqual({
      sha256: expected.sha256,
    });
    const ref = (await index.map.get(snapshotKey(expected.sha256), index.map.writer))?.value;
    expect(ref).toMatchObject({
      petal: 'snapshot-ref/v1',
      sha256: expected.sha256,
      bytes: expected.bytes,
      rows:
        expected.counts.participants +
        expected.counts.holdings +
        expected.counts.relationships +
        expected.counts.events,
      network: { id: 'near-house-of-stake', chain: 'near:mainnet', population: 'house-of-stake' },
      as_of: expected.as_of,
      block_height: expected.block_height,
      final: true,
      module: { id: 'near-house-of-stake', version: 'live/1' },
      urls: [`/api/v1/snapshots/${expected.sha256}`],
    });
    expect((ref as { gz_bytes: number }).gz_bytes).toBeGreaterThan(0);

    const [second, ms] = await timed(() => getSnapshot({ network: 'near-house-of-stake' }, deps));
    expect(second).toMatchObject({ sha256: expected.sha256, reused: true, where: 'cache' });
    expect(ms).toBeLessThanOrEqual(300);
    expect(index.map.writes()).toHaveLength(1);

    // the same block asked for by height is reused too, even with fresh: true (it is final)
    const third = await getSnapshot(
      { network: 'near-house-of-stake', at: { block_height: expected.block_height }, fresh: true },
      deps,
    );
    expect(third).toMatchObject({ sha256: expected.sha256, reused: true });
  });

  test('another machine on the same map: the map knows the block; same bytes, no second write', async () => {
    modules['near-house-of-stake'] = replayedHos().module;
    const index = mapIndexOver();
    const aCache = tmp('a');
    await getSnapshot({ network: 'near-house-of-stake' }, { store: store(aCache), map: index });

    // b has no copy. The body is not on the map (fetching it from urls[] is T103), so b re-reads
    // the block, gets the same sha256, and leaves the map as it is.
    const events: string[] = [];
    const b = await getSnapshot(
      { network: 'near-house-of-stake' },
      { store: store(), map: index, onProgress: (e) => events.push(e.message) },
    );
    expect(b).toMatchObject({ sha256: expected.sha256, reused: false, where: 'fetched' });
    expect(events.some((m) => m.includes('the map knows this block'))).toBe(true);
    expect(index.map.writes()).toHaveLength(1);

    // c holds the body but no index row for it: the map index finds it
    const cCache = tmp('c');
    const file = `${expected.sha256}.json.gz`;
    copyFileSync(join(aCache, file), join(cCache, file));
    const c = await getSnapshot(
      { network: 'near-house-of-stake' },
      { store: store(cCache), map: index },
    );
    expect(c).toMatchObject({ sha256: expected.sha256, reused: true, where: 'map' });
  });

  test('"latest" reuses a final snapshot from the last few minutes; fresh: true reads the new head', async () => {
    const head = { block: 5000, ms: Date.parse('2026-11-04T12:00:00Z') };
    const live = fakeLive(head);
    const deps = { store: store() };
    const a = await getSnapshot({ network: 'test-live' }, deps);
    expect(a).toMatchObject({ reused: false, snapshot: { block_height: 5000 } });

    head.block += 100;
    head.ms += 60_000;
    const b = await getSnapshot({ network: 'test-live', at: 'latest' }, deps);
    expect(b).toMatchObject({
      sha256: a.sha256,
      reused: true,
      where: 'cache',
      snapshot: { block_height: 5000 },
    });
    expect(live.fetches()).toBe(1);

    const c = await getSnapshot({ network: 'test-live', fresh: true }, deps);
    expect(c).toMatchObject({ reused: false, where: 'fetched', snapshot: { block_height: 5100 } });
    expect(live.fetches()).toBe(2);

    // past the window, latest reads again
    head.block += 2000;
    head.ms += (LATEST_REUSE_S + 1) * 1000;
    const d = await getSnapshot({ network: 'test-live' }, deps);
    expect(d).toMatchObject({ reused: false, snapshot: { block_height: 7100 } });
    expect(live.fetches()).toBe(3);
  });

  test('non-final data: reused unless fresh: true, and never written to the map', async () => {
    const live = fakeLive({ block: 42, ms: Date.parse('2026-11-04T12:00:00Z') }, false);
    const index = mapIndexOver(fakeMap());
    const deps = { store: store(), map: index };
    const a = await getSnapshot({ network: 'test-live' }, deps);
    expect(a).toMatchObject({ reused: false, snapshot: { final: false } });
    const b = await getSnapshot({ network: 'test-live' }, deps);
    expect(b).toMatchObject({ sha256: a.sha256, reused: true });
    const c = await getSnapshot({ network: 'test-live', fresh: true }, deps);
    expect(c.reused).toBe(false);
    expect(live.fetches()).toBe(2);
    expect(index.map.writes()).toHaveLength(0);
  });

  test('a map that fails does not fail the snapshot', async () => {
    fakeLive({ block: 7, ms: Date.parse('2026-11-04T12:00:00Z') });
    const events: string[] = [];
    const r = await getSnapshot(
      { network: 'test-live' },
      {
        store: store(),
        map: {
          lookup: async () => {
            throw new Error('kv down');
          },
          record: async () => {
            throw new Error('rpc down');
          },
        },
        onProgress: (e) => events.push(e.message),
      },
    );
    expect(r.reused).toBe(false);
    expect(events.some((m) => m.includes('kv down'))).toBe(true);
    expect(events.some((m) => m.includes('could not be written to the map: rpc down'))).toBe(true);
  });

  test('errors: unknown network, unknown parameter, a source that fails', async () => {
    const err = await getSnapshot({ network: 'bitcoin-mining-pools' }, { store: store() }).catch(
      (e) => e,
    );
    expect(err).toMatchObject({ code: 'cannot_read' });
    expect(err.hint).toMatch(/near-house-of-stake, near-validators/);
    await expect(
      getSnapshot({ network: 'near-validators', params: { dao: 'x' } }, { store: store() }),
    ).rejects.toMatchObject({ code: 'bad_input' });
    await expect(
      getSnapshot({ network: 'near-validators', at: 'nope' }, { store: store() }),
    ).rejects.toMatchObject({
      code: 'bad_input',
    });

    modules['near-house-of-stake'] = replayedHos({
      calls: recording.calls.filter(
        (c) => (c.request.params as { method_name?: string }).method_name !== 'get_accounts',
      ),
    }).module;
    const failed = await getSnapshot({ network: 'near-house-of-stake' }, { store: store() }).catch(
      (e) => e,
    );
    expect(failed).toMatchObject({ code: 'source_failed' });
    expect(failed.message).toMatch(/^venear-accounts: venear\.dao\.get_accounts/);
  });

  test('deps.modules (v1.1): reads through the registry it is given, not the built-in one', async () => {
    fakeLive({ block: 300_000_000, ms: Date.UTC(2026, 10, 4, 12) });
    const own = { 'test-live': modules['test-live'] as InputModule };
    delete modules['test-live'];
    const first = await getSnapshot({ network: 'test-live' }, { store: store(), modules: own });
    expect(first).toMatchObject({ reused: false, where: 'fetched' });
    const none = await getSnapshot(
      { network: 'near-validators' },
      { store: store(), modules: {} },
    ).catch((e) => e);
    expect(none).toMatchObject({ code: 'cannot_read' });
    await expect(getSnapshot({ network: 'test-live' }, { store: store() })).rejects.toMatchObject({
      code: 'cannot_read',
    });
  });
});

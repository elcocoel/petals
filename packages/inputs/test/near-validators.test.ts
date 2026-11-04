// T035: the near-validators module, served from the fixture.
import { describe, expect, test } from 'vitest';
import { InputError } from '../src/errors.ts';
import { modules } from '../src/index.ts';
import { NEAR_VALIDATORS_DESCRIPTOR, nearValidators } from '../src/modules/near-validators.ts';
import { snapshotProblems } from './helpers/schema.ts';
import { tmp } from './helpers/snapshots.ts';

const BLOCK = 222915356;

describe('near-validators', () => {
  const mod = nearValidators();

  test('is registered, stored only', () => {
    expect(modules['near-validators']?.descriptor).toBe(NEAR_VALIDATORS_DESCRIPTOR);
    expect(mod.descriptor).toMatchObject({
      id: 'near-validators',
      chain: 'near:mainnet',
      population: 'validators',
      kind: 'chain',
      live: false,
      params: {},
    });
    expect(mod.descriptor.cost.calls).toBe(0);
  });

  test('resolves latest, the stored block, and dates on or after it', async () => {
    const at = { block_height: BLOCK, as_of: '2026-11-03T19:42:00Z' };
    expect(await mod.resolveAt('latest')).toEqual(at);
    expect(await mod.resolveAt({ block_height: BLOCK })).toEqual(at);
    expect(await mod.resolveAt('2026-11-03')).toEqual(at); // a bare date is the end of that day
    expect(await mod.resolveAt('2026-11-04T08:00:00Z')).toEqual(at);
  });

  test('refuses what is not stored, saying what is', async () => {
    for (const at of [{ block_height: 1 }, '2026-11-02', '2026-11-03T19:00:00Z'] as const) {
      const err = (await mod.resolveAt(at).catch((e) => e)) as InputError;
      expect(err).toBeInstanceOf(InputError);
      expect(err.code).toBe('cannot_read');
      expect(err.hint).toMatch(/block 222915356 \(2026-11-03T19:42:00Z\)/);
    }
    await expect(mod.resolveAt('yesterday')).rejects.toMatchObject({ code: 'bad_input' });
    await expect(
      nearValidators({ fixtures: tmp('empty') }).resolveAt('latest'),
    ).rejects.toMatchObject({
      code: 'cannot_read',
    });
  });

  test('fetch serves the fixture, schema-valid, with every descriptor source in it', async () => {
    const events: string[] = [];
    const s = await mod.fetch(
      { block_height: BLOCK, as_of: '2026-11-03T19:42:00Z' },
      undefined,
      (e) => events.push(e.stage),
    );
    expect(events).toEqual(['fetching']);
    expect(snapshotProblems(s)).toEqual([]);
    expect(s.network).toMatchObject({
      id: 'near-validators',
      chain: 'near:mainnet',
      population: 'validators',
    });

    // the descriptor's sources are the snapshot's, and every meaning cites one of them
    const d = mod.descriptor;
    expect(d.sources).toEqual(s.sources.map(({ id, kind, url }) => ({ id, kind, url })));
    const ids = new Set(s.sources.map((x) => x.id));
    for (const [k, m] of Object.entries(d.capabilities.meanings)) {
      expect(m.sources.length, k).toBeGreaterThan(0);
      for (const src of m.sources) expect(ids.has(src), `${k} cites ${src}`).toBe(true);
    }
    // every allowed `by` has a standard meaning, and every measure is in the holdings
    for (const [prim, bys] of Object.entries(d.capabilities.by))
      for (const by of bys ?? [])
        expect(d.capabilities.meanings[`${prim}:${by}`], `${prim}:${by}`).toBeDefined();
    const measures = new Set(s.holdings.map((h) => h.measure));
    for (const m of d.capabilities.measures) expect(measures.has(m.id), m.id).toBe(true);
    expect(d.capabilities.measures[0]?.id).toBe('validator_stake_current_epoch');
    // segments: backers needs the classes the fixture carries
    expect(d.capabilities.segments).toEqual(['backers']);
    expect(
      s.participants.some(
        (p) => p.kind === 'group' && (p.detail as { backer_class?: string })?.backer_class,
      ),
    ).toBe(true);
    const rels = new Set(s.relationships.map((r) => r.type));
    for (const r of d.capabilities.relationships) expect(rels.has(r), r).toBe(true);
  });

  test('fetch refuses a block it does not store', async () => {
    await expect(
      mod.fetch({ block_height: 5, as_of: '2020-01-01T00:00:00Z' }, undefined),
    ).rejects.toMatchObject({
      code: 'cannot_read',
    });
  });
});

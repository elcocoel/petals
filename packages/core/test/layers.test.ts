// The data protocol's layers and the seam's first version (specs/005-mapping-brain).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  COMPOSED,
  checkLayer,
  composeView,
  type Layer,
  LayerError,
  layerHash,
  validateSnapshot,
} from '../src/index.ts';
import type { Snapshot } from '../src/types/index.ts';

const FIXTURES = fileURLToPath(new URL('../../../fixtures/snapshots/test/', import.meta.url));
const base = (): Snapshot =>
  JSON.parse(readFileSync(join(FIXTURES, 'two-participants.json'), 'utf8')) as Snapshot;

const layer = (over: Partial<Layer> = {}): Layer => ({
  petal: 'layer/v1',
  about: 'near:mainnet:validators-test',
  kind: 'measures',
  measures: [{ name: 'proposals_written', unit: 'proposals', kind: 'count' }],
  rows: [
    { participant: 'astro-stakers.poolv1.near', measure: 'proposals_written', value: '7' },
    { participant: 'figment.poolv1.near', measure: 'proposals_written', value: '2' },
  ],
  how: { method: 'counted submission events by sender', sources: [{ url: 'https://rpc.example' }] },
  from: [],
  when: { as_of: '2026-11-09T00:00:00Z' },
  standing: 'verified',
  ...over,
});

describe('a layer', () => {
  test('is checked, and named by the hash of what it holds', () => {
    const l = checkLayer(layer());
    expect(layerHash(l)).toMatch(/^[0-9a-f]{64}$/);
    // the same facts have the same name, whatever order the keys came in
    expect(layerHash(JSON.parse(JSON.stringify(l)) as Layer)).toBe(layerHash(l));
    expect(layerHash(layer({ standing: 'inferred' }))).not.toBe(layerHash(l));
  });

  test('refuses a field the format does not know, and a date without its time (urn:petal:schema:layer:v1)', () => {
    expect(() => checkLayer({ ...layer(), by: 'someone' })).toThrow(
      /must NOT have additional properties/,
    );
    expect(() => checkLayer(layer({ when: { as_of: '2026-11-09' } }))).toThrow(
      /as_of must match format "date-time"/,
    );
    expect(() =>
      checkLayer(layer({ how: { method: 'x', sources: [], extra: 1 } as unknown as Layer['how'] })),
    ).toThrow(/additional properties/);
  });

  test('refuses what it is not', () => {
    for (const bad of [
      { about: 'validators' },
      { measures: [] },
      { rows: [{ participant: 'x', measure: 'other', value: '1' }] },
      { rows: [{ participant: 'x', measure: 'proposals_written', value: 'many' }] },
      { how: { method: '', sources: [] } },
      { from: ['not-a-hash'] },
      { standing: 'certain' as never },
    ]) {
      expect(() => checkLayer(layer(bad as Partial<Layer>))).toThrow(LayerError);
    }
  });
});

describe('a composed reading (seam/v1)', () => {
  test("adds a layer's measure beside the base's, with the layer as its source", () => {
    const l = layer();
    const hash = layerHash(l);
    const view = composeView(base(), [{ hash, layer: l }]);
    expect(validateSnapshot(view).ok).toBe(true);
    expect(view.module).toEqual({ id: COMPOSED, version: 'seam/v1' });
    expect(new Set(view.holdings.map((h) => h.measure))).toEqual(
      new Set(['validator_stake_current_epoch', 'proposals_written']),
    );
    const source = view.sources.find((s) => s.url === `petal:layer:${hash}`);
    expect(source?.kind).toBe('dataset');
    expect(source?.method).toMatch(/^verified: /);
    expect(view.holdings.filter((h) => h.source === source?.id)).toHaveLength(2);
    // never taken for the base reading when a store looks one up
    expect(view.network.population).not.toBe(base().network.population);
    expect(view.network.id).toBe(base().network.id);
  });

  test('a participant only the layer knows joins, and a measure name comes from one layer', () => {
    const l = layer({
      rows: [{ participant: 'new.poolv1.near', measure: 'proposals_written', value: '1' }],
    });
    const view = composeView(base(), [{ hash: layerHash(l), layer: l }]);
    expect(view.participants.map((p) => p.id)).toContain('new.poolv1.near');
    const twice = layer({
      measures: [{ name: 'validator_stake_current_epoch', unit: 'NEAR', kind: 'amount' }],
      rows: [
        {
          participant: 'figment.poolv1.near',
          measure: 'validator_stake_current_epoch',
          value: '1',
        },
      ],
    });
    expect(() => composeView(base(), [{ hash: layerHash(twice), layer: twice }])).toThrow(
      /two layers/,
    );
  });
});

// seam/v1 as a typed document (seam.md; systems check, step 2): every piece of data with its kind, standing and
// layer, valid against urn:petal:schema:seam:v1, and about the same address as the reading it starts from.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  aboutOf,
  canonicalJson,
  checkLayer,
  composeView,
  type Layer,
  LayerError,
  layerHash,
  seamOf,
  sha256Hex,
} from '../src/index.ts';
import { createAjv, schemaId } from '../src/schema/ajv.ts';
import type { Snapshot } from '../src/types/index.ts';

const FIXTURES = fileURLToPath(new URL('../../../fixtures/snapshots/test/', import.meta.url));
const read = (name: string) => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as Snapshot;
const layer = (over: Partial<Layer> = {}): Layer =>
  checkLayer({
    petal: 'layer/v1',
    about: 'near:mainnet:validators-test',
    kind: 'measures',
    measures: [{ name: 'proposals', unit: 'proposals', kind: 'count' }],
    rows: [{ participant: 'a.poolv1.near', measure: 'proposals', value: '4' }],
    how: { method: 'counted', sources: [{ url: 'https://rpc.example' }] },
    from: [],
    when: { as_of: '2026-11-09T00:00:00Z' },
    standing: 'inferred',
    ...over,
  });
const added = (l: Layer) => ({ hash: layerHash(l), layer: l });
const valid = createAjv().getSchema(schemaId('seam'));

describe('seam/v1', () => {
  const base = read('tiny-backers.json');
  const baseHash = sha256Hex(canonicalJson(base));

  test('the reading gives amount, share, kind, identity and backers, each typed, and a layer its own', () => {
    const seam = seamOf(base, baseHash, [added(layer())]);
    expect(valid?.(seam)).toBe(true);
    const kinds = Object.fromEntries(seam.data.map((p) => [p.name, p.kind]));
    expect(kinds).toMatchObject({
      amount: 'amount',
      share: 'share',
      kind: 'category',
      identity: 'category',
      backers: 'parts',
      proposals: 'count',
    });
    const proposals = seam.data.find((p) => p.name === 'proposals');
    expect(proposals).toMatchObject({ standing: 'inferred', layer: layerHash(layer()) });
    expect(seam.layers).toEqual([baseHash, layerHash(layer())]);
    expect(seam.participants).toContain('a.poolv1.near');
    expect(seam.dates).toEqual([...seam.dates].sort());
  });

  test('shares add up to one, and identity is one of its four values', () => {
    const seam = seamOf(base, baseHash, [added(layer())]);
    const share = seam.data.find((p) => p.name === 'share');
    const total =
      share && 'values' in share ? share.values.reduce((a, v) => a + Number(v.value), 0) : 0;
    expect(total).toBeCloseTo(1, 6);
    const identity = seam.data.find((p) => p.name === 'identity');
    for (const v of identity && 'values' in identity ? identity.values : []) {
      expect(['verified', 'self-declared', 'inferred', 'none']).toContain(v.value);
    }
  });

  test('a layer about another address is refused, by the seam and by compose', () => {
    const other = layer({ about: 'near:mainnet:somewhere-else' });
    expect(() => seamOf(base, baseHash, [added(other)])).toThrow(LayerError);
    expect(() => composeView(base, [added(other)])).toThrow(/is about near:mainnet:somewhere-else/);
  });

  test('a name the reading already gives is refused from a layer', () => {
    const clash = layer({
      measures: [{ name: 'share', unit: 'share', kind: 'share' }],
      rows: [{ participant: 'a.poolv1.near', measure: 'share', value: '0.5' }],
    });
    expect(() => seamOf(base, baseHash, [added(clash)])).toThrow(/share comes from two places/);
  });

  test('a reading is about its address parameter, or its population', () => {
    expect(aboutOf(base)).toBe('near:mainnet:validators-test');
    const dao = {
      ...base,
      network: { ...base.network, chain: 'eip155:100', params: { dao: '0xabc' } },
    };
    expect(aboutOf(dao as Snapshot)).toBe('eip155:100:0xabc');
  });
});

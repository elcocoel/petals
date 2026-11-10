// view/v1 (specs/006-the-map/contracts/view.md): the schema is the contract's copy, the fixtures are
// valid and pinned, each dimension accepts exactly its kinds, and a view draws only what a flower has.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { DEFAULT_CONVENTION } from '../src/convention/default.ts';
import { MEASURE_KINDS } from '../src/layers.ts';
import { createAjv, schemaId } from '../src/schema/ajv.ts';
import type { View } from '../src/types/index.ts';
import { VIEW_VERSION } from '../src/versions.ts';
import {
  ACCEPTS,
  DEFAULT_VIEW,
  DIMENSIONS,
  EVERY_FLOWER,
  fits,
  inUse,
  type Piece,
  viewHash,
} from '../src/view/index.ts';

const root = join(import.meta.dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p));
const fixture = (name: string) =>
  JSON.parse(read(`packages/core/schema/fixtures/${name}`).toString()) as View;
const ajv = createAjv();
const valid = (doc: unknown) => {
  const v = ajv.getSchema(schemaId('view'));
  if (!v) throw new Error('view schema not registered');
  return { ok: v(doc) as boolean, errors: v.errors ?? [] };
};

describe('the schema', () => {
  test("is a byte copy of 006's contract", () => {
    expect(read('packages/core/schema/view.schema.json')).toEqual(
      read('specs/006-the-map/contracts/view-v1.schema.json'),
    );
  });

  test('names its version, and the version is view/v1', () => {
    expect(VIEW_VERSION).toBe('view/v1');
    expect(
      JSON.parse(read('packages/core/schema/view.schema.json').toString()).properties.petal,
    ).toEqual({
      const: VIEW_VERSION,
    });
  });

  test('has exactly the nine dimensions', () => {
    const schema = JSON.parse(read('packages/core/schema/view.schema.json').toString());
    expect([...schema.properties.dimensions.required].sort()).toEqual([...DIMENSIONS].sort());
  });

  test('refuses a view with words of its own, a missing dimension, or one more', () => {
    const words = structuredClone(DEFAULT_VIEW) as unknown as {
      dimensions: Record<string, unknown>;
    };
    words.dimensions.colour = { data: 'kind', meaning: 'kind of wallet' };
    const missing = structuredClone(DEFAULT_VIEW) as unknown as {
      dimensions: Record<string, unknown>;
    };
    delete missing.dimensions.lines;
    const extra = structuredClone(DEFAULT_VIEW) as unknown as {
      dimensions: Record<string, unknown>;
    };
    extra.dimensions.glow = null;
    for (const doc of [words, missing, extra]) expect(valid(doc).ok).toBe(false);
  });

  test("takes a layer's own name, and <layer>:<name>", () => {
    for (const data of ['proposals', 'moloch-v3:shares']) {
      const v = structuredClone(DEFAULT_VIEW);
      v.dimensions.height = { data };
      expect(valid(v).errors).toEqual([]);
    }
  });
});

describe('the fixtures', () => {
  test.each([
    ['view.v1.json', '1421e0bf7b2642e78008091c8bd2db8d22f924114d2144344ae8c5f8ae6e7b9b'],
    ['view.v1.proposals.json', '866a6699ed4708acd19551e63347aa71e83c14fc641e880650ec54b52716a4cb'],
  ])('%s is valid and pinned', (name, hash) => {
    const v = fixture(name);
    expect(valid(v).errors).toEqual([]);
    expect(viewHash(v)).toBe(hash);
  });

  test('the default fixture is the default view', () => {
    expect(fixture('view.v1.json')).toEqual(DEFAULT_VIEW);
  });

  test("Elco's case is the default with proposals as marks", () => {
    const v = fixture('view.v1.proposals.json');
    expect({ ...v.dimensions, markings: null }).toEqual(DEFAULT_VIEW.dimensions);
    expect(v.dimensions.markings).toEqual({ data: 'proposals' });
  });
});

describe('the default', () => {
  test("is default/v1's choices, written as a view", () => {
    const c = DEFAULT_CONVENTION.encodings;
    const d = DEFAULT_VIEW.dimensions;
    expect(d.height).toEqual({ data: c.height.by, scale: c.height.scale });
    expect(d.width).toEqual({
      data: c.width.by,
      scale: c.width.scale,
      max_ratio: c.width.max_ratio,
    });
    expect(d.colour).toEqual({ data: c.colour.by });
    expect(c.outline?.by).toBe('identity_status');
    expect(d.outline).toEqual({ data: 'identity' });
    expect(c.order.by).toBe('measure_desc');
    expect(d.order).toEqual({ data: 'share' });
    expect([d.texture, d.markings, d.lines]).toEqual([null, null, null]);
  });
});

describe('dimensions and kinds', () => {
  test('each dimension accepts exactly the kinds in the contract', () => {
    expect(ACCEPTS).toEqual({
      height: ['amount', 'count', 'share'],
      width: ['amount', 'count', 'share'],
      order: ['amount', 'count', 'share', 'category'],
      colour: ['category', 'amount', 'count', 'share'],
      outline: ['flag', 'category'],
      texture: ['flag', 'category'],
      markings: ['count', 'flag'],
      segments: ['parts'],
      lines: ['relation'],
    });
  });

  test("every kind 005 has goes somewhere, and only parts and relation are the view's own", () => {
    const all = new Set(Object.values(ACCEPTS).flat());
    for (const k of MEASURE_KINDS) expect(all.has(k)).toBe(true);
    expect(
      [...all].filter((k) => !(MEASURE_KINDS as readonly string[]).includes(k)).sort(),
    ).toEqual(['parts', 'relation']);
  });

  test('fits says the same as the table', () => {
    for (const d of DIMENSIONS) for (const k of ACCEPTS[d]) expect(fits(d, k)).toBe(true);
    expect(fits('height', 'category')).toBe(false);
    expect(fits('lines', 'share')).toBe(false);
  });
});

describe('a view meeting a flower', () => {
  const near: Piece[] = [...EVERY_FLOWER, { name: 'backers', kind: 'parts' }];
  const moloch: Piece[] = [...EVERY_FLOWER, { name: 'proposals', kind: 'count' }];

  test('the default draws what every flower has, and no bands, as default/v1', () => {
    const a = inUse(DEFAULT_VIEW, near);
    expect(a).toMatchObject({ height: 'share', width: 'share', colour: 'kind', segments: null });
    const banded = structuredClone(DEFAULT_VIEW);
    banded.dimensions.segments = { data: 'backers' };
    expect(inUse(banded, near).segments).toBe('backers');
    expect(inUse(banded, moloch).segments).toBeNull();
  });

  test('a piece of data a flower lacks shows nothing there, with no fallback', () => {
    const v = fixture('view.v1.proposals.json');
    expect(inUse(v, moloch).markings).toBe('proposals');
    expect(inUse(v, near).markings).toBeNull();
  });

  test("a piece of data of a kind the dimension doesn't take shows nothing", () => {
    const v = structuredClone(DEFAULT_VIEW);
    v.dimensions.height = { data: 'kind' };
    expect(inUse(v, near).height).toBeNull();
  });

  test('any piece of data of a fitting kind can go in any dimension that takes it', () => {
    const v = structuredClone(DEFAULT_VIEW);
    v.dimensions.colour = { data: 'proposals' };
    v.dimensions.height = { data: 'proposals' };
    expect(inUse(v, moloch)).toMatchObject({ colour: 'proposals', height: 'proposals' });
  });
});

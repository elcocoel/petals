// view/v1 and view/v2 (specs/006-the-map/contracts/view.md): each schema is the contract's copy, the fixtures
// are valid and pinned, each dimension accepts exactly its kinds, a view draws only what a flower has, and a
// view/v1 still reads, as v2 with labels on identity.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { DEFAULT_CONVENTION } from '../src/convention/default.ts';
import { MEASURE_KINDS } from '../src/layers.ts';
import { createAjv, schemaId } from '../src/schema/ajv.ts';
import type { View, ViewV1, ViewV2 } from '../src/types/index.ts';
import { VIEW_VERSION } from '../src/versions.ts';
import { viewProblem } from '../src/view/check.ts';
import {
  ACCEPTS,
  DEFAULT_HASHES,
  DEFAULT_VIEW,
  DEFAULT_VIEW_V1,
  DEFAULT_VIEW_V2_0,
  DIMENSIONS,
  EVERY_FLOWER,
  FORMER_DEFAULTS,
  FROM_ANNOTATIONS,
  fits,
  inUse,
  latestView,
  type Piece,
  viewHash,
} from '../src/view/index.ts';

const root = join(import.meta.dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p));
const fixture = (name: string) =>
  JSON.parse(read(`packages/core/schema/fixtures/${name}`).toString()) as View;
const ajv = createAjv();
const validAs = (name: 'view' | 'viewV2') => (doc: unknown) => {
  const v = ajv.getSchema(schemaId(name));
  if (!v) throw new Error(`${name} schema not registered`);
  return { ok: v(doc) as boolean, errors: v.errors ?? [] };
};
const valid = validAs('viewV2');
const validV1 = validAs('view');
const schemaOf = (file: string) =>
  JSON.parse(read(`packages/core/schema/${file}`).toString()) as {
    properties: { petal: unknown; dimensions: { required: string[] } };
  };

describe('the schemas', () => {
  test.each([
    ['view.schema.json', 'view-v1.schema.json'],
    ['view-v2.schema.json', 'view-v2.schema.json'],
  ])("%s is a byte copy of 006's contract", (mine, contract) => {
    expect(read(`packages/core/schema/${mine}`)).toEqual(
      read(`specs/006-the-map/contracts/${contract}`),
    );
  });

  test('each names its version, and the latest is view/v2', () => {
    expect(VIEW_VERSION).toBe('view/v2');
    expect(schemaOf('view-v2.schema.json').properties.petal).toEqual({ const: VIEW_VERSION });
    expect(schemaOf('view.schema.json').properties.petal).toEqual({ const: 'view/v1' });
  });

  test('v2 has exactly the ten dimensions; v1 has the nine before labels', () => {
    expect([...schemaOf('view-v2.schema.json').properties.dimensions.required].sort()).toEqual(
      [...DIMENSIONS].sort(),
    );
    expect([...schemaOf('view.schema.json').properties.dimensions.required].sort()).toEqual(
      DIMENSIONS.filter((d) => d !== 'labels').sort(),
    );
  });

  test('each version refuses the other: v1 has no labels, v2 must have them', () => {
    expect(validV1(DEFAULT_VIEW).ok).toBe(false);
    expect(valid(DEFAULT_VIEW_V1).ok).toBe(false);
    expect(valid({ ...DEFAULT_VIEW, petal: 'view/v1' }).ok).toBe(false);
  });

  test('the check picks the schema by the version the view says, and names any other', () => {
    expect(viewProblem(DEFAULT_VIEW)).toBeNull();
    expect(viewProblem(DEFAULT_VIEW_V1)).toBeNull();
    expect(viewProblem({ ...DEFAULT_VIEW, petal: 'view/v1' })).toMatch(/labels/);
    expect(viewProblem({ ...DEFAULT_VIEW, petal: 'view/v3' })).toMatch(/view\/v3/);
    expect(viewProblem(null)).toMatch(/not view\/v1 or view\/v2/);
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
    ['view.v1.json', '1421e0bf7b2642e78008091c8bd2db8d22f924114d2144344ae8c5f8ae6e7b9b', validV1],
    [
      'view.v1.proposals.json',
      '866a6699ed4708acd19551e63347aa71e83c14fc641e880650ec54b52716a4cb',
      validV1,
    ],
    ['view.v2.json', '4982b8169a9fd4fa39a3681080434dea2786daa1606316637e993511f6b42532', valid],
    [
      'view.v2.names.json',
      '98be4e1731d15f0ea479c798407dc1ee278daf7b2289eb50de4f6db6340894a9',
      valid,
    ],
  ])('%s is valid and pinned', (name, hash, check) => {
    const v = fixture(name);
    expect(check(v).errors).toEqual([]);
    expect(viewHash(v)).toBe(hash);
  });

  test('the default fixtures are the former defaults, v1 and v2 until 11 Nov, and their hashes still mean the default', () => {
    expect(fixture('view.v1.json')).toEqual(DEFAULT_VIEW_V1);
    expect(fixture('view.v2.json')).toEqual(DEFAULT_VIEW_V2_0);
    expect(DEFAULT_HASHES).toEqual([
      viewHash(DEFAULT_VIEW),
      viewHash(DEFAULT_VIEW_V2_0),
      viewHash(DEFAULT_VIEW_V1),
    ]);
    expect(FORMER_DEFAULTS.get(viewHash(DEFAULT_VIEW_V2_0))).toBe(DEFAULT_VIEW_V2_0);
    expect(FORMER_DEFAULTS.get(viewHash(DEFAULT_VIEW_V1))).toBe(DEFAULT_VIEW_V1);
  });

  test("Elco's case is the v1 default with proposals as marks", () => {
    const v = fixture('view.v1.proposals.json') as ViewV1;
    expect({ ...v.dimensions, markings: null }).toEqual(DEFAULT_VIEW_V1.dimensions);
    expect(v.dimensions.markings).toEqual({ data: 'proposals' });
  });

  test("names on the petals is the default with labels on a person's names, and outline on how they're known", () => {
    const v = fixture('view.v2.names.json') as ViewV2;
    expect({
      ...v.dimensions,
      labels: { data: 'identity' },
      outline: { data: 'identity' },
    }).toEqual(DEFAULT_VIEW_V2_0.dimensions);
    expect(v.dimensions.labels).toEqual({ data: 'name' });
    expect(v.dimensions.outline).toEqual({ data: 'name_kind' });
  });
});

describe('a view/v1 still reads', () => {
  test('as the same view with labels on identity, the names petals always had', () => {
    expect(latestView(DEFAULT_VIEW_V1)).toEqual(DEFAULT_VIEW_V2_0);
    const v = fixture('view.v1.proposals.json') as ViewV1;
    expect(latestView(v)).toEqual({
      petal: 'view/v2',
      dimensions: { ...v.dimensions, labels: { data: 'identity' } },
    });
    expect(latestView(DEFAULT_VIEW)).toBe(DEFAULT_VIEW);
  });

  test('and keeps its own hash: nothing is rewritten in place', () => {
    expect(viewHash(DEFAULT_VIEW_V1)).toBe(
      '1421e0bf7b2642e78008091c8bd2db8d22f924114d2144344ae8c5f8ae6e7b9b',
    );
    expect(viewHash(DEFAULT_VIEW)).not.toBe(viewHash(DEFAULT_VIEW_V1));
  });

  test('and meets a flower as v2 does', () => {
    const near: Piece[] = [...EVERY_FLOWER, { name: 'backers', kind: 'parts' }];
    expect(inUse(DEFAULT_VIEW_V1, near)).toEqual(inUse(DEFAULT_VIEW_V2_0, near));
    expect(inUse(DEFAULT_VIEW_V1, near).labels).toBe('identity');
  });
});

describe('the default', () => {
  test("since 11 Nov, the art direction's: straight heights, every petal as wide, the rest as before (#76)", () => {
    expect(DEFAULT_VIEW.dimensions).toEqual({
      ...DEFAULT_VIEW_V2_0.dimensions,
      height: { data: 'share', scale: 'linear' },
      width: null,
    });
    expect(viewProblem(DEFAULT_VIEW)).toBeNull();
  });

  test("until then, default/v1's choices, written as a view", () => {
    const c = DEFAULT_CONVENTION.encodings;
    const d = DEFAULT_VIEW_V2_0.dimensions;
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
    expect(d.labels).toEqual({ data: 'identity' });
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
      labels: ['category'],
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

  test('the default draws what every flower has, every petal as wide, and no bands', () => {
    const a = inUse(DEFAULT_VIEW, near);
    expect(a).toMatchObject({ height: 'share', width: null, colour: 'kind', segments: null });
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

  test("labels take a person's names where a flower has them, and only a category", () => {
    const v = fixture('view.v2.names.json');
    expect(inUse(v, [...moloch, ...FROM_ANNOTATIONS])).toMatchObject({
      labels: 'name',
      outline: 'name_kind',
    });
    expect(inUse(v, moloch)).toMatchObject({ labels: null, outline: null });
    const counted = structuredClone(DEFAULT_VIEW);
    counted.dimensions.labels = { data: 'proposals' };
    expect(inUse(counted, moloch).labels).toBeNull();
  });
});

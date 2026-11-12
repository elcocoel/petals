// view/v1 and view/v2 (specs/006-the-map/contracts/view.md): each schema is the contract's copy, the fixtures
// are valid and pinned, each dimension accepts exactly its kinds, a view draws only what a flower has, and a
// view/v1 still reads, as v2 with labels on identity.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { DEFAULT_CONVENTION } from '../src/convention/default.ts';
import { MEASURE_KINDS } from '../src/layers.ts';
import { createAjv, schemaId } from '../src/schema/ajv.ts';
import type { View, ViewV1, ViewV2, ViewV3 } from '../src/types/index.ts';
import { VIEW_VERSION } from '../src/versions.ts';
import { viewProblem } from '../src/view/check.ts';
import {
  ACCEPTS,
  COLOUR_KEYS,
  colourKeysOf,
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
  VIEW_KEYS_VERSION,
  viewHash,
  withColourKeys,
} from '../src/view/index.ts';

const root = join(import.meta.dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p));
const fixture = (name: string) =>
  JSON.parse(read(`packages/core/schema/fixtures/${name}`).toString()) as View;
const ajv = createAjv();
const validAs = (name: 'view' | 'viewV2' | 'viewV3') => (doc: unknown) => {
  const v = ajv.getSchema(schemaId(name));
  if (!v) throw new Error(`${name} schema not registered`);
  return { ok: v(doc) as boolean, errors: v.errors ?? [] };
};
const valid = validAs('viewV2');
const validV1 = validAs('view');
const validV3 = validAs('viewV3');
const schemaOf = (file: string) =>
  JSON.parse(read(`packages/core/schema/${file}`).toString()) as {
    properties: { petal: unknown; dimensions: { required: string[] } };
  };

describe('the schemas', () => {
  test.each([
    ['view.schema.json', 'view-v1.schema.json'],
    ['view-v2.schema.json', 'view-v2.schema.json'],
    ['view-v3.schema.json', 'view-v3.schema.json'],
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
    // view/v3 only adds colour's keys, so the default is a valid v3 too (12 Nov, wave 4); a v4 is no version
    expect(viewProblem({ ...DEFAULT_VIEW, petal: 'view/v3' })).toBeNull();
    expect(viewProblem({ ...DEFAULT_VIEW, petal: 'view/v4' })).toMatch(/view\/v4/);
    expect(viewProblem(null)).toMatch(/not view\/v1, view\/v2 or view\/v3/);
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
    ['view.v3.json', '190ec41d6fbd3942e29b99b3145bf51343af2f25ffa554deeb1173a871cfb713', validV3],
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
      order: ['amount', 'count', 'share', 'category', 'date'],
      // a category's values, or a number's or a date's grade (wave 4)
      colour: ['category', 'amount', 'count', 'share', 'date'],
      outline: ['flag', 'category'],
      // texture and markings take nothing until the look draws them (12 Nov: a choice draws, or isn't offered)
      texture: [],
      markings: [],
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
      // a date comes as a piece given with the reading (last_active), not as a measure; Order takes it
    ).toEqual(['date', 'parts', 'relation']);
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
    const v = structuredClone(DEFAULT_VIEW);
    v.dimensions.order = { data: 'proposals' };
    expect(inUse(v, moloch).order).toBe('proposals');
    expect(inUse(v, near).order).toBeNull();
  });

  test("a piece of data of a kind the dimension doesn't take shows nothing", () => {
    const v = structuredClone(DEFAULT_VIEW);
    v.dimensions.height = { data: 'kind' };
    expect(inUse(v, near).height).toBeNull();
  });

  test('any piece of data of a fitting kind can go in any dimension that takes it', () => {
    const v = structuredClone(DEFAULT_VIEW);
    v.dimensions.order = { data: 'proposals' };
    v.dimensions.height = { data: 'proposals' };
    expect(inUse(v, moloch)).toMatchObject({ order: 'proposals', height: 'proposals' });
    // Colour takes a count as a grade (wave 4)
    v.dimensions.colour = { data: 'proposals' };
    expect(inUse(v, moloch).colour).toBe('proposals');
  });

  test("labels take a person's names where a flower has them, and only a category", () => {
    const v = fixture('view.v2.names.json');
    // an outline draws how an identity is known, and nothing else yet (DRAWS_ONLY), so name_kind takes none
    expect(inUse(v, [...moloch, ...FROM_ANNOTATIONS])).toMatchObject({
      labels: 'name',
      outline: null,
    });
    expect(inUse(v, moloch)).toMatchObject({ labels: null, outline: null });
    const counted = structuredClone(DEFAULT_VIEW);
    counted.dimensions.labels = { data: 'proposals' };
    expect(inUse(counted, moloch).labels).toBeNull();
  });
});

describe('view/v3: the key each value of colour takes, as the person chose it (Elco, 12 Nov, wave 4)', () => {
  const keyed = fixture('view.v3.json');

  test("colour names its keys from the look's six; any other key or field is refused", () => {
    expect(viewProblem(keyed)).toBeNull();
    const wrong = structuredClone(keyed) as ViewV3;
    (wrong.dimensions.colour as { keys: Record<string, string> }).keys.voted = 'purple';
    expect(viewProblem(wrong)).not.toBeNull();
    // keys belong to colour only, and a v2 doesn't take them
    const v2 = { ...structuredClone(keyed), petal: 'view/v2' };
    expect(viewProblem(v2)).not.toBeNull();
  });

  test('choosing a key makes a v3; taking the last one away gives back the v2 and its hash', () => {
    const v2 = latestView(fixture('view.v2.json'));
    const chosen = withColourKeys(v2, { voted: 'mint' });
    expect(chosen.petal).toBe(VIEW_KEYS_VERSION);
    expect(colourKeysOf(chosen)).toEqual({ voted: 'mint' });
    expect(latestView(chosen)).toBe(chosen);
    const back = withColourKeys(chosen, {});
    expect(back).toEqual(v2);
    expect(viewHash(back)).toBe(viewHash(v2));
    expect(colourKeysOf(v2)).toEqual({});
    expect(COLOUR_KEYS).toEqual(['mint', 'blue', 'coral', 'apricot', 'pink', 'grey']);
  });
});

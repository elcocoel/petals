// T013: the contract schemas compile under strict Ajv (draft 2020-12, with formats), the sample
// documents validate, and the rules that matter most reject what they should.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createAjv, type SchemaName, schemaId } from '../src/schema/ajv.ts';
import { schemas } from '../src/schema/index.ts';
import {
  sampleCorrection,
  sampleEntry,
  sampleInterpretation,
  sampleSnapshot,
  sampleSpec,
} from './samples.ts';

const ajv = createAjv();
const validate = (name: SchemaName, doc: unknown) => {
  const v = ajv.getSchema(schemaId(name));
  if (!v) throw new Error(`schema ${name} not registered`);
  const ok = v(doc) as boolean;
  return { ok, errors: v.errors ?? [] };
};
const clone = <T>(x: T): T => structuredClone(x);

describe('schema copies', () => {
  const contracts = join(
    import.meta.dirname,
    '..',
    '..',
    '..',
    'specs',
    '001-petal-core',
    'contracts',
  );
  const schemaDir = join(import.meta.dirname, '..', 'schema');
  test.each([
    ['snapshot.schema.json', 'common-table.schema.json'],
    ['flower.schema.json', 'petal-spec.schema.json'],
  ])('%s is a byte copy of contracts/%s', (copy, original) => {
    expect(readFileSync(join(schemaDir, copy))).toEqual(readFileSync(join(contracts, original)));
  });
});

describe('sample documents validate', () => {
  test.each([
    ['snapshot', sampleSnapshot],
    ['spec', sampleSpec],
    ['interpretation', sampleInterpretation],
    ['entry', sampleEntry],
    ['correction', sampleCorrection],
  ] as const)('%s', (name, doc) => {
    const r = validate(name, doc);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  test('every view has its own $id and the flower $defs', () => {
    const ids = Object.values(schemas).map((s) => (s as { $id: string }).$id);
    expect(new Set(ids).size).toBe(ids.length);
    expect((schemas.spec as { $ref: string }).$ref).toBe('#/$defs/spec');
  });
});

describe('schemas reject', () => {
  test('a date that is not date-time (formats are on)', () => {
    const s = clone(sampleSnapshot);
    s.snapshot.as_of = 'yesterday';
    expect(validate('snapshot', s).ok).toBe(false);
  });

  test('an amount that is a number, not a decimal string', () => {
    const s = clone(sampleSnapshot) as unknown as { holdings: { amount: unknown }[] };
    (s.holdings[0] as { amount: unknown }).amount = 2000;
    expect(validate('snapshot', s).ok).toBe(false);
  });

  test('an unknown participant kind and an unknown field', () => {
    const a = clone(sampleSnapshot) as unknown as { participants: Record<string, unknown>[] };
    (a.participants[0] as Record<string, unknown>).kind = 'whale';
    expect(validate('snapshot', a).ok).toBe(false);
    const b = clone(sampleSnapshot) as unknown as Record<string, unknown>;
    b.extra = true;
    expect(validate('snapshot', b).ok).toBe(false);
  });

  test('petals outside 5–300 (F6)', () => {
    for (const petals of [4, 301]) {
      const s = clone(sampleSpec);
      s.selection.petals = petals;
      expect(validate('spec', s).ok).toBe(false);
    }
  });

  test('a width band wider than 3', () => {
    const s = clone(sampleSpec);
    s.encodings.width.max_ratio = 3.5;
    expect(validate('spec', s).ok).toBe(false);
  });

  test('a primitive without sources, and order without a meaning (F2)', () => {
    const a = clone(sampleSpec);
    a.encodings.colour.sources = [] as unknown as typeof a.encodings.colour.sources;
    expect(validate('spec', a).ok).toBe(false);
    const b = clone(sampleSpec) as unknown as { encodings: { order: Record<string, unknown> } };
    delete b.encodings.order.meaning;
    expect(validate('spec', b).ok).toBe(false);
  });

  test('an interpretation with no unknowns (constitution II)', () => {
    const i = clone(sampleInterpretation);
    i.unknowns = [] as unknown as typeof i.unknowns;
    expect(validate('interpretation', i).ok).toBe(false);
  });

  test('an entry id that is not 24 hex characters', () => {
    const e = clone(sampleEntry);
    e.id = 'xyz';
    expect(validate('entry', e).ok).toBe(false);
  });
});

// T015: RFC 8785 vectors, SHA-256, spec hashes and entry ids.
import { describe, expect, test } from 'vitest';
import { canonicalJson, entryId, sha256Hex, specHash } from '../src/hash.ts';
import { sampleEntry, sampleSpec } from './samples.ts';

describe('canonicalJson (RFC 8785)', () => {
  // Vectors as plain strings with doubled backslashes: the test transformer rewrites \u escapes
  // inside String.raw templates, which would change the input.
  test('§3.2.2: serialisation of primitive data types', () => {
    const input = JSON.parse(
      '{"numbers": [333333333.33333329, 1E30, 4.50, 2e-3, 0.000000000000000000000000001], ' +
        '"string": "\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/", ' +
        '"literals": [null, true, false]}',
    );
    expect(canonicalJson(input)).toBe(
      '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],' +
        '"string":"\u20ac$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}',
    );
  });

  test('§3.2.3: sorting of object properties by UTF-16 code units', () => {
    const input = JSON.parse(
      '{"\\u20ac": "Euro Sign", "\\r": "Carriage Return", ' +
        '"\\ufb33": "Hebrew Letter Dalet With Dagesh", "1": "One", ' +
        '"\\ud83d\\ude00": "Emoji: Grinning Face", "\\u0080": "Control", ' +
        '"\\u00f6": "Latin Small Letter O With Diaeresis"}',
    );
    expect(canonicalJson(input)).toBe(
      '{"\\r":"Carriage Return","1":"One","\u0080":"Control",' +
        '"\u00f6":"Latin Small Letter O With Diaeresis","\u20ac":"Euro Sign",' +
        '"\ud83d\ude00":"Emoji: Grinning Face","\ufb33":"Hebrew Letter Dalet With Dagesh"}',
    );
  });

  test('refuses values with no JSON form', () => {
    expect(() => canonicalJson(undefined)).toThrow();
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
    expect(() => canonicalJson([Number.POSITIVE_INFINITY])).toThrow();
  });
});

describe('sha256Hex', () => {
  test('NIST vectors, string and bytes', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex(new Uint8Array([0x61, 0x62, 0x63]))).toBe(sha256Hex('abc'));
  });

  test('strings are hashed as UTF-8', () => {
    expect(sha256Hex('€')).toBe(sha256Hex(new Uint8Array([0xe2, 0x82, 0xac])));
  });
});

describe('specHash and entryId', () => {
  // FastData stores values re-serialised with sorted keys and its own whitespace, so readers
  // hash the canonical JSON of the parsed value, never the raw bytes (shared-map.md).
  const resorted = <T>(x: T): T => {
    const sortDeep = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(sortDeep)
        : v && typeof v === 'object'
          ? Object.fromEntries(
              Object.keys(v)
                .sort()
                .reverse()
                .map((k) => [k, sortDeep((v as Record<string, unknown>)[k])]),
            )
          : v;
    return JSON.parse(JSON.stringify(sortDeep(x), null, 3)) as T;
  };

  test('a re-serialised spec keeps its hash', () => {
    const again = resorted(sampleSpec);
    expect(JSON.stringify(again)).not.toBe(JSON.stringify(sampleSpec));
    expect(specHash(again)).toBe(specHash(sampleSpec));
    expect(specHash(sampleSpec)).toBe(sha256Hex(canonicalJson(sampleSpec)));
    expect(specHash(sampleSpec)).toMatch(/^[0-9a-f]{64}$/);
  });

  test('any change to the spec changes its hash', () => {
    const changed = structuredClone(sampleSpec);
    changed.selection.petals = 61;
    expect(specHash(changed)).not.toBe(specHash(sampleSpec));
  });

  test('entryId is 24 hex over the entry without id', () => {
    const { id: _, ...withoutId } = sampleEntry;
    const id = entryId(withoutId);
    expect(id).toMatch(/^[0-9a-f]{24}$/);
    expect(id).toBe(sha256Hex(canonicalJson(withoutId)).slice(0, 24));
    expect(entryId(sampleEntry)).toBe(id);
    expect(entryId(resorted(withoutId))).toBe(id);
  });
});

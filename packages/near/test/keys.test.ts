import { describe, expect, test } from 'vitest';
import { mapKeys } from '../src/map/keys.ts';
import { checkWrite } from '../src/map/limits.ts';

const id = '0123456789abcdef01234567';
const sha = 'ab'.repeat(32);

describe('mapKeys: every key in shared-map.md', () => {
  test('builds each key under petal/v1/', () => {
    expect(mapKeys.spec(id)).toBe(`petal/v1/spec/${id}`);
    expect(mapKeys.snapshot(sha)).toBe(`petal/v1/snapshot/${sha}`);
    expect(mapKeys.index('near:mainnet', 'validators', 222_915_356)).toBe(
      'petal/v1/index/near:mainnet/validators/222915356',
    );
    expect(mapKeys.label('near:mainnet', 'figment.poolv1.near')).toBe(
      'petal/v1/label/near:mainnet/figment.poolv1.near',
    );
    expect(mapKeys.label('eip155:1', '0xabc')).toBe('petal/v1/label/eip155:1/0xabc');
    expect(mapKeys.correction(id, 'fedcba9876543210fedcba98')).toBe(
      `petal/v1/correction/${id}/fedcba9876543210fedcba98`,
    );
    expect(mapKeys.vouch('maker.testnet')).toBe('petal/v1/vouch/maker.testnet');
  });

  test('every key it builds passes the writer checks', () => {
    const keys = [
      mapKeys.spec(id),
      mapKeys.snapshot(sha),
      mapKeys.index('near:mainnet', 'house-of-stake', 0),
      mapKeys.label('near:testnet', 'a.testnet'),
      mapKeys.correction(id, id),
      mapKeys.vouch('writer.petals.testnet'),
    ];
    expect(() => checkWrite(Object.fromEntries(keys.map((k) => [k, 1])))).not.toThrow();
  });

  test('refuses parts that would escape their folder or are not what the key names', () => {
    expect(() => mapKeys.spec('ABC')).toThrow(/entry id/);
    expect(() => mapKeys.spec(`${id}0`)).toThrow();
    expect(() => mapKeys.snapshot('sha256:abc')).toThrow(/sha256/);
    expect(() => mapKeys.index('near', 'validators', 1)).toThrow(/caip2/);
    expect(() => mapKeys.index('near:mainnet', 'a/b', 1)).toThrow(/population/);
    expect(() => mapKeys.index('near:mainnet', 'v', -1)).toThrow(/block/);
    expect(() => mapKeys.index('near:mainnet', 'v', 1.5)).toThrow(/block/);
    expect(() => mapKeys.label('near:mainnet', '../../spec/x')).toThrow(/address/);
    expect(() => mapKeys.label('near:mainnet', 'a b')).toThrow(/address/);
    expect(() => mapKeys.correction(id, 'x')).toThrow(/correction id/);
    expect(() => mapKeys.vouch('Not An Account')).toThrow(/NEAR account/);
    expect(() => mapKeys.vouch('a')).toThrow(/NEAR account/);
  });

  test('refuses a key over 1,024 bytes', () => {
    expect(() => mapKeys.label('near:mainnet', 'x'.repeat(1_000))).toThrow(/1024 bytes/);
  });
});

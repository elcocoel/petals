import { describe, expect, test } from 'vitest';
import { fakeMap } from '../src/map/fake.ts';
import { mapSuite } from './map-suite.ts';

mapSuite('fakeMap', () => {
  const m = fakeMap();
  return {
    writer: m,
    reader: m,
    writerAccount: m.writer,
    receiver: m.receiver,
    other: { writer: m.as('someone.testnet'), account: 'someone.testnet' },
  };
});

describe('fakeMap specifics', () => {
  test('defaults to the testnet accounts in shared-map.md', () => {
    const m = fakeMap();
    expect([m.writer, m.receiver]).toEqual(['writer.petals.testnet', 'petals.testnet']);
  });

  test('records every write, with deterministic fake transaction hashes', async () => {
    const a = fakeMap();
    const b = fakeMap();
    const ta = await a.write({ 'petal/v1/spec/x': { a: 1 } });
    const tb = await b.write({ 'petal/v1/spec/x': { a: 1 } });
    expect(ta).toEqual(tb);
    expect(ta.tx_hash.startsWith('fake')).toBe(true);
    await a.as('maker.testnet').write({ 'petal/v1/spec/y': 1 });
    expect(a.writes().map((w) => [w.writer, w.keys])).toEqual([
      ['writer.petals.testnet', ['petal/v1/spec/x']],
      ['maker.testnet', ['petal/v1/spec/y']],
    ]);
  });

  test('hands values back with sorted keys, like FastData', async () => {
    const m = fakeMap();
    await m.write({ 'petal/v1/spec/x': { b: 1, a: { d: 1, c: 2 } } });
    const row = await m.get('petal/v1/spec/x', m.writer);
    expect(JSON.stringify(row?.value)).toBe('{"a":{"c":2,"d":1},"b":1}');
  });
});

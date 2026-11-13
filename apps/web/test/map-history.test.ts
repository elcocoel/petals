// A map's versions as Layers lists them: newest first, each author named, Petals' import said as unsigned,
// what each added and dropped named by the map's layers, the version it came after by its place, and the proof
// kept only for a signed one.
import { describe, expect, test } from 'vitest';
import { historyOf, layerWords, type MapRecord } from '../lib/map-history.ts';

const h = (c: string) => c.repeat(64);
const record: MapRecord = {
  about: 'near:mainnet:ref-finance.sputnik-dao.near',
  entries: [
    {
      seq: 1,
      hash: h('1'),
      author: 'mapping.petals.near',
      name: "Petals' own mapping",
      signed: false,
      published_at: '2026-11-13T02:47:21.671Z',
      parent: null,
      added: [h('a'), h('b')],
      dropped: [],
      proof: null,
    },
    {
      seq: 2,
      hash: h('2'),
      author: 'near:mainnet:elco.near',
      signed: true,
      published_at: '2026-11-14T10:00:00Z',
      parent: h('1'),
      added: [h('c')],
      dropped: [h('b')],
      proof: { standard: 'nep413', signature: 'sig', message: 'text', public_key: 'ed25519:k' },
    },
  ],
};
const titles = new Map([[h('a'), 'ref-finance at block 224,086,972']]);

describe("a map's versions", () => {
  const rows = historyOf(record, titles);
  test('newest first, by their place in the record', () => {
    expect(rows.map((r) => r.seq)).toEqual([2, 1]);
  });
  test('who published each and when; the import plainly unsigned, with no proof', () => {
    expect(rows[0]?.by).toBe('elco.near');
    expect(rows[0]?.day).toBe('14 Nov 2026');
    expect(rows[1]).toMatchObject({ by: "Petals' own mapping", signed: false, proof: null });
  });
  test('what each added and dropped, a layer of this map by its title', () => {
    expect(rows[1]?.added.map(layerWords)).toEqual([
      'ref-finance at block 224,086,972',
      'bbbbbbbb…bbbbbb',
    ]);
    expect(rows[0]?.dropped.map(layerWords)).toEqual(['bbbbbbbb…bbbbbb']);
  });
  test('the version it came after, by its place; the first came after none', () => {
    expect(rows[0]?.after).toEqual({ hash: h('1'), seq: 1 });
    expect(rows[1]?.after).toBeNull();
  });
  test('a signed version keeps its proof: standard, signed text, key and signature', () => {
    expect(rows[0]?.proof).toMatchObject({
      standard: 'nep413',
      message: 'text',
      public_key: 'ed25519:k',
      signature: 'sig',
    });
  });
});

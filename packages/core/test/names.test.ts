// Annotations become data (annotation-layer.md step 5): composing a reading with the person's annotations gives
// each claimed participant one name, and how it's known, as two categories the look can draw. A reading of a
// DAO on Gnosis, as RaidGuild's is; every address and name here is invented.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { makeClaim } from '../src/claims/index.ts';
import { canonicalJson, sha256Hex } from '../src/hash.ts';
import { createAjv, schemaId } from '../src/schema/ajv.ts';
import { namePieces, seamOf } from '../src/seam.ts';
import type { Claim, ClaimDraft, Snapshot } from '../src/types/index.ts';

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'schema', 'fixtures', 'snapshot.v1.json'), 'utf8'),
) as Snapshot;
const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';
const C = '0x3333333333333333333333333333333333333333';
/** The fixture's reading, moved to a DAO on Gnosis with three members. */
const reading: Snapshot = {
  ...fixture,
  network: { ...fixture.network, chain: 'eip155:100', params: { dao: `0x${'f0'.repeat(20)}` } },
  participants: [A, B, C].map((id, i) => ({
    ...fixture.participants[0],
    id,
    rank: i + 1,
  })) as Snapshot['participants'],
  holdings: [A, B, C].map((participant) => ({
    ...fixture.holdings[0],
    participant,
  })) as Snapshot['holdings'],
};
const BY = 'near:mainnet:reed.example.near';
const named = (subject: string, value: string, o: Partial<ClaimDraft> = {}): Claim =>
  makeClaim(
    {
      subject: `eip155:100:${subject}`,
      verb: 'named',
      object: { value },
      issued_at: '2026-11-10T12:00:00Z',
      kind: 'sourced',
      evidence: [{ url: 'https://example.org/proposal/7' }],
      by: BY,
      ...o,
    },
    'claim/v2',
  );

describe('names from annotations', () => {
  test('each claimed participant gets one name and how it is known; the others none', () => {
    const claims = [
      named(A, 'Ada'),
      named(A, 'Ada B.', { kind: 'stated', evidence: [] }),
      named(B, 'Guild Treasury', {
        kind: 'inferred',
        method: 'codex/research@2026-11-10',
        qualifiers: { grounds: 'research' },
      }),
      // not in this reading: another address, the same address on another chain, and a note, not a name
      named('0x4444444444444444444444444444444444444444', 'Nobody'),
      makeClaim({ ...named(C, 'x'), subject: `eip155:1:${C}` } as never, 'claim/v2'),
    ];
    const pieces = namePieces(reading, claims);
    expect(pieces.map((p) => [p.name, p.kind, p.standing])).toEqual([
      ['name', 'category', 'lead'],
      ['name_kind', 'category', 'lead'],
    ]);
    const values = (i: number) =>
      'values' in (pieces[i] ?? {}) ? (pieces[i] as { values: unknown }).values : [];
    // the person's own word comes before a source's, whatever the order
    expect(values(0)).toEqual([
      { participant: A, value: 'Ada B.' },
      { participant: B, value: 'Guild Treasury' },
    ]);
    expect(values(1)).toEqual([
      { participant: A, value: 'stated' },
      { participant: B, value: 'inferred' },
    ]);
    // named by the claims it chose
    const chosen = [claims[1] as Claim, claims[2] as Claim].map((c) => c.id).sort();
    expect(pieces[0]?.layer).toBe(sha256Hex(canonicalJson(chosen)));
    expect(namePieces(reading, [...claims].reverse())).toEqual(pieces);
  });

  test('a name its author retracted, or that nobody claimed, gives no piece', () => {
    const ada = named(A, 'Ada');
    const retracted = makeClaim({
      subject: BY,
      verb: 'retracts',
      object: `claim:${ada.id}`,
      issued_at: '2026-11-10T13:00:00Z',
      kind: 'declared',
      evidence: [],
      by: BY,
    });
    expect(namePieces(reading, [ada, retracted])).toEqual([]);
    expect(namePieces(reading, [])).toEqual([]);
  });

  test("composing RaidGuild's reading with its annotations gives a name for each claimed address", () => {
    const seam = seamOf(reading, 'a'.repeat(64), [], [named(A, 'Ada'), named(B, 'Bea')]);
    const name = seam.data.find((p) => p.name === 'name') as { values: { participant: string }[] };
    expect(name.values.map((v) => v.participant)).toEqual([A, B]);
    const valid = createAjv().getSchema(schemaId('seam'));
    expect(valid?.(seam), JSON.stringify(valid?.errors)).toBe(true);
    // without annotations, the seam is as before
    expect(seamOf(reading, 'a'.repeat(64), []).data.some((p) => p.name === 'name')).toBe(false);
  });
});

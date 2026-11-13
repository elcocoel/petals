// claim/v3 (11 Nov: the data layer has room for discovered, inferred and open-source-gathered claims and their
// evidence): every piece of evidence says what it is, who found it and when, and the open web's keeps its
// platform, its words, its content hash and an archived copy. Every account, name and URL is invented.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { applyPolicy, makeClaim, validateClaim } from '../src/claims/index.ts';
import { namePieces } from '../src/seam.ts';
import type { Claim, ClaimDraft, ClaimEvidence, Snapshot } from '../src/types/index.ts';

const SNAP = 'a'.repeat(64);
const TX = `eip155:100:0x${'cd'.repeat(32)}`;
const ADA = 'eip155:100:0x1111111111111111111111111111111111111111';
const WHEN = '2026-11-11T12:00:00Z';
const READER = 'tool:petal/observed-claims@1';
const CODEX = 'tool:codex@2026-11-10';
const PERSON = 'near:mainnet:reed.example.near';
const v3 = (d: ClaimDraft) => makeClaim(d, 'claim/v3');
const ok = (c: unknown, scope = {}) => validateClaim(c, scope);
const rules = (r: ReturnType<typeof validateClaim>) => (r.ok ? [] : r.errors.map((e) => e.rule));
const piece = (o: Partial<ClaimEvidence>): ClaimEvidence => ({
  found_by: CODEX,
  found_at: WHEN,
  ...o,
});

describe('claim/v3: the four ways something is known, with what it rests on', () => {
  test('discovered on the chain: the reading, the transaction, the block, and the read that found it', () => {
    const c = v3({
      subject: ADA,
      verb: 'holds',
      object: 'asset:eip155:100:0x2222222222222222222222222222222222222222',
      qualifiers: { amount: '1200', measure: 'shares' },
      issued_at: WHEN,
      as_of: { chain: 'eip155:100', block: 49214588 },
      kind: 'observed',
      evidence: [
        { type: 'snapshot', snapshot_sha256: SNAP, found_by: READER, found_at: WHEN },
        { type: 'tx', tx: TX, found_by: READER, found_at: WHEN },
      ],
      by: READER,
    });
    expect(ok(c)).toEqual({ ok: true, value: c });
  });

  test('inferred: its method, its inputs as evidence, who inferred it, and a confidence anyone can give', () => {
    const inferred = v3({
      subject: ADA,
      verb: 'moves_with',
      object: 'eip155:100:0x3333333333333333333333333333333333333333',
      qualifiers: { grounds: 'synchronised_behaviour' },
      issued_at: WHEN,
      kind: 'inferred',
      method: 'moves-with@2#abcdef12',
      evidence: [
        piece({ type: 'snapshot', snapshot_sha256: SNAP }),
        piece({ type: 'claim', claim_id: 'b'.repeat(64) }),
      ],
      by: 'model:example/analyst@1',
    });
    expect(ok(inferred).ok).toBe(true);
    const sure = v3({
      subject: PERSON,
      verb: 'confidence',
      object: `claim:${inferred.id}`,
      qualifiers: { band: 'medium' },
      issued_at: WHEN,
      kind: 'declared',
      evidence: [],
      by: PERSON,
      proof: {
        type: 'nep413',
        account_id: 'reed.example.near',
        public_key: 'ed25519:11111111111111111111111111111111',
        signature: 'AAAA',
        message: '{}',
        nonce: 'AAAA',
        recipient: 'petals.testnet',
      },
    });
    expect(ok(sure).ok).toBe(true);
    const row = applyPolicy([inferred, sure], {
      trusted: [PERSON, 'model:example/analyst@1'],
    }).find((r) => r.claim.id === inferred.id);
    expect(row?.confidence).toEqual({ band: 'medium', raters: 1 });
  });

  test('gathered from the open web: the URL, the platform, the words, when, a content hash and an archived copy', () => {
    const fixture = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'schema', 'fixtures', 'claim.v3.json'), 'utf8'),
    ) as Claim;
    expect(ok(fixture, { private: true })).toEqual({ ok: true, value: fixture });
    expect(fixture.evidence.map((e) => [e.type, e.found_by])).toEqual([
      ['post', CODEX],
      ['tx', READER],
    ]);
    expect(fixture.evidence[0]).toMatchObject({
      platform: 'x',
      archive_url: expect.stringMatching(/^https:\/\/web\.archive\.org\//),
      url_sha256: 'e'.repeat(64),
      retrieved_at: expect.any(String),
    });
  });

  test("a person's or an agent's own word: stated, with no evidence", () => {
    const own = v3({
      subject: ADA,
      verb: 'named',
      object: { value: 'Ada' },
      issued_at: WHEN,
      kind: 'stated',
      evidence: [],
      by: PERSON,
    });
    expect(ok(own, { private: true }).ok).toBe(true);
  });
});

describe('each piece of evidence says what it is, holds it, and who found it when', () => {
  const sourced = (e: unknown[]) =>
    v3({
      subject: ADA,
      verb: 'noted',
      object: { value: 'Signs for the treasury.' },
      issued_at: WHEN,
      kind: 'sourced',
      evidence: e as ClaimEvidence[],
      by: PERSON,
    });
  test('a type that holds nothing of its kind, a page that is not a URL, a finder that is a person, a bad archive', () => {
    const url = 'https://example.org/signers';
    expect(rules(ok(sourced([piece({ type: 'post', url }), piece({ type: 'tx', url })])))).toEqual([
      'evidence',
    ]);
    expect(rules(ok(sourced([piece({ type: 'page', url: 'ftp://example.org' })])))).toContain(
      'evidence',
    );
    expect(rules(ok(sourced([piece({ type: 'page', url, found_by: 'person:ada' })])))).toContain(
      'no_natural_person',
    );
    expect(
      rules(ok(sourced([piece({ type: 'page', url, archive_url: 'archive.org/x' })]))),
    ).toEqual(['evidence']);
  });
  test('in v3 every piece is typed, with who found it and when; v2 had none of these', () => {
    const untyped = rules(ok(sourced([{ url: 'https://example.org' }])));
    expect(untyped.length).toBeGreaterThan(0);
    expect(untyped.every((r) => r === 'schema')).toBe(true);
    const {
      id: _id,
      petal: _p,
      ...draft
    } = sourced([piece({ type: 'page', url: 'https://example.org' })]);
    const older = rules(ok(makeClaim(draft, 'claim/v2')));
    expect(older.length).toBeGreaterThan(0);
    expect(older.every((r) => r === 'schema')).toBe(true);
  });
});

describe('claims about claims: a correction, Tae → Sasquatch', () => {
  const reading = {
    network: { id: 'raid', chain: 'eip155:100', population: 'members', title: 'A DAO' },
    participants: [{ id: '0x68f2000000000000000000000000000000008379' }],
  } as unknown as Snapshot;
  const at = (subject: string, value: string, issued_at: string) =>
    v3({
      subject,
      verb: 'named',
      object: { value },
      issued_at,
      kind: 'sourced',
      evidence: [piece({ type: 'proposal', proposal: 'proposal:eip155:100:0xf0:168' })],
      by: CODEX,
    });
  test('its author replaces its own: the old stays readable, the new one is the name', () => {
    const tae = at('eip155:100:0x68f2000000000000000000000000000000008379', 'Tae', WHEN);
    const sasquatch = at(
      'eip155:100:0x68f2000000000000000000000000000000008379',
      'Sasquatch',
      '2026-11-11T13:00:00Z',
    );
    const replaces = v3({
      subject: CODEX,
      verb: 'supersedes',
      object: `claim:${tae.id}`,
      issued_at: '2026-11-11T13:00:00Z',
      kind: 'declared',
      evidence: [piece({ type: 'claim', claim_id: sasquatch.id })],
      by: CODEX,
    });
    const name = namePieces(reading, [tae, sasquatch, replaces])[0] as {
      values: { value: string }[];
    };
    expect(name.values.map((v) => v.value)).toEqual(['Sasquatch']);
  });
});

describe("a published name, as the system's own records declare it (people.ts, 12 Nov)", () => {
  const named = (evidence: ClaimEvidence[]) =>
    v3({
      subject: ADA,
      verb: 'named',
      object: { value: 'Dekan' },
      issued_at: WHEN,
      kind: 'sourced',
      evidence,
      by: PERSON,
    });
  const found = { found_by: CODEX, found_at: WHEN };
  const proposal = {
    type: 'proposal' as const,
    proposal: 'proposal:eip155:100:0xf02fd4286917270cb94fbc13a0f4e1ed76f7e986:167',
    url: 'https://gnosisscan.io/tx/0x75dc',
    quote: 'Elect Dekan as Keeper of the Handbook (Q1, 2026)',
    ...found,
  };

  test('a proposal or a transaction it rests on, quoted: it publishes, the record in its own words', () => {
    expect(ok(named([proposal])).ok).toBe(true);
    expect(
      ok(
        named([
          {
            type: 'tx',
            tx: 'eip155:100:0x75dc363d5cb9f27d79eb5dca9ade9da7d00f48fb4f9ad5946abdb1362077d803',
            url: 'https://gnosisscan.io/tx/0x75dc',
            quote: 'Pay Dekan',
            ...found,
          },
        ]),
      ).ok,
    ).toBe(true);
  });

  test("a name a page says, or a record not quoted, stays in a person's own project; a note still names no one", () => {
    const page = named([
      { type: 'page', url: 'https://example.org/', quote: 'Dekan Smith', ...found },
    ]);
    expect(ok(page).ok).toBe(false);
    expect(ok(page, { private: true }).ok).toBe(true);
    const { quote: _q, ...unquoted } = proposal;
    expect(ok(named([unquoted])).ok).toBe(false);
    expect(ok(named([{ ...proposal, note: 'Also Jane Doe in #245' }])).ok).toBe(false);
  });
});

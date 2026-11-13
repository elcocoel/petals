// Many authors, one map (specs/005-mapping-brain/composition.md; Elco, 13 Nov: "how do different data layers from
// different people contribute to fuller and fuller maps ... results should be deterministic"). Two real authors on
// RaidGuild: Petals' own mapping (its readings, imported unsigned) and Elco's 35 names (signed with NEP-413 on 12
// Nov). Then a third account, to show a match at the same block, a difference, and credit that copying can't take.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import {
  casesOf,
  compose,
  type Entry,
  type Publication,
  publicationHash,
  signedText,
  textNames,
  unsignedHash,
} from '../src/compose/compose.ts';
import { creditOf } from '../src/compose/credit.ts';
import { decimal, factsOf, slotOf } from '../src/compose/facts.ts';
import { canonicalJson, sha256Hex } from '../src/hash.ts';

const ABOUT = 'eip155:100:0x372fc5a6b0b12ae174f09f6fc849a83de6b503b6';
const SHARES = '76b8351aed33f85c7ecd9ffa4347f0d2ec3d300a3f3ec2c7716c8a19f983e21d';
const REPLACED = '9eedf3bb9cd45c62b4b8b61d2bc0dc101a05590ee698545aca75d7416d0cf2e0';
const TOKEN = 'c0dbc77a9b2821a140dc603f3c829f97ffc23867b0811b123f3e439b47d63a6f';
const ELCO = 'near:mainnet:petals.near';
const OTHER = 'near:mainnet:other.near';
const FOURTH = 'eip155:1:0x00000000000000000000000000000000000000aa';

const root = join(import.meta.dirname, '..', '..', '..');
const snapshot = (sha: string) =>
  JSON.parse(
    gunzipSync(readFileSync(join(root, 'fixtures', 'snapshots', `${sha}.json.gz`))).toString(
      'utf8',
    ),
  );
const names = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures', 'raidguild-names.json'), 'utf8'),
) as Record<string, unknown>[];
const elcoPress = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '..', 'schema', 'fixtures', 'publication.v1.json'),
    'utf8',
  ),
) as Publication;

const docs = new Map<string, unknown>([
  [SHARES, snapshot(SHARES)],
  [REPLACED, snapshot(REPLACED)],
  [TOKEN, snapshot(TOKEN)],
  ...names.map((c) => [sha256Hex(canonicalJson(c)), c] as [string, unknown]),
]);

const publication = (
  author: string,
  layers: string[],
  extra: Partial<Publication> = {},
): Publication => ({
  petal: 'publication/v1',
  about: ABOUT,
  author,
  via: null,
  layers: layers.map((sha256) => ({
    sha256,
    petal: String((docs.get(sha256) as { petal: string }).petal),
  })),
  parent: null,
  previous: null,
  published_at: '2026-11-13T01:00:00.000Z',
  proof: null,
  ...extra,
});
let seq = 0;
const entry = (p: Publication): Entry => ({
  seq: ++seq,
  appended_at: `2026-11-13T01:00:0${seq}.000Z`,
  hash: publicationHash(p),
  publication: p,
});
/** Petals' own mapping (the import, unsigned), then Elco's press as signed on 12 Nov. */
const base = () => {
  seq = 0;
  return [entry(publication('mapping.petals.near', [SHARES, TOKEN])), entry(elcoPress)];
};

describe('facts: what a layer says, whatever else differs between two documents', () => {
  test('the replaced reading and its replacement state the same facts at the same block', () => {
    const key = (sha: string) =>
      factsOf(docs.get(sha))
        .map((f) => `${slotOf(f)}=${f.value}`)
        .sort();
    expect(key(REPLACED)).toEqual(key(SHARES));
    expect(sha256Hex(canonicalJson(docs.get(REPLACED)))).not.toBe(SHARES);
    const [f] = factsOf(docs.get(SHARES));
    expect(f?.state).toEqual({ chain: 'eip155:100', block: 49226727 });
    expect(f?.subject.startsWith('eip155:100:0x')).toBe(true);
  });

  test('a name is a fact about its account; decimals have one spelling', () => {
    const [f] = factsOf(names[0]);
    expect(f?.what).toBe('claim/named');
    expect(f?.subject).toBe((names[0] as { subject: string }).subject);
    expect(['100.0', '0100', '100'].map(decimal)).toEqual(['100', '100', '100']);
    expect(decimal('0.50')).toBe('0.5');
  });
});

describe('compose: two real authors on RaidGuild', () => {
  test("Petals' readings and Elco's names, each credited to its own author, nothing differing", () => {
    const map = compose(ABOUT, base(), docs);
    expect(map.authors.map((a) => [a.author, a.imported])).toEqual([
      ['mapping.petals.near', true],
      [ELCO, false],
    ]);
    expect(map.layers).toHaveLength(37);
    expect(map.differs).toBe(0);
    const named = map.slots.filter((s) => s.what === 'claim/named');
    // 35 names on 33 accounts: an account can carry two names, side by side, never "differs"
    expect(named.reduce((n, s) => n + s.values.length, 0)).toBe(35);
    expect(new Set(named.map((s) => s.subject)).size).toBe(named.length);
    expect(named.every((s) => s.values.every((v) => v.by.every((b) => b.author === ELCO)))).toBe(
      true,
    );
    const shares = map.slots.filter((s) => s.what === 'snapshot/shares shares');
    expect(shares.length).toBeGreaterThan(100);
    expect(shares.every((s) => s.values[0]?.by[0]?.author === 'mapping.petals.near')).toBe(true);
  });

  test('the same data at the same block from another author is a match, credited to both', () => {
    const record = base();
    const before = compose(ABOUT, record, docs);
    const cases = casesOf(before, docs.get(REPLACED), OTHER);
    expect(cases.match.count).toBe(factsOf(docs.get(REPLACED)).length);
    expect(cases.match.authors).toEqual(['mapping.petals.near']);
    expect(cases.differs.count + cases.new_data.whats.length + cases.new_subjects.count).toBe(0);
    record.push(entry(publication(OTHER, [REPLACED])));
    const after = compose(ABOUT, record, docs);
    const slot = after.slots.find((s) => s.what === 'snapshot/shares shares');
    expect(slot?.values).toHaveLength(1);
    expect(slot?.values[0]?.by.map((b) => b.author)).toEqual(['mapping.petals.near', OTHER]);
    expect(after.differs).toBe(0);
  });

  test('a different value in the same slot differs: both stand, the first published comes first', () => {
    const record = base();
    const doctored = structuredClone(docs.get(SHARES)) as { holdings: { amount: string }[] };
    (doctored.holdings[0] as { amount: string }).amount = '99999';
    const sha = sha256Hex(canonicalJson(doctored));
    const withDoc = new Map(docs).set(sha, doctored);
    const cases = casesOf(compose(ABOUT, record, withDoc), doctored, OTHER);
    expect(cases.differs.count).toBe(1);
    expect(cases.differs.authors).toEqual(['mapping.petals.near']);
    record.push(entry(publication(OTHER, [], { layers: [{ sha256: sha, petal: 'snapshot/v1' }] })));
    const after = compose(ABOUT, record, withDoc);
    expect(after.differs).toBe(1);
    const slot = after.slots.find((s) => s.differs);
    expect(slot?.values.map((v) => v.by[0]?.author)).toEqual(['mapping.petals.near', OTHER]);
    expect(slot?.values[1]?.value).toBe('99999');
  });

  test("where values differ, the qualifier's verdict comes before the record's order", () => {
    const record = base();
    const doctored = structuredClone(docs.get(SHARES)) as { holdings: { amount: string }[] };
    (doctored.holdings[0] as { amount: string }).amount = '99999';
    const sha = sha256Hex(canonicalJson(doctored));
    const withDoc = new Map(docs).set(sha, doctored);
    const later = entry(
      publication(OTHER, [], { layers: [{ sha256: sha, petal: 'snapshot/v1' }] }),
    );
    record.push({ ...later, scores: { [sha]: 0.9 } });
    const slot = compose(ABOUT, record, withDoc).slots.find((s) => s.differs);
    expect(slot?.values.map((v) => v.value)[0]).toBe('99999');
    expect(slot?.values).toHaveLength(2);
  });

  test('new data and new subjects, by the four cases', () => {
    seq = 0;
    const onlyShares = compose(ABOUT, [entry(publication('mapping.petals.near', [SHARES]))], docs);
    expect(casesOf(onlyShares, docs.get(TOKEN), OTHER).new_data.whats).toEqual([
      'snapshot/token_balance RG',
    ]);
    const fewer = structuredClone(docs.get(SHARES)) as {
      holdings: unknown[];
      relationships: unknown[];
    };
    const all = docs.get(SHARES) as { holdings: unknown[] };
    fewer.holdings = all.holdings.slice(0, 10);
    fewer.relationships = [];
    const sha = sha256Hex(canonicalJson(fewer));
    seq = 0;
    const small = compose(
      ABOUT,
      [
        entry(
          publication('mapping.petals.near', [], {
            layers: [{ sha256: sha, petal: 'snapshot/v1' }],
          }),
        ),
      ],
      new Map(docs).set(sha, fewer),
    );
    const c = casesOf(small, all, OTHER);
    const first = new Set((fewer.holdings as { measure: string }[]).map((h) => h.measure));
    const sameWhat = (all.holdings as { measure: string }[]).filter((h) =>
      first.has(h.measure),
    ).length;
    expect(c.new_subjects.count).toBe(sameWhat - 10);
    expect(c.new_data.whats.length).toBeGreaterThan(0);
    expect(c.match.count).toBe(10);
  });

  test('withdrawing is a new version without the layer; the record keeps the earlier one', () => {
    const record = base();
    record.push(
      entry(publication('mapping.petals.near', [TOKEN], { previous: record[0]?.hash ?? null })),
    );
    const map = compose(ABOUT, record, docs);
    expect(map.slots.some((s) => s.what === 'snapshot/shares shares')).toBe(false);
    expect(map.composed_from).toHaveLength(2);
  });

  test('deterministic: the record in any order composes to the same bytes', () => {
    const record = base();
    record.push(entry(publication(OTHER, [REPLACED])));
    const a = canonicalJson(compose(ABOUT, record, docs));
    const b = canonicalJson(compose(ABOUT, [...record].reverse(), docs));
    expect(sha256Hex(a)).toBe(sha256Hex(b));
  });
});

describe('credit and points (points/v1): who used whose layer, and copying earns nothing', () => {
  test("Elco's names: 35 layers, every fact stated first, no points yet (no one has built on them)", () => {
    const credit = creditOf(ELCO, base(), docs);
    expect(credit.totals).toEqual({ layers: 35, first: 35, confirmed: 0, built_on: 0 });
  });

  test('a reuse gives a point only to those who published the layer before it; a later copy only matches', () => {
    const record = base();
    record.push(entry(publication(OTHER, [SHARES]))); // seq 3: reuses Petals' reading
    record.push(entry(publication(FOURTH, [SHARES]))); // seq 4: uses it again
    const petals = creditOf('mapping.petals.near', record, docs);
    const shares = petals.layers.find((l) => l.sha256 === SHARES);
    expect(shares?.reused_by).toEqual([FOURTH, OTHER].sort());
    expect(shares?.built_on).toBe(2);
    const other = creditOf(OTHER, record, docs).layers.find((l) => l.sha256 === SHARES);
    // OTHER copied it: matched, not first; and it earns from FOURTH's later use only, never from Petals' earlier one
    expect(other?.first).toBe(0);
    expect(other?.confirmed).toBeGreaterThan(0);
    expect(other?.reused_by).toEqual([FOURTH]);
    expect(other?.built_on).toBe(1);
  });

  test('building on a layer through from, the whole chain back, counts once per account; own use never', () => {
    const record = base();
    const derived = {
      petal: 'layer/v1',
      about: ABOUT,
      kind: 'measures',
      measures: [{ name: 'share_of_shares', unit: 'share', kind: 'share' }],
      rows: [
        {
          participant: '0x04db1bb49b7ffbcec574f34d29c3153953890352',
          measure: 'share_of_shares',
          value: '0.01',
        },
      ],
      how: { method: 'a share of the shares', sources: [{ url: `petal:${SHARES}` }] },
      from: [SHARES],
      when: { as_of: '2026-11-11T15:57:00Z', block_height: 49226727 },
      standing: 'verified',
    };
    const onTop = {
      ...derived,
      measures: [{ name: 'rank', unit: 'rank', kind: 'count' }],
      rows: [
        { participant: '0x04db1bb49b7ffbcec574f34d29c3153953890352', measure: 'rank', value: '1' },
      ],
      from: [sha256Hex(canonicalJson(derived))],
    };
    const d1 = sha256Hex(canonicalJson(derived));
    const d2 = sha256Hex(canonicalJson(onTop));
    const withDocs = new Map(docs).set(d1, derived).set(d2, onTop);
    record.push(
      entry(
        publication('mapping.petals.near', [], { layers: [{ sha256: d1, petal: 'layer/v1' }] }),
      ),
    );
    record.push(entry(publication(FOURTH, [], { layers: [{ sha256: d2, petal: 'layer/v1' }] })));
    const shares = creditOf('mapping.petals.near', record, withDocs).layers.find(
      (l) => l.sha256 === SHARES,
    );
    // FOURTH built on d1, which was built on the reading: the reading's author earns it, once; its own d1 doesn't count
    expect(shares?.built_on_by).toEqual([FOURTH]);
    expect(shares?.built_on).toBe(1);
  });
});

describe('what the wallet signs', () => {
  test('one readable line, then the hash of the publication without its proof', () => {
    const p = publication(OTHER, [REPLACED]);
    const text = signedText(p, 'RaidGuild');
    expect(text).toBe(
      `Petals: publish 1 layer about RaidGuild in your name.\nPublication ${unsignedHash(p)}`,
    );
    expect(
      textNames(text, { ...p, proof: { standard: 'nep413', signature: 'x', message: text } }),
    ).toBe(true);
    expect(textNames(text, { ...p, layers: [] })).toBe(false);
  });

  test("Elco's press of 12 Nov keeps its own proof, whose message names what it signed", () => {
    expect(elcoPress.proof?.standard).toBe('nep413');
    expect(JSON.parse(elcoPress.proof?.message ?? '{}')).toMatchObject({
      petal: 'publish-data/v1',
      about: ABOUT,
      claims: 35,
    });
  });
});

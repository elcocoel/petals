// One press, many publications (specs/005-mapping-brain/composition.md, section 2b): one signature over a manifest
// that lists each publication's unsigned hash, each publication's proof naming the manifest, and the three-step
// check anyone runs. And Petals' own base data signed by petals.near over the import: from that version on, the
// import's label and petals.near are one author on that map, so nothing it held is lost and it confirms nothing
// of its own.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import {
  asAuthored,
  compose,
  type Entry,
  IMPORTED_AUTHOR,
  type Manifest,
  manifestHash,
  manifestText,
  PETALS_AUTHOR,
  type Publication,
  pressedWith,
  publicationHash,
  textNamesManifest,
  unsignedHash,
  validateManifest,
  validatePublication,
} from '../src/compose/compose.ts';
import { creditOf } from '../src/compose/credit.ts';
import { canonicalJson, sha256Hex } from '../src/hash.ts';

const ABOUT = 'eip155:100:0x372fc5a6b0b12ae174f09f6fc849a83de6b503b6';
const OTHER_MAP =
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN';
const SHARES = '76b8351aed33f85c7ecd9ffa4347f0d2ec3d300a3f3ec2c7716c8a19f983e21d';
const TOKEN = 'c0dbc77a9b2821a140dc603f3c829f97ffc23867b0811b123f3e439b47d63a6f';
const OTHER = 'near:mainnet:other.near';

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
const namesPress = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '..', 'schema', 'fixtures', 'publication.v1.json'),
    'utf8',
  ),
) as Publication;
const docs = new Map<string, unknown>([
  [SHARES, snapshot(SHARES)],
  [TOKEN, snapshot(TOKEN)],
  ...names.map((c) => [sha256Hex(canonicalJson(c)), c] as [string, unknown]),
]);
const petalOf = (sha: string) => String((docs.get(sha) as { petal: string }).petal);

const unsigned = (
  author: string,
  about: string,
  layers: string[],
  extra: Partial<Publication> = {},
): Omit<Publication, 'proof'> => ({
  petal: 'publication/v1',
  about,
  author,
  via: null,
  layers: layers.map((sha256) => ({ sha256, petal: petalOf(sha256) })),
  parent: null,
  previous: null,
  published_at: '2026-11-14T01:00:00.000Z',
  ...extra,
});
let seq = 0;
const entry = (p: Publication): Entry => ({
  seq: ++seq,
  appended_at: `2026-11-14T01:00:0${seq}.000Z`,
  hash: publicationHash(p),
  publication: p,
});

/** One press: the manifest over the publications, its text, and each publication with the one signature. */
function press(author: string, versions: Omit<Publication, 'proof'>[]) {
  const manifest: Manifest = {
    petal: 'manifest/v1',
    author,
    publications: versions.map((v) => unsignedHash(v)),
    published_at: '2026-11-14T01:00:00.000Z',
  };
  const text = manifestText(manifest);
  const signed = versions.map(
    (v): Publication => ({
      ...v,
      proof: {
        standard: 'nep413',
        signature: 'c2lnbmVkIG9uY2U=',
        message: text,
        public_key: 'ed25519:4nbmMRwLsWCuHTykAvaHvHbZ1KBuCyCEhajuQF8VtEGL',
        nonce: 'bm9uY2Ugb2YgdGhpcyBwcmVzcyAzMiBieXRlcyBsb25nIQ==',
        recipient: 'petals.example',
        manifest: manifestHash(manifest),
      },
    }),
  );
  return { manifest, text, signed };
}

describe('manifest/v1: one signature over many publications', () => {
  const a = unsigned(OTHER, ABOUT, [SHARES]);
  const b = unsigned(OTHER, OTHER_MAP, [TOKEN]);
  const { manifest, text, signed } = press(OTHER, [a, b]);

  test('the text says how many versions and names the manifest by its hash', () => {
    expect(text).toBe(
      `Petals: publish 2 versions in your name.\nManifest ${manifestHash(manifest)}`,
    );
    expect(textNamesManifest(text, manifest)).toBe(true);
    expect(validateManifest(manifest).ok).toBe(true);
    expect(validateManifest({ ...manifest, extra: 1 }).ok).toBe(false);
    expect(validateManifest({ ...manifest, publications: [] }).ok).toBe(false);
  });

  test('each publication is an ordinary publication/v1 whose proof names the manifest', () => {
    for (const p of signed) {
      expect(validatePublication(p).ok).toBe(true);
      expect(pressedWith(p, manifest)).toEqual({ ok: true });
    }
    // its unsigned hash is the one the manifest lists, so the proof covers every field
    expect(signed.map((p) => unsignedHash(p))).toEqual(manifest.publications);
  });

  test('the three steps refuse what the press did not sign', () => {
    const [p] = signed as [Publication];
    const other: Manifest = { ...manifest, publications: [unsignedHash(b)] };
    expect(pressedWith(p, other)).toEqual({
      ok: false,
      reason: "the manifest isn't the one its proof names",
    });
    expect(pressedWith({ ...p, author: PETALS_AUTHOR }, manifest)).toMatchObject({ ok: false });
    const changed = { ...p, layers: [{ sha256: TOKEN, petal: petalOf(TOKEN) }] };
    expect(pressedWith(changed, manifest)).toEqual({
      ok: false,
      reason: "the manifest doesn't list it",
    });
    const retexted = {
      ...p,
      proof: {
        ...(p.proof as NonNullable<Publication['proof']>),
        message: `Petals: publish 2 versions in your name.\nManifest ${'0'.repeat(64)}`,
      },
    };
    expect(pressedWith(retexted, manifest)).toEqual({
      ok: false,
      reason: 'the signed text names another manifest',
    });
    expect(pressedWith(namesPress, manifest)).toEqual({
      ok: false,
      reason: 'it was signed alone, with no manifest',
    });
  });

  test('composing and credit read each publication as one signed alone, by its own place in the record', () => {
    seq = 0;
    const record = signed.map(entry);
    const map = compose(ABOUT, record, docs);
    expect(map.authors.map((x) => [x.author, x.imported])).toEqual([[OTHER, false]]);
    const credit = creditOf(OTHER, record, docs);
    expect(credit.layers.map((l) => [l.map, l.seq])).toEqual([
      [ABOUT, 1],
      [OTHER_MAP, 2],
    ]);
  });
});

describe("Petals' base data, signed by petals.near over the import", () => {
  const importOf = (about: string, layers: string[]) =>
    ({ ...unsigned(IMPORTED_AUTHOR, about, layers), proof: null }) as Publication;

  test('before petals.near signs over it, the import and the names are two authors, as appended', () => {
    seq = 0;
    const record = [entry(importOf(ABOUT, [SHARES, TOKEN])), entry(namesPress)];
    expect(asAuthored(record)).toEqual(record);
    expect(compose(ABOUT, record, docs).authors.map((x) => x.author)).toEqual([
      IMPORTED_AUTHOR,
      PETALS_AUTHOR,
    ]);
  });

  test('the signed version follows the import: one author, Petals, with every fact and nothing confirmed of its own', () => {
    seq = 0;
    const imported = entry(importOf(ABOUT, [SHARES, TOKEN]));
    const earlier = entry(namesPress);
    const layers = [SHARES, TOKEN, ...namesPress.layers.map((l) => l.sha256)];
    const { signed } = press(PETALS_AUTHOR, [
      unsigned(PETALS_AUTHOR, ABOUT, layers, { parent: imported.hash, previous: earlier.hash }),
    ]);
    const record = [imported, earlier, entry(signed[0] as Publication)];
    const map = compose(ABOUT, record, docs);
    expect(map.authors).toEqual([
      { author: PETALS_AUTHOR, first_seq: 1, latest: record[2]?.hash, imported: false },
    ]);
    // what the import brought first stays the import's place in the record, now Petals' own
    const shares = map.slots.filter((s) => s.what.startsWith('snapshot/'));
    expect(shares.length).toBeGreaterThan(0);
    expect(
      shares.every(
        (s) => s.values[0]?.by[0]?.publication === imported.hash && s.values[0]?.by.length === 1,
      ),
    ).toBe(true);
    const credit = creditOf(PETALS_AUTHOR, record, docs);
    expect(credit.totals.confirmed).toBe(0);
    expect(credit.totals.built_on).toBe(0);
    expect(credit.totals.first).toBe(map.slots.reduce((n, s) => n + s.values.length, 0));
    // the import's label has no credit of its own on that map any more
    expect(creditOf(IMPORTED_AUTHOR, record, docs).layers).toEqual([]);
  });

  test('another account building on the import is a fork: both stand, and the import is not taken over', () => {
    seq = 0;
    const imported = entry(importOf(ABOUT, [SHARES]));
    const { signed } = press(OTHER, [
      unsigned(OTHER, ABOUT, [SHARES, TOKEN], { parent: imported.hash }),
    ]);
    const fork = entry(signed[0] as Publication);
    const record = [imported, fork];
    expect(compose(ABOUT, record, docs).authors.map((x) => x.author)).toEqual([
      IMPORTED_AUTHOR,
      OTHER,
    ]);
  });
});

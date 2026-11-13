// compose/v1's fact key is complete: what a subject holds several of at one moment (a voter's deposits of two
// governing mints, a transaction's payouts to several recipients) are several facts, so equal facts compare equal
// and a slot differs only where two readings really disagree.
import { describe, expect, test } from 'vitest';
import { compose, type Entry, type Publication, publicationHash } from '../src/compose/compose.ts';
import { factsOf } from '../src/compose/facts.ts';
import { canonicalJson, sha256Hex } from '../src/hash.ts';

const SOL = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const REALM = `${SOL}:DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263`;
const COMMUNITY = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const COUNCIL = 'G3EzHHXPd434o31FKxd32eYQ673eDjyYiWWNZpMk9ppt';
const VOTER = 'zenom3SnXK6k2UJm73jRQ1n8U7KkLPrTypDatKjGxoL';

const deposits = (asset: string, amount: string) => ({
  petal: 'snapshot/v1',
  network: { id: 'solana-realms-deposits', chain: SOL },
  snapshot: { as_of: '2026-11-11T16:04:47Z', block_height: 468183804 },
  holdings: [
    { participant: VOTER, measure: 'governing_token_deposit', unit: 'tokens', amount, asset },
  ],
});

const DAO = 'near:mainnet:ref-finance.sputnik-dao.near';
const TOKEN = 'near:mainnet:singularty.nearlytrade.near';
const payouts = (paid: { to: string; raw: string }[]) => ({
  petal: 'payouts/v1',
  about: DAO,
  payouts: paid.map((p) => ({
    from: DAO,
    to: p.to,
    asset: { id: TOKEN, symbol: null, decimals: 18 },
    amount: null,
    raw: p.raw,
    when: '2026-11-01T00:00:00Z',
    proposal: { id: '1054', kind: 'FunctionCall', ref: 'r', at: '2026-11-01T00:00:00Z' },
    usd: null,
    evidence: { tx: 'D6wdNLVorKG7p1GsSU3symA3vwjxQDKSCNDJZkAcFCXw', block: 223171862, ref: 'r' },
  })),
});

function composed(about: string, byAuthor: [string, unknown[]][]) {
  const docs = new Map<string, unknown>();
  let seq = 0;
  const entries: Entry[] = byAuthor.map(([author, layers]) => {
    const p: Publication = {
      petal: 'publication/v1',
      about,
      author,
      via: null,
      layers: layers.map((d) => {
        const sha256 = sha256Hex(canonicalJson(d));
        docs.set(sha256, d);
        return { sha256, petal: (d as { petal: string }).petal };
      }),
      parent: null,
      previous: null,
      published_at: '2026-11-13T01:00:00.000Z',
      proof: null,
    };
    seq++;
    return {
      seq,
      appended_at: `2026-11-13T01:00:0${seq}.000Z`,
      hash: publicationHash(p),
      publication: p,
    };
  });
  return compose(about, entries, docs);
}

describe('a holding is keyed by its asset', () => {
  test("a voter's community and council deposits at one block are two facts, not a difference", () => {
    const map = composed(REALM, [
      ['mapping.petals.near', [deposits(COMMUNITY, '10'), deposits(COUNCIL, '1')]],
    ]);
    expect(map.differs).toBe(0);
    expect(map.slots.map((s) => s.of).sort()).toEqual([COMMUNITY, COUNCIL].sort());
    // the words for the kind of data are the same
    expect(new Set(map.slots.map((s) => s.what))).toEqual(
      new Set(['snapshot/governing_token_deposit tokens']),
    );
  });

  test('two authors reading one deposit differently at one block still differ', () => {
    const map = composed(REALM, [
      ['mapping.petals.near', [deposits(COMMUNITY, '10')]],
      ['near:mainnet:other.near', [deposits(COMMUNITY, '12')]],
    ]);
    expect(map.differs).toBe(1);
  });
});

describe('a payout is keyed by its recipient and asset', () => {
  test('one transaction paying two recipients the same token is two facts, not a difference', () => {
    const doc = payouts([
      { to: 'near:mainnet:6adf1sh.near', raw: '1936933620074447149823777' },
      { to: 'near:mainnet:brbrba.near', raw: '1914428132806240444235882' },
    ]);
    expect(factsOf(doc).map((f) => f.of)).toEqual([
      `near:mainnet:6adf1sh.near ${TOKEN}`,
      `near:mainnet:brbrba.near ${TOKEN}`,
    ]);
    expect(composed(DAO, [['mapping.petals.near', [doc]]]).differs).toBe(0);
  });

  test('two authors who read the same payout match it; a misread amount differs', () => {
    const one = payouts([{ to: 'near:mainnet:6adf1sh.near', raw: '100' }]);
    const same = composed(DAO, [
      ['mapping.petals.near', [one]],
      ['near:mainnet:other.near', [payouts([{ to: 'near:mainnet:6adf1sh.near', raw: '100' }])]],
    ]);
    expect(same.differs).toBe(0);
    expect(same.slots[0]?.values[0]?.by.map((b) => b.author)).toEqual([
      'mapping.petals.near',
      'near:mainnet:other.near',
    ]);
    const misread = composed(DAO, [
      ['mapping.petals.near', [one]],
      ['near:mainnet:other.near', [payouts([{ to: 'near:mainnet:6adf1sh.near', raw: '101' }])]],
    ]);
    expect(misread.differs).toBe(1);
  });
});

// T197: existing data read as claims. Every stored snapshot, then the map's labels and corrections.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  applyPolicy,
  claimsFromMap,
  DEFAULT_LENS,
  distinctCounts,
  kindOfIdentityStatus,
  makeClaim,
  observedClaims,
  parseRef,
  readSnapshot,
  SNAPSHOT_READER,
  validateClaim,
} from '../src/claims/index.ts';
import { snapshotSha256 } from '../src/tables.ts';
import type { Claim, MapRow, Snapshot } from '../src/types/index.ts';
import { deepFreeze } from './claims-fixture.ts';
import { FIXTURES, houseOfStake, loadSnapshot } from './load.ts';
import { sampleCorrection } from './samples.ts';

const stored = (
  JSON.parse(readFileSync(join(FIXTURES, 'snapshots', 'index.json'), 'utf8')) as {
    snapshots: { sha256: string; network: string; file: string; where: string }[];
  }
).snapshots.filter((e) => e.where === 'fixture');

const load = (sha: string): Snapshot => {
  const e = stored.find((x) => x.sha256.startsWith(sha));
  if (!e) throw new Error(`no stored snapshot ${sha}`);
  return loadSnapshot(`snapshots/${e.file}`);
};
const byVerb = (claims: Claim[], verb: string) => claims.filter((c) => c.verb === verb);

const NEAR = '72a6d9676d';
const MOLOCH = 'c46437a2af';
const SEAM = 'b82956b9f3';
const DPX = '3f3f097d0c';
const BANK = 'ebacaf5cc5';
const BEAN_A = '1d063af105';
const BEAN_B = 'bddcf0ddf8';

describe('observedClaims on every stored snapshot', () => {
  test('there are snapshots to read', () => {
    expect(stored.length).toBeGreaterThanOrEqual(10);
  });

  describe.each(stored.map((e) => [`${e.network} ${e.sha256.slice(0, 10)}`, e] as const))(
    '%s',
    (_name, e) => {
      const s = loadSnapshot(`snapshots/${e.file}`);
      const { claims, skipped } = readSnapshot(s);

      test('the hash in every claim is the snapshot it came from', () => {
        expect(snapshotSha256(s)).toBe(e.sha256);
        for (const c of claims) expect(c.evidence[0]?.snapshot_sha256).toBe(e.sha256);
      });

      test('deterministic: the same snapshot gives the same ids, in the same order', () => {
        const again = observedClaims(structuredClone(s));
        expect(again.map((c) => c.id)).toEqual(claims.map((c) => c.id));
      });

      test('every claim is valid, with its moment, and each id appears once', () => {
        expect(new Set(claims.map((c) => c.id)).size).toBe(claims.length);
        for (const c of claims) {
          const r = validateClaim(c);
          if (!r.ok) throw new Error(`${JSON.stringify(c)}\n${JSON.stringify(r.errors)}`);
          expect(c.as_of).toEqual({ chain: s.network.chain, block: s.snapshot.block_height });
          expect(c.issued_at).toBe(s.snapshot.as_of);
          expect(c.by).toBe(SNAPSHOT_READER);
        }
      });

      test('every row is accounted for', () => {
        expect(claims.length + skipped.length).toBe(s.holdings.length + s.relationships.length);
      });
    },
  );

  test('only the row that describes no real holder is left out', () => {
    const all = stored.flatMap((e) => readSnapshot(loadSnapshot(`snapshots/${e.file}`)).skipped);
    expect(all).toEqual([
      { table: 'holdings', index: expect.any(Number), why: 'it describes no real holder' },
    ]);
    expect(load(SEAM).participants.filter((p) => p.id === 'group:not-read')).toHaveLength(1);
  });
});

describe('the traps the graph pass hit', () => {
  test('the same group id in two snapshots is two entities', () => {
    const subjectOf = (sha: string) => {
      const c = observedClaims(load(sha)).find((x) => parseRef(x.subject)?.ns === 'group');
      if (!c) throw new Error('no group');
      return c;
    };
    expect(load(DPX).participants.some((p) => p.id === 'group:tail-1')).toBe(true);
    expect(load(BANK).participants.some((p) => p.id === 'group:tail-1')).toBe(true);
    const a = observedClaims(load(DPX)).map((c) => c.subject);
    const b = new Set(observedClaims(load(BANK)).map((c) => c.subject));
    expect(a.filter((ref) => ref.startsWith('group:') && b.has(ref))).toEqual([]);
    expect(subjectOf(DPX).subject.endsWith(':tail-1')).toBe(true);
  });

  test('a folded row says how many accounts it folds, so it is not counted as one', () => {
    const c = observedClaims(load(DPX)).find((x) => x.subject.endsWith(':tail-1'));
    expect(c?.qualifiers?.folded_count).toBe('955');
  });

  test('one snapshot is many groups: NEAR delegates to 437 pools, not to one snapshot', () => {
    const delegations = byVerb(observedClaims(load(NEAR)), 'delegates_to');
    expect(delegations).toHaveLength(8884);
    expect(new Set(delegations.map((c) => c.object)).size).toBe(437);
    expect(delegations.filter((c) => parseRef(c.subject)?.ns === 'group')).toHaveLength(565);
  });

  test("a block count isn't a position, and neither is a token's supply", () => {
    const claims = observedClaims(load(NEAR));
    const holds = byVerb(claims, 'holds');
    const measures = new Set(holds.map((c) => c.qualifiers?.measure));
    expect([...measures].filter((m) => m?.startsWith('num_') || m?.endsWith('_supply'))).toEqual(
      [],
    );
    expect(measures).toContain('validator_stake_current_epoch');
    const measured = byVerb(claims, 'measured');
    expect(new Set(measured.map((c) => c.qualifiers?.measure))).toContain(
      'num_produced_blocks_current_epoch',
    );
    expect(holds.length + measured.length).toBe(load(NEAR).holdings.length);
  });

  test('an API report of a chain is sourced, with its URL', () => {
    const claims = observedClaims(load(NEAR));
    const sourced = claims.filter((c) => c.kind === 'sourced');
    expect(sourced).toHaveLength(491);
    for (const c of sourced) expect(c.evidence[0]?.url).toMatch(/^https:\/\//);
    expect(new Set(sourced.map((c) => c.qualifiers?.measure))).toEqual(
      new Set(['pool_contract_stake']),
    );
  });

  test('look-alike addresses stay in their own namespace, and account ids read strictly', () => {
    const claims = observedClaims(load(NEAR));
    const subjects = new Set(claims.map((c) => c.subject));
    expect([...subjects].filter((r) => r.startsWith('near:mainnet:0x')).length).toBeGreaterThan(0);
    expect([...subjects].filter((r) => r.startsWith('eip155:'))).toEqual([]);
    expect([...subjects].filter((r) => r.startsWith('near:') && r.includes('_'))).toEqual([]);
    expect(subjects).toContain('near:mainnet:abl%5Fpool.poolv1.near');
  });

  test('a self-loop is a claim like any other', () => {
    const loops = byVerb(observedClaims(load(NEAR)), 'owned_by').filter(
      (c) => c.subject === c.object,
    );
    expect(loops).toHaveLength(1);
  });

  test('two dates of one group are two claims about one asset', () => {
    const a = byVerb(observedClaims(load(BEAN_A)), 'holds');
    const b = byVerb(observedClaims(load(BEAN_B)), 'holds');
    expect(a[0]?.object).toBe(b[0]?.object);
    const ids = new Set(a.map((c) => c.id));
    expect(b.filter((c) => ids.has(c.id))).toEqual([]);
  });

  test("a DAO's own share is scoped to that DAO", () => {
    const [c] = byVerb(observedClaims(load(MOLOCH)), 'holds');
    expect(c?.object).toContain('0x1fd169a4f5c59acf79d0fd5d91d1201ef1bce9f1');
    expect(c?.object).toContain('moloch-v1-share');
  });

  test('a stored claim that pretends to be a snapshot read fails when compared with one', () => {
    // applyPolicy trusts `by`, so a reader compares ids before it lets such a claim in.
    const s = load(MOLOCH);
    const [real] = observedClaims(s);
    if (!real) throw new Error('no claims');
    const { id: _id, petal: _petal, ...draft } = real;
    const forged = makeClaim({
      ...draft,
      qualifiers: { ...draft.qualifiers, amount: '1000000000' },
    });
    expect(validateClaim(forged).ok).toBe(true);
    const ids = new Set(observedClaims(s).map((c) => c.id));
    expect(ids.has(real.id)).toBe(true);
    expect(ids.has(forged.id)).toBe(false);
  });

  test("chain text can't break a claim: a rude symbol drops, a rude role is listed", () => {
    const base = structuredClone(load(MOLOCH));
    const [h] = base.holdings;
    if (!h) throw new Error('no holdings');
    h.unit = 'SCAMCOIN';
    const first = readSnapshot(base).claims.find((c) => c.qualifiers?.amount === h.amount);
    expect(first?.qualifiers?.unit).toBeUndefined();

    const house = structuredClone(houseOfStake());
    const role = house.relationships.find((r) => r.type.startsWith('holds_role:'));
    if (!role) throw new Error('no role');
    role.type = 'holds_role:scammer';
    const { claims, skipped } = readSnapshot(house);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.why).toContain('not in the vocabulary');
    expect(claims.every((c) => c.qualifiers?.role !== 'scammer')).toBe(true);
  });

  test('aggregates over a real snapshot count distinct things', () => {
    const counts = distinctCounts(observedClaims(load(NEAR)));
    expect(counts.claims).toBe(counts.rows);
    expect(counts.subjects).toBeLessThan(counts.claims);
  });
});

describe('real people', () => {
  test.each([
    ['moloch', () => load(MOLOCH), 19],
    ['near validators', () => load(NEAR), 1],
    ['house of stake', () => houseOfStake(), 0],
  ])('%s: a name in the snapshot reaches no claim', (_name, get, atLeast) => {
    const s = get();
    // An id that is its own name is an account, which a claim may name, and `NearX` is its
    // token's symbol as well as its name. What's left must not reach a claim.
    const units = new Set(s.holdings.map((h) => h.unit));
    const names = s.participants
      .map((p) => p.identity?.name)
      .filter((n): n is string => typeof n === 'string' && /[\sA-Z]/.test(n) && !units.has(n));
    expect(names.length).toBeGreaterThanOrEqual(atLeast);
    const text = JSON.stringify(observedClaims(s));
    expect(names.filter((n) => text.includes(n))).toEqual([]);
  });

  test('stored names exist to be kept out', () => {
    const named = load(MOLOCH).participants.filter((p) => p.identity !== null);
    expect(named).toHaveLength(19);
  });

  test('the kind "person" reaches no claim: subject and object are accounts', () => {
    const s = houseOfStake();
    expect(s.participants.filter((p) => p.kind === 'person').length).toBeGreaterThan(0);
    const { claims, skipped } = readSnapshot(s);
    expect(skipped).toEqual([]);
    for (const c of claims) {
      const r = validateClaim(c);
      if (!r.ok) throw new Error(`${JSON.stringify(c)}\n${JSON.stringify(r.errors)}`);
      expect(parseRef(c.subject)?.ns).toBe('account');
    }
    expect(new Set(byVerb(claims, 'voted').map((c) => c.qualifiers?.choice))).toEqual(
      new Set(['for', 'against', 'abstain']),
    );
    expect(byVerb(claims, 'voted')[0]?.object).toMatch(/^proposal:near:mainnet:vote\.dao:\d+$/);
  });
});

describe('claimsFromMap', () => {
  const RECEIVER = 'petals.testnet';
  const WRITER = 'petals-writer.testnet';
  const row = (key: string, value: unknown, writer = WRITER): MapRow => ({
    key,
    value,
    writer,
    receiver: RECEIVER,
    tx_hash: `tx-${writer}`,
    block_height: 100,
    block_timestamp: 1,
  });
  const LABEL = 'petal/v1/label/near:testnet/tern.pool.example.testnet';
  const label = (fields: Record<string, unknown>) =>
    row(LABEL, {
      tag: 'identity',
      value: 'Ada Byron',
      status: 'verified',
      evidence: [{ kind: 'post', url: 'https://example.org/ada', note: 'Ada Byron wrote this' }],
      written_at: '2026-11-05T10:00:00Z',
      ...fields,
    });

  test('statuses map onto kinds, and self-declared needs the account itself', () => {
    expect(kindOfIdentityStatus('self-declared', true)).toBe('declared');
    expect(kindOfIdentityStatus('self-declared', false)).toBe('sourced');
    expect(kindOfIdentityStatus('verified', true)).toBe('sourced');
    expect(kindOfIdentityStatus('verified', false)).toBe('sourced');
    expect(kindOfIdentityStatus('inferred', true)).toBe('inferred');
    expect(kindOfIdentityStatus('inferred', false)).toBe('inferred');
  });

  test('a verified label by a writer: sourced, and the text stays on the row', () => {
    const { claims, skipped } = claimsFromMap([label({})]);
    expect(skipped).toEqual([]);
    expect(claims).toHaveLength(1);
    const [c] = claims;
    expect(c).toMatchObject({
      subject: 'near:testnet:tern.pool.example.testnet',
      verb: 'labelled',
      object: { value: 'identity' },
      kind: 'sourced',
      by: `near:testnet:${WRITER}`,
      issued_at: '2026-11-05T10:00:00Z',
      proof: { type: 'tx', hash: `tx-${WRITER}` },
    });
    expect(JSON.stringify(c)).not.toContain('Ada Byron');
    expect(JSON.stringify(c)).toContain(`fastdata://${RECEIVER}/${WRITER}/${LABEL}`);
  });

  test('self-declared by the account itself is declared, and by another it is sourced', () => {
    const own = claimsFromMap([
      row(
        LABEL,
        { tag: 'name', value: 'x', status: 'self-declared', written_at: '2026-11-05T10:00:00Z' },
        'tern.pool.example.testnet',
      ),
    ]);
    expect(own.claims[0]?.kind).toBe('declared');
    const report = claimsFromMap([label({ status: 'self-declared' })]);
    expect(report.claims[0]?.kind).toBe('sourced');
  });

  test('what can not be a claim is listed, not lost', () => {
    const cases: [MapRow, string][] = [
      [label({ status: 'inferred' }), 'needs a stated method and grounds'],
      [
        label({ status: 'inferred', method: 'x@1', grounds: 'inbound_transfers' }),
        'inbound transfers alone',
      ],
      [label({ evidence: [] }), 'URL to its source'],
      [label({ tag: 'Ada Byron' }), '/object'],
      [label({ tag: 'scammer' }), '/object'],
      [label({ status: 'guessed' }), 'status'],
      [row(LABEL, null), 'not a label row'],
      [row('petal/v1/label/near:testnet/Not An Account', {}), 'not an account'],
    ];
    for (const [input, why] of cases) {
      const { claims, skipped } = claimsFromMap([input]);
      expect(claims).toEqual([]);
      expect(skipped).toHaveLength(1);
      expect(skipped[0]?.why).toContain(why);
    }
  });

  test('an inferred label with its method and grounds is inferred, and caveated if asked for', () => {
    const { claims } = claimsFromMap([
      label({ status: 'inferred', method: 'x@1', grounds: 'funding_lineage' }),
    ]);
    const [c] = claims;
    expect(c?.kind).toBe('inferred');
    expect(c?.method).toBe('x@1');
    const shown = applyPolicy(claims, { trusted: 'everyone' });
    expect(shown[0]?.show).toBe('caveated');
    expect(applyPolicy(claims, DEFAULT_LENS)[0]?.show).toBe('hidden');
  });

  test('a correction: the requester speaks, and the reason stays on the row', () => {
    const key = `petal/v1/correction/${sampleCorrection.flower_id}/${sampleCorrection.id}`;
    const { claims, skipped } = claimsFromMap([row(key, sampleCorrection)]);
    expect(skipped).toEqual([]);
    const [c] = claims;
    expect(c).toMatchObject({
      subject: 'near:testnet:someone.testnet',
      verb: 'requests_correction',
      object: 'near:mainnet:a.pool.near',
      qualifiers: {
        request: 'correct',
        flower_id: sampleCorrection.flower_id,
        correction_id: sampleCorrection.id,
      },
      kind: 'declared',
      by: 'near:testnet:someone.testnet',
      proof: sampleCorrection.proof,
    });
    expect(JSON.stringify(c)).not.toContain(sampleCorrection.reason);
  });

  test('a correction whose proof is from someone else, or a broken one, is not a claim', () => {
    const key = 'petal/v1/correction/x/y';
    const forged = {
      ...sampleCorrection,
      proof: { ...sampleCorrection.proof, account_id: 'other.testnet' },
    };
    expect(claimsFromMap([row(key, forged)]).skipped[0]?.why).toContain('not from its requester');
    expect(claimsFromMap([row(key, { petal: 'correction/v1' })]).skipped[0]?.why).toContain(
      'not a correction',
    );
  });

  test('nothing on the map is rewritten, and other rows are passed over', () => {
    const rows = deepFreeze([
      label({}),
      row('petal/v1/spec/abc', { petal: 'flower/v2' }),
      row('petal/v1/vouch/x.testnet', { since: 'now' }),
    ]);
    const before = structuredClone(rows);
    const { claims, skipped } = claimsFromMap(rows);
    expect(claims).toHaveLength(1);
    expect(skipped).toEqual([]);
    expect(rows).toEqual(before);
  });

  test('deterministic, and a repeated row is one claim', () => {
    const a = claimsFromMap([label({}), label({})]);
    expect(a.claims).toHaveLength(1);
    expect(claimsFromMap([label({})]).claims[0]?.id).toBe(a.claims[0]?.id);
  });
});

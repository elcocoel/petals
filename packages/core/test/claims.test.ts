// T197: the claim shape, the first-version rules on real people, what's derived, and the policy.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  accountRef,
  applyPolicy,
  assetRef,
  claimerRecord,
  claimId,
  claimRef,
  DEFAULT_LENS,
  distinctCounts,
  groupRef,
  makeClaim,
  observedClaims,
  parseRef,
  VERBS,
  validateClaim,
} from '../src/claims/index.ts';
import { schemas } from '../src/schema/index.ts';
import type { Claim, ClaimDraft, Lens, Shown } from '../src/types/index.ts';
import {
  AUTHOR,
  CHALLENGER,
  CLASSIFIER,
  chainClaim,
  challenge,
  deepFreeze,
  fourClaims,
  metaClaim,
  OWNER,
  POOL,
  proofOf,
  READER,
  rating,
  sourcedClaim,
  WHEN,
} from './claims-fixture.ts';
import { tinyBackers } from './load.ts';

const rowOf = (shown: Shown[], c: Claim): Shown => {
  const row = shown.find((s) => s.claim.id === c.id);
  if (!row) throw new Error('no row for that claim');
  return row;
};
const showOf = (claims: Claim[], lens: Lens, c: Claim) => rowOf(applyPolicy(claims, lens), c).show;
const shuffleKeys = <T>(x: T): T =>
  Array.isArray(x)
    ? (x.map(shuffleKeys) as T)
    : typeof x === 'object' && x !== null
      ? (Object.fromEntries(
          Object.entries(x)
            .reverse()
            .map(([k, v]) => [k, shuffleKeys(v)]),
        ) as T)
      : x;

describe('the shape', () => {
  test('the id hashes the canonical claim, without id and proof', () => {
    const c = sourcedClaim();
    expect(c.id).toMatch(/^[0-9a-f]{64}$/);
    expect(claimId(c)).toBe(c.id);
    expect(claimId({ ...c, proof: proofOf(AUTHOR) })).toBe(c.id);
    expect(claimId({ ...c, id: 'whatever' })).toBe(c.id);
    expect(claimId({ ...c, by: CHALLENGER })).not.toBe(c.id);
  });

  test('the id survives a store that re-sorts keys', () => {
    const c = chainClaim();
    expect(claimId(shuffleKeys(c))).toBe(c.id);
    expect(validateClaim(shuffleKeys(c)).ok).toBe(true);
  });

  test('the schema and the code list the same verbs and kinds', () => {
    const schema = schemas.claim as {
      properties: { verb: { enum: string[] }; kind: { enum: string[] } };
    };
    expect(new Set(schema.properties.verb.enum)).toEqual(new Set(Object.keys(VERBS)));
    expect(schema.properties.kind.enum).toEqual(['observed', 'declared', 'sourced', 'inferred']);
  });

  test('every verb has a one-line definition, and the vocabulary accuses nobody', () => {
    for (const [verb, rule] of Object.entries(VERBS)) {
      expect(rule.means.length, verb).toBeGreaterThan(10);
      expect(rule.means.length, verb).toBeLessThanOrEqual(100);
      expect(rule.means, verb).not.toContain('\n');
    }
    for (const gone of ['same_as', 'declares_name', 'scammer', 'sybil', 'fraudster'])
      expect(Object.keys(VERBS)).not.toContain(gone);
  });

  test('the contract lists every verb with its definition', () => {
    const contract = readFileSync(
      join(import.meta.dirname, '..', '..', '..', 'specs', '002-system', 'contracts', 'claims.md'),
      'utf8',
    );
    for (const [verb, rule] of Object.entries(VERBS))
      expect(contract, verb).toContain(`| \`${verb}\` | ${rule.kinds.join(', ')} |`);
    for (const rule of Object.values(VERBS)) expect(contract).toContain(rule.means);
  });

  test('the fixture is valid', () => {
    for (const c of fourClaims().all) expect(validateClaim(c)).toEqual({ ok: true, value: c });
    expect(validateClaim(metaClaim('responds', sourcedClaim(), POOL)).ok).toBe(true);
    expect(validateClaim(metaClaim('retracts', sourcedClaim(), AUTHOR)).ok).toBe(true);
  });
});

describe('references', () => {
  test('an underscore is %5F, so strict CAIP-10 tools can read it, and it reads back', () => {
    const ref = accountRef('near:mainnet', 'abl_pool.poolv1.near');
    expect(ref).toBe('near:mainnet:abl%5Fpool.poolv1.near');
    expect(ref).toMatch(/^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}:[-.%a-zA-Z0-9]{1,128}$/);
    expect(parseRef(ref as string)).toEqual({
      ns: 'account',
      chain: 'near:mainnet',
      address: 'abl_pool.poolv1.near',
    });
  });

  test.each([
    ['a raw underscore', 'near:mainnet:abl_pool.near'],
    ['lower-case hex', 'near:mainnet:abl%5fpool.near'],
    ['an escape of a plain letter', 'near:mainnet:%61bl.near'],
    ['upper case on EVM', 'eip155:1:0xAbC0000000000000000000000000000000000000'],
    ['upper case on NEAR', 'near:mainnet:Alice.near'],
    ['a chain this version does not know', 'cosmos:hub:abcdefgh'],
    ['no namespace', 'alice.near'],
    ['a group with no snapshot', 'group:tail-1'],
    ['a bad claim id', 'claim:abc'],
    ['a model with no version', 'model:example/classifier'],
  ])('one thing has one spelling: refuses %s', (_what, ref) => {
    expect(parseRef(ref)).toBeNull();
  });

  test('normalises per namespace: EVM down, base58 never', () => {
    expect(accountRef('eip155:1', '0xABCDEF0000000000000000000000000000000000')).toBe(
      'eip155:1:0xabcdef0000000000000000000000000000000000',
    );
    const base58 = 'FV4nQwSH6t21iZTgrkcfVg8ct8o1tpdQPojAYXnXugXe';
    expect(accountRef('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', base58)).toContain(base58);
  });

  test('look-alikes stay apart', () => {
    const evm = '0xabcdef0000000000000000000000000000000000';
    expect(accountRef('eip155:1', evm)).not.toBe(accountRef('eip155:8453', evm));
    expect(accountRef('near:mainnet', evm)).not.toBe(accountRef('eip155:1', evm));
    expect(assetRef('near:mainnet', 'NEAR')).not.toBe(accountRef('near:mainnet', 'near'));
    expect(groupRef('a'.repeat(64), 'tail-1')).not.toBe(groupRef('b'.repeat(64), 'tail-1'));
  });
});

describe('validateClaim refuses each forbidden case', () => {
  const on = (overrides: Partial<ClaimDraft>, base: () => Claim = sourcedClaim) => {
    const { id: _id, petal: _petal, ...draft } = base();
    return makeClaim({ ...draft, ...overrides });
  };
  const inferred = (overrides: Partial<ClaimDraft> = {}) =>
    makeClaim({
      subject: POOL,
      verb: 'moves_with',
      object: OWNER,
      qualifiers: { grounds: 'synchronised_behaviour' },
      issued_at: WHEN,
      kind: 'inferred',
      method: 'moves-with@1#abcdef12',
      evidence: [{ snapshot_sha256: 'a'.repeat(64) }],
      by: AUTHOR,
      ...overrides,
    });

  test('an honest inference passes', () => {
    expect(validateClaim(inferred()).ok).toBe(true);
    expect(
      validateClaim(inferred({ qualifiers: { grounds: 'inbound_transfers,shared_signer' } })).ok,
    ).toBe(true);
  });

  const cases: [string, () => unknown, string, string][] = [
    // Natural people
    ['a person as subject', () => on({ subject: 'person:ada' }), 'no_natural_person', '/subject'],
    ['a person as object', () => on({ object: 'person:ada' }), 'no_natural_person', '/object'],
    ['a person as writer', () => on({ by: 'person:ada' }), 'no_natural_person', '/by'],
    ['a free entity', () => on({ subject: 'entity:ada-byron' }), 'no_natural_person', '/subject'],
    ['a DID', () => on({ object: 'did:near:ada' }), 'no_natural_person', '/object'],
    // Free text
    ['a name as the object', () => on({ object: 'Ada Byron' }), 'schema', '/object'],
    [
      'a name as an object value',
      () => on({ object: { value: 'Ada Byron' } }),
      'object_for_verb',
      '/object',
    ],
    [
      'a name in a value for a number verb',
      () => on({ verb: 'measured', object: { value: 'Ada Byron' }, qualifiers: { measure: 'x' } }),
      'object_for_verb',
      '/object',
    ],
    [
      'a name as a label tag',
      () => on({ verb: 'labelled', object: { value: 'ada-byron' } }),
      'object_for_verb',
      '/object',
    ],
    [
      'a name in a qualifier',
      () => on({ verb: 'member_of', qualifiers: { role: 'Ada Byron' } }),
      'no_free_text',
      '/qualifiers/role',
    ],
    [
      'a qualifier the verb does not take',
      () => on({ qualifiers: { real_name: 'ada' } }),
      'qualifier',
      '/qualifiers/real_name',
    ],
    [
      'a name in a note',
      () => on({ evidence: [{ url: 'https://example.org', note: 'run by Ada Byron' }] }),
      'no_free_text_name',
      '/evidence/0/note',
    ],
    [
      'a handle in a note',
      () => on({ evidence: [{ url: 'https://example.org', note: 'see @ada' }] }),
      'no_free_text_name',
      '/evidence/0/note',
    ],
    [
      'an address for mail in a note',
      () => on({ evidence: [{ url: 'https://example.org', note: 'mail ada@example.org' }] }),
      'no_free_text_name',
      '/evidence/0/note',
    ],
    // Vocabulary
    ['the verb scammer', () => ({ ...sourcedClaim(), verb: 'scammer' }), 'schema', '/verb'],
    ['the verb sybil', () => ({ ...sourcedClaim(), verb: 'sybil' }), 'schema', '/verb'],
    ['the verb same_as', () => ({ ...sourcedClaim(), verb: 'same_as' }), 'schema', '/verb'],
    ['a name verb', () => ({ ...sourcedClaim(), verb: 'declares_name' }), 'schema', '/verb'],
    [
      'an accusation as a role',
      () => on({ verb: 'member_of', qualifiers: { role: 'scammer-ring' } }),
      'vocabulary',
      '/qualifiers/role',
    ],
    [
      'an accusation in a note',
      () => on({ evidence: [{ url: 'https://example.org', note: 'part of a sybil farm' }] }),
      'vocabulary',
      '/evidence/0/note',
    ],
    // Inferences
    ['an inference with no method', () => inferred({ method: undefined }), 'schema', ''],
    [
      'an inference with no grounds',
      () => inferred({ qualifiers: {} }),
      'qualifier',
      '/qualifiers/grounds',
    ],
    [
      'an inference on inbound transfers alone',
      () => inferred({ qualifiers: { grounds: 'inbound_transfers' } }),
      'inbound_alone',
      '/qualifiers/grounds',
    ],
    [
      'grounds outside the closed list',
      () => inferred({ qualifiers: { grounds: 'vibes' } }),
      'no_free_text',
      '/qualifiers/grounds',
    ],
    [
      'grounds in two spellings',
      () => inferred({ qualifiers: { grounds: 'shared_signer,funding_lineage' } }),
      'no_free_text',
      '/qualifiers/grounds',
    ],
    ['an inference with no evidence', () => inferred({ evidence: [] }), 'evidence', '/evidence'],
    ['a method on a sourced claim', () => on({ method: 'x@1' }), 'schema', ''],
    ['an observed sameness', () => inferred({ kind: 'observed' as const }), 'schema', ''],
    // What each kind needs
    [
      'declared for someone else',
      () => on({ verb: 'controls', kind: 'declared', proof: proofOf(AUTHOR) }),
      'declared',
      '/by',
    ],
    [
      'declared with no proof',
      () => on({ subject: AUTHOR, verb: 'controls', kind: 'declared' }),
      'declared',
      '/proof',
    ],
    [
      'observed with nothing to check',
      () => on({ evidence: [] }, chainClaim),
      'evidence',
      '/evidence',
    ],
    ['sourced with no URL', () => on({ evidence: [{ note: 'a post' }] }), 'evidence', '/evidence'],
    [
      'a kind the verb does not allow',
      () => on({ kind: 'inferred', method: 'x@1' }),
      'kind_for_verb',
      '/kind',
    ],
    // Refs and hashes
    ['a raw underscore', () => on({ subject: 'near:mainnet:a_b.near' }), 'entity_ref', '/subject'],
    [
      'an asset as a subject',
      () => on({ subject: 'asset:near:mainnet:NEAR' }),
      'entity_ref',
      '/subject',
    ],
    ['a group as a writer', () => on({ by: `group:${'a'.repeat(64)}:x` }), 'entity_ref', '/by'],
    ['an id that is not its hash', () => ({ ...sourcedClaim(), id: 'f'.repeat(64) }), 'id', '/id'],
    // Claims about claims
    [
      'speaking for someone else',
      () => ({ ...makeClaim({ ...challengeDraft(), subject: AUTHOR }) }),
      'speaker',
      '/subject',
    ],
    [
      'a challenge with nothing to show',
      () => makeClaim({ ...challengeDraft(), evidence: [] }),
      'evidence',
      '/evidence',
    ],
    [
      'a challenge of no claim',
      () => makeClaim({ ...challengeDraft(), object: POOL }),
      'object_for_verb',
      '/object',
    ],
    [
      'a confidence from a tool',
      () => makeClaim({ ...ratingDraft(), subject: READER, by: READER }),
      'named_model',
      '/by',
    ],
    [
      'a model confidence that names no model',
      () => makeClaim({ ...ratingDraft(), subject: AUTHOR, by: AUTHOR }),
      'named_model',
      '/by',
    ],
    [
      'a confidence with a number instead of a band',
      () => makeClaim({ ...ratingDraft(), qualifiers: { band: '0.87' } }),
      'no_free_text',
      '/qualifiers/band',
    ],
    // Amounts and dates
    [
      'an amount as a number',
      () => ({ ...chainClaim(), qualifiers: { amount: 1000.5, measure: 'x' } }),
      'schema',
      '/qualifiers/amount',
    ],
    [
      'a date not in UTC',
      () => on({ issued_at: '2026-11-05T12:00:00+01:00' }),
      'schema',
      '/issued_at',
    ],
    [
      'an end before its start',
      () => on({ valid_from: '2026-11-05T12:00:00Z', valid_to: '2026-01-01T00:00:00Z' }),
      'dates',
      '/valid_to',
    ],
  ];

  test.each(cases)('%s', (_what, build, rule, path) => {
    const result = validateClaim(build());
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.map((e) => `${e.rule} ${e.path}`)).toContain(`${rule} ${path}`);
  });

  function challengeDraft(): ClaimDraft {
    const { id: _id, petal: _petal, ...draft } = challenge(sourcedClaim());
    return draft;
  }
  function ratingDraft(): ClaimDraft {
    const { id: _id, petal: _petal, ...draft } = rating(sourcedClaim());
    return draft;
  }

  test('anything but an object is refused, not thrown on', () => {
    for (const x of [null, 1, 'claim', [], {}]) expect(validateClaim(x).ok).toBe(false);
  });
});

describe('two lenses, one set of claims', () => {
  const { chain, sourced, confidence, challenged, all } = fourClaims();
  const followsAuthor: Lens = {
    kinds: ['observed', 'sourced'],
    trusted: [AUTHOR, CLASSIFIER],
    minConfidence: 'medium',
  };
  const followsChallenger: Lens = { ...followsAuthor, trusted: [AUTHOR, CLASSIFIER, CHALLENGER] };

  test('the default lens: the chain, and nothing anyone says about anyone else', () => {
    const shown = applyPolicy(all, DEFAULT_LENS);
    expect(rowOf(shown, chain)).toMatchObject({
      show: 'plain',
      why: "Read from the chain. The snapshot's hash proves it.",
    });
    expect(rowOf(shown, sourced).show).toBe('hidden');
    expect(rowOf(shown, sourced).why).toContain("Sourced claims aren't in this lens.");
    expect(rowOf(shown, sourced).why).toContain('1 writer outside this lens challenges');
    expect(rowOf(shown, confidence).show).toBe('hidden');
    expect(rowOf(shown, challenged).show).toBe('hidden');
  });

  test('two different lenses give two different, explainable results', () => {
    const a = applyPolicy(all, followsAuthor);
    const b = applyPolicy(all, followsChallenger);

    expect(rowOf(a, sourced).show).toBe('plain');
    expect(rowOf(a, sourced).why).toContain('this lens trusts them');
    expect(rowOf(a, sourced).why).toContain('1 writer outside this lens challenges it');
    expect(rowOf(a, sourced).why).toContain('Rated medium by 1 writer');
    expect(rowOf(a, sourced).challenges).toEqual({ counted: 0, outside: 1 });
    expect(rowOf(a, sourced).confidence).toEqual({ band: 'medium', raters: 1 });

    expect(rowOf(b, sourced).show).toBe('contested');
    expect(rowOf(b, sourced).why).toContain('Challenged by 1 writer this lens trusts.');
    expect(rowOf(b, sourced).challenges).toEqual({ counted: 1, outside: 0 });

    // The chain's claim doesn't move, and neither lens changed a claim.
    expect(rowOf(a, chain).show).toBe('plain');
    expect(rowOf(b, chain).show).toBe('plain');
    expect(rowOf(a, sourced).claim).toEqual(rowOf(b, sourced).claim);
  });

  test('every row, under every lens, says why in words', () => {
    for (const lens of [
      DEFAULT_LENS,
      followsAuthor,
      followsChallenger,
      { trusted: 'everyone' as const },
    ])
      for (const row of applyPolicy(all, lens)) {
        expect(row.why.length).toBeGreaterThan(10);
        expect(row.why).toMatch(/[.]$/);
      }
  });

  test('a higher bar hides it, and says so', () => {
    const row = rowOf(applyPolicy(all, { ...followsAuthor, minConfidence: 'high' }), sourced);
    expect(row.show).toBe('hidden');
    expect(row.why).toContain('Rated medium, and this lens asks for at least high.');
  });

  test('showDisputed: false hides what a trusted writer disputes', () => {
    const row = rowOf(applyPolicy(all, { ...followsChallenger, showDisputed: false }), sourced);
    expect(row.show).toBe('hidden');
    expect(row.why).toContain('this lens hides disputed claims');
  });
});

describe('a challenge never alters the original', () => {
  test('frozen claims go through every lens and come out the same', () => {
    const { all, sourced } = fourClaims();
    const before = structuredClone(sourced);
    deepFreeze(all);
    for (const lens of [DEFAULT_LENS, { trusted: 'everyone' as const }]) {
      const row = rowOf(applyPolicy(all, lens), sourced);
      expect(row.claim).toBe(sourced);
    }
    expect(sourced).toEqual(before);
    expect(claimId(sourced)).toBe(before.id);
    expect(validateClaim(sourced).ok).toBe(true);
  });

  test('challenged or not, the claim has one id and both stay visible to a policy', () => {
    const c = sourcedClaim();
    const x = challenge(c);
    const without = applyPolicy([c], { trusted: 'everyone' });
    const withIt = applyPolicy([c, x], { trusted: 'everyone' });
    expect(rowOf(withIt, c).claim).toEqual(rowOf(without, c).claim);
    expect(withIt.map((s) => s.claim.id).sort()).toEqual([c.id, x.id].sort());
  });
});

describe('disputed is derived under the lens', () => {
  const c = sourcedClaim();
  const lens: Lens = { kinds: ['sourced'], trusted: [AUTHOR] };

  test('one outside writer changes nothing for a reader who does not count them', () => {
    expect(showOf([c, challenge(c)], lens, c)).toBe('plain');
    expect(showOf([c, challenge(c)], { ...lens, trusted: [AUTHOR, CHALLENGER] }, c)).toBe(
      'contested',
    );
  });

  test('neither does a crowd: a thousand fake writers only raise a count', () => {
    const crowd = Array.from({ length: 1000 }, (_, i) =>
      challenge(c, `near:mainnet:fake-${i}.example.near`),
    );
    const row = rowOf(applyPolicy([c, ...crowd], lens), c);
    expect(row.show).toBe('plain');
    expect(row.challenges).toEqual({ counted: 0, outside: 1000 });
    expect(row.why).toContain('1000 writers outside this lens challenge it');
  });

  test('one writer saying it many times is one challenger', () => {
    const again = [0, 1, 2].map((i) =>
      metaClaim('challenges', c, CHALLENGER, `2026-11-0${i + 1}T00:00:00Z`),
    );
    expect(rowOf(applyPolicy([c, ...again], lens), c).challenges).toEqual({
      counted: 0,
      outside: 1,
    });
  });

  test('the open view has to be asked for, and there one writer can move it', () => {
    expect(showOf([c, challenge(c)], { trusted: 'everyone' }, c)).toBe('contested');
    expect(showOf([c, challenge(c)], { kinds: ['sourced'] }, c)).toBe('hidden');
  });

  test('a challenger who retracts stops counting', () => {
    const x = challenge(c);
    const back = metaClaim('retracts', x, CHALLENGER);
    expect(showOf([c, x, back], { ...lens, trusted: [AUTHOR, CHALLENGER] }, c)).toBe('plain');
  });

  test('a false observed claim from a stranger stays off, and the real one stays on', () => {
    // The graph pass: an unfiltered top 50 was led by a fake holder.
    const real = chainClaim();
    const fake = chainClaim({
      by: 'near:mainnet:fake.example.near',
      qualifiers: { amount: '1000000000000', measure: 'validator_stake' },
    });
    const shown = applyPolicy([real, fake], DEFAULT_LENS);
    expect(rowOf(shown, real).show).toBe('plain');
    expect(rowOf(shown, fake).show).toBe('hidden');
    expect(rowOf(shown, fake).why).toContain("this lens doesn't trust");
  });
});

describe('retracts and supersedes', () => {
  const c = sourcedClaim();
  const lens: Lens = { kinds: ['sourced'], trusted: [AUTHOR] };

  test('count only from the author', () => {
    const stranger = metaClaim('retracts', c, CHALLENGER);
    const shown = applyPolicy([c, stranger], lens);
    expect(rowOf(shown, c).show).toBe('plain');
    expect(rowOf(shown, stranger)).toMatchObject({
      show: 'hidden',
      why: "Only a claim's author can retract it. This changes nothing.",
    });
    expect(showOf([c, metaClaim('supersedes', c, CHALLENGER)], lens, c)).toBe('plain');
  });

  test('the target stays readable, and off by default', () => {
    const back = metaClaim('retracts', c, AUTHOR);
    const off = rowOf(applyPolicy([c, back], lens), c);
    expect(off.show).toBe('hidden');
    expect(off.claim).toEqual(c);
    expect(off.why).toContain('Its author retracted it. It stays readable');
    expect(rowOf(applyPolicy([c, back], { ...lens, showRetracted: true }), c).show).toBe(
      'caveated',
    );
    expect(rowOf(applyPolicy([c, back], lens), back).show).toBe('plain');
  });

  test('a retraction is final: retracting it changes nothing, and saying it anew does', () => {
    const back = metaClaim('retracts', c, AUTHOR);
    const undo = metaClaim('retracts', back, AUTHOR);
    expect(showOf([c, back, undo], lens, c)).toBe('hidden');
    const again = sourcedClaim({ issued_at: '2026-12-01T00:00:00Z' });
    expect(again.id).not.toBe(c.id);
    expect(showOf([c, back, again], lens, again)).toBe('plain');
  });

  test('a replacement its author took back replaces nothing', () => {
    const replaces = metaClaim('supersedes', c, AUTHOR);
    expect(showOf([c, replaces], lens, c)).toBe('hidden');
    expect(rowOf(applyPolicy([c, replaces], lens), c).why).toContain('replaced it');
    const back = metaClaim('retracts', replaces, AUTHOR);
    expect(showOf([c, replaces, back], lens, c)).toBe('plain');
  });
});

describe('responds', () => {
  const c = sourcedClaim();
  const answer = metaClaim('responds', c, POOL);
  const lenses: Lens[] = [DEFAULT_LENS, { kinds: ['observed'] }, { kinds: [], trusted: [] }];

  test('from the subject: beside the claim, under every lens', () => {
    for (const lens of lenses) {
      const shown = applyPolicy([c, answer], lens);
      expect(rowOf(shown, c).beside).toEqual([answer.id]);
      expect(rowOf(shown, answer).show).toBe('plain');
    }
    expect(rowOf(applyPolicy([c, answer], DEFAULT_LENS), c).show).toBe('hidden');
  });

  test('from anyone else: not beside it, and hidden unless trusted', () => {
    const other = metaClaim('responds', c, CHALLENGER);
    const shown = applyPolicy([c, other], DEFAULT_LENS);
    expect(rowOf(shown, c).beside).toEqual([]);
    expect(rowOf(shown, other).show).toBe('hidden');
    expect(rowOf(applyPolicy([c, other], { trusted: [CHALLENGER] }), other).show).toBe('plain');
  });

  test('an answer its author retracted is off the claim', () => {
    const back = metaClaim('retracts', answer, POOL);
    const shown = applyPolicy([c, answer, back], DEFAULT_LENS);
    expect(rowOf(shown, c).beside).toEqual([]);
    expect(rowOf(shown, answer).show).toBe('hidden');
  });

  test('an answer about a claim not in the set says so', () => {
    expect(rowOf(applyPolicy([answer], DEFAULT_LENS), answer)).toMatchObject({
      show: 'hidden',
      why: "It's about a claim that isn't in this set.",
    });
  });
});

describe('confidence', () => {
  const c = sourcedClaim();
  const lens: Lens = { kinds: ['sourced'], trusted: [AUTHOR, CLASSIFIER], minConfidence: 'medium' };

  test('never overwrites: the claim carries no rating', () => {
    const row = rowOf(applyPolicy([c, rating(c, 'high')], lens), c);
    expect(row.confidence).toEqual({ band: 'high', raters: 1 });
    expect(row.claim).toEqual(c);
    expect(JSON.stringify(row.claim)).not.toContain('band');
  });

  test('counts only from writers the lens trusts', () => {
    const outsider = rating(c, 'high', 'model:example/other@2');
    const row = rowOf(applyPolicy([c, outsider], lens), c);
    expect(row.show).toBe('hidden');
    expect(row.confidence).toBeUndefined();
    expect(row.why).toContain('nobody it trusts rated this');
  });

  test('the lowest rating stands, until its rater replaces it', () => {
    const low = rating(c, 'low');
    const high = rating(c, 'high');
    expect(rowOf(applyPolicy([c, low, high], lens), c).confidence?.band).toBe('low');
    const replaces = metaClaim('supersedes', low, CLASSIFIER);
    expect(rowOf(applyPolicy([c, low, high, replaces], lens), c).confidence?.band).toBe('high');
  });

  test('a low rating caveats, with no minimum set', () => {
    const open: Lens = { kinds: ['sourced'], trusted: [AUTHOR, CLASSIFIER] };
    expect(showOf([c, rating(c, 'low')], open, c)).toBe('caveated');
    expect(showOf([c, rating(c, 'high')], open, c)).toBe('plain');
  });

  test("doesn't apply to what a hash proves", () => {
    const chain = chainClaim();
    const strict: Lens = { kinds: ['observed'], minConfidence: 'high' };
    expect(showOf([chain], strict, chain)).toBe('plain');
  });
});

describe('kinds under a lens', () => {
  const infer = makeClaim({
    subject: POOL,
    verb: 'shares_signer',
    object: OWNER,
    qualifiers: { grounds: 'shared_signer' },
    issued_at: WHEN,
    kind: 'inferred',
    method: 'shares-signer@1',
    evidence: [{ snapshot_sha256: 'a'.repeat(64) }],
    by: CLASSIFIER,
  });

  test('inferred: hidden unless asked, and then always caveated', () => {
    expect(showOf([infer], DEFAULT_LENS, infer)).toBe('hidden');
    const asked: Lens = { kinds: ['observed', 'declared', 'inferred'], trusted: [CLASSIFIER] };
    const row = rowOf(applyPolicy([infer], asked), infer);
    expect(row.show).toBe('caveated');
    expect(row.why).toContain('with method shares-signer@1');
  });

  test('declared needs no trust: it is the account speaking of itself', () => {
    const own = makeClaim({
      subject: AUTHOR,
      verb: 'controls',
      object: OWNER,
      issued_at: WHEN,
      kind: 'declared',
      evidence: [],
      by: AUTHOR,
      proof: proofOf(AUTHOR),
    });
    expect(validateClaim(own).ok).toBe(true);
    expect(rowOf(applyPolicy([own], DEFAULT_LENS), own)).toMatchObject({
      show: 'plain',
      why: 'This account says this of itself.',
    });
  });

  test('sameness is a claim, never a merge: one side caveated, both sides plain, two accounts', () => {
    const says = (from: string, to: string) =>
      makeClaim({
        subject: from,
        verb: 'declares_same_controller',
        object: to,
        issued_at: WHEN,
        kind: 'declared',
        evidence: [],
        by: from,
        proof: proofOf(from),
      });
    const ab = says(AUTHOR, OWNER);
    const ba = says(OWNER, AUTHOR);
    expect(showOf([ab], DEFAULT_LENS, ab)).toBe('caveated');
    const both = applyPolicy([ab, ba], DEFAULT_LENS);
    expect(both.map((s) => s.show)).toEqual(['plain', 'plain']);
    expect(new Set(both.map((s) => s.claim.subject))).toEqual(new Set([AUTHOR, OWNER]));
  });
});

describe('the policy is pure', () => {
  test('order and repeats do not matter', () => {
    const { all } = fourClaims();
    const lens: Lens = { trusted: [AUTHOR, CHALLENGER] };
    const once = applyPolicy(all, lens);
    expect(applyPolicy([...all].reverse(), lens)).toEqual(once);
    expect(applyPolicy([...all, ...all], lens)).toEqual(once);
    expect(once).toHaveLength(all.length);
  });

  test('the lens is not touched, and an absent one means the default', () => {
    const { all } = fourClaims();
    expect(Object.isFrozen(DEFAULT_LENS)).toBe(true);
    expect(applyPolicy(all)).toEqual(applyPolicy(all, DEFAULT_LENS));
  });
});

describe('claimerRecord and aggregates', () => {
  const c = sourcedClaim();
  const d = sourcedClaim({ object: CHALLENGER });

  test('plain counts, no verdict', () => {
    const claims = [
      c,
      d,
      challenge(c),
      challenge(c, OWNER),
      metaClaim('challenges', c, CHALLENGER, '2026-11-06T00:00:00Z'),
      metaClaim('retracts', d, AUTHOR),
    ];
    const record = claimerRecord(claims, AUTHOR);
    expect(record).toEqual({
      by: AUTHOR,
      claims: 3,
      challenges_received: 3,
      challengers: 2,
      retractions: 1,
    });
    expect(Object.keys(record).sort()).toEqual([
      'by',
      'challengers',
      'challenges_received',
      'claims',
      'retractions',
    ]);
  });

  test("someone else's retraction isn't on the record, and repeats add nothing", () => {
    const record = claimerRecord([c, c, c, metaClaim('retracts', c, CHALLENGER)], AUTHOR);
    expect(record).toMatchObject({ claims: 1, retractions: 0 });
    expect(claimerRecord([c], CHALLENGER)).toMatchObject({ claims: 0, challenges_received: 0 });
  });

  test('key order in a value does not make a second fact', () => {
    const value = (object: Claim['object']) =>
      makeClaim({
        subject: POOL,
        verb: 'measured',
        object,
        qualifiers: { measure: 'num_blocks' },
        issued_at: WHEN,
        kind: 'observed',
        evidence: [{ snapshot_sha256: 'a'.repeat(64) }],
        by: READER,
      });
    const counts = distinctCounts([
      value({ value: '1', unit: 'blocks' }),
      value({ unit: 'blocks', value: '1' }),
    ]);
    expect(counts).toMatchObject({ rows: 2, claims: 1, facts: 1 });
  });

  test('a flood on one pair is one fact: raw counts would overcount', () => {
    const flood = Array.from({ length: 100 }, (_, i) =>
      sourcedClaim({ by: `near:mainnet:writer-${i}.example.near` }),
    );
    const other = sourcedClaim({ subject: OWNER });
    expect(distinctCounts([...flood, ...flood, other])).toEqual({
      rows: 201,
      claims: 101,
      facts: 2,
      subjects: 2,
    });
    expect(applyPolicy([...flood, ...flood], { trusted: 'everyone' })).toHaveLength(100);
  });
});

describe('claims read from a snapshot meet the policy', () => {
  test('the default lens shows chain reads plain, and leaves API reports off', () => {
    const shown = applyPolicy(observedClaims(tinyBackers()), DEFAULT_LENS);
    const byKind = (kind: string) => shown.filter((s) => s.claim.kind === kind);
    expect(byKind('observed').length).toBeGreaterThan(0);
    expect(byKind('observed').every((s) => s.show === 'plain')).toBe(true);
    expect(byKind('sourced').every((s) => s.show === 'hidden')).toBe(true);
  });

  test('a claim about a claim can reach a snapshot-read claim by its ref', () => {
    const [first] = observedClaims(tinyBackers());
    if (!first) throw new Error('no claims');
    expect(parseRef(claimRef(first.id))).toEqual({ ns: 'claim', id: first.id });
    expect(
      rowOf(applyPolicy([first, challenge(first)], { trusted: [CHALLENGER] }), first).show,
    ).toBe('contested');
  });
});

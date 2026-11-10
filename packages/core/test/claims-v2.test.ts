// claim/v2 (10 Nov, annotation-layer.md step 1): what a person or an agent adds about an account. A name, a
// note and a link, a person's own word, research as a ground, and a transaction, a proposal and a quote in
// the evidence. Names are allowed in a person's own project and refused for anything published (Elco's
// decision 1 (a)). Every account, name and URL here is invented.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { applyPolicy, DEFAULT_LENS, makeClaim, validateClaim } from '../src/claims/index.ts';
import type { Claim, ClaimDraft } from '../src/types/index.ts';
import { AUTHOR, chainClaim, OWNER, POOL, proofOf, READER, WHEN } from './claims-fixture.ts';

const TX = `0x${'ab'.repeat(32)}`;
const SOURCE = {
  url: `https://gnosisscan.io/tx/${TX}`,
  tx: `eip155:100:${TX}`,
  proposal: 'proposal:eip155:100:0x2222222222222222222222222222222222222222:7',
  quote: 'Elect Ada as Keeper of the Handbook',
};
const annotation = (overrides: Partial<ClaimDraft> = {}): Claim =>
  makeClaim(
    {
      subject: POOL,
      verb: 'named',
      object: { value: 'Ada' },
      issued_at: WHEN,
      kind: 'sourced',
      evidence: [SOURCE],
      by: AUTHOR,
      via: 'tool:codex@2026-11-10',
      ...overrides,
    },
    'claim/v2',
  );
const kept = (c: unknown) => validateClaim(c, { private: true });
const rules = (r: ReturnType<typeof validateClaim>) => (r.ok ? [] : r.errors.map((e) => e.rule));

describe('claim/v2: what a person or an agent adds', () => {
  test('the pinned fixture is a name kept in a person own project, refused for publishing', () => {
    const file = join(import.meta.dirname, '..', 'schema', 'fixtures', 'claim.v2.json');
    const fixture = JSON.parse(readFileSync(file, 'utf8')) as Claim;
    expect(kept(fixture)).toEqual({ ok: true, value: fixture });
    // the name itself, and the quote that names someone
    expect(rules(validateClaim(fixture))).toEqual(['no_free_text_name', 'no_free_text_name']);
  });

  test('a name, a note and a link: kept privately; published, only the link without a name passes', () => {
    const name = annotation();
    const note = annotation({ verb: 'noted', object: { value: 'Ada Byron keeps the handbook.' } });
    const link = annotation({ verb: 'linked', object: { value: 'https://example.org/ada' } });
    for (const c of [name, note, link]) expect(kept(c).ok).toBe(true);
    const bare = { url: SOURCE.url, tx: SOURCE.tx };
    expect(rules(validateClaim(annotation({ evidence: [bare] })))).toEqual(['no_free_text_name']);
    expect(rules(validateClaim(annotation({ ...note, evidence: [bare] })))).toEqual([
      'no_free_text_name',
    ]);
    const { id: _id, petal: _p, ...linkDraft } = link;
    expect(validateClaim(annotation({ ...linkDraft, evidence: [bare] })).ok).toBe(true);
  });

  test('each object fits its verb', () => {
    const bad = (object: ClaimDraft['object'], verb: ClaimDraft['verb'] = 'named') =>
      rules(kept(annotation({ verb, object })));
    expect(bad({ value: 'Ada\nByron' })).toEqual(['object_for_verb']);
    expect(bad({ value: ' Ada' })).toEqual(['object_for_verb']);
    expect(bad({ value: 'x'.repeat(129) })).toEqual(['object_for_verb']);
    expect(bad({ value: 'Ada', unit: 'NEAR' })).toEqual(['object_for_verb']);
    expect(bad(OWNER)).toEqual(['object_for_verb']);
    expect(bad({ value: '   ' }, 'noted')).toEqual(['object_for_verb']);
    expect(bad({ value: 'example.org/ada' }, 'linked')).toEqual(['object_for_verb']);
  });

  test("stated is a person's own word: their account answers for it, a tool can't", () => {
    const own = annotation({ kind: 'stated', evidence: [], via: 'model:example/agent@1' });
    expect(kept(own).ok).toBe(true);
    expect(rules(kept(annotation({ kind: 'stated', evidence: [], by: READER })))).toContain(
      'stated',
    );
  });

  test('sourced needs its URL; inferred needs a method and grounds, and research is a ground', () => {
    expect(rules(kept(annotation({ evidence: [{ tx: SOURCE.tx, quote: SOURCE.quote }] })))).toEqual(
      ['evidence'],
    );
    const inferred = (o: Partial<ClaimDraft>) =>
      annotation({ kind: 'inferred', method: 'codex/research@2026-11-10', ...o });
    expect(kept(inferred({ qualifiers: { grounds: 'research' } })).ok).toBe(true);
    expect(rules(kept(inferred({})))).toEqual(['inferred']);
  });

  test('a proposal in the evidence is a proposal ref, and a transaction names its chain', () => {
    expect(rules(kept(annotation({ evidence: [{ ...SOURCE, proposal: POOL }] })))).toEqual([
      'evidence',
    ]);
    expect(rules(kept(annotation({ evidence: [{ ...SOURCE, tx: TX }] })))).toEqual(['schema']);
  });

  test('the vocabulary holds everywhere, a person own project included', () => {
    const quote = { ...SOURCE, quote: 'Ada reported the scam' };
    expect(rules(kept(annotation({ evidence: [quote] })))).toEqual(['vocabulary']);
    expect(rules(kept(annotation({ verb: 'noted', object: { value: 'a sybil ring' } })))).toEqual([
      'vocabulary',
    ]);
    expect(rules(kept(annotation({ subject: 'person:ada' })))).toContain('no_natural_person');
  });
});

/** A claim's draft, without its version and id. */
const draftOf = (c: Claim): ClaimDraft => {
  const { id: _id, petal: _p, ...draft } = c;
  return draft;
};

describe('claim/v1 stays as it was', () => {
  const asV1 = (c: Claim) => {
    const { id: _id, petal: _p, ...draft } = c;
    return makeClaim(draft);
  };

  test("v1 can't use what v2 added: verbs, stated, research, and the new evidence", () => {
    expect(rules(kept(asV1(annotation())))).toContain('schema');
    const sourced = chainClaim({ kind: 'sourced', evidence: [{ url: SOURCE.url }] });
    const { id: _i, petal: _pp, ...draft } = sourced;
    expect(rules(kept(makeClaim({ ...draft, kind: 'stated' })))).toContain('schema');
    expect(rules(kept(makeClaim({ ...draft, evidence: [SOURCE] })))).toContain('schema');
    const moves = makeClaim({
      subject: POOL,
      verb: 'moves_with',
      object: OWNER,
      qualifiers: { grounds: 'research' },
      issued_at: WHEN,
      kind: 'inferred',
      method: 'moves-with@1',
      evidence: [{ snapshot_sha256: 'a'.repeat(64) }],
      by: AUTHOR,
    });
    expect(rules(validateClaim(moves))).toEqual(['qualifier']);
    expect(validateClaim(makeClaim(draftOf(moves), 'claim/v2')).ok).toBe(true);
  });

  test('a chain read is still v1, with the same id', () => {
    const c = chainClaim();
    expect(c.petal).toBe('claim/v1');
    expect(c.id).toBe('7ae8e42a82da887b85d2d27b936ce89f75b4b77e0aeacafb5e3935126c5246c2');
    expect(validateClaim(c).ok).toBe(true);
  });
});

describe('the policy reads stated', () => {
  test("hidden from a new reader; plain from a writer they trust, in words that don't cite a source", () => {
    const own = annotation({ kind: 'stated', evidence: [] });
    const [hidden] = applyPolicy([own]);
    expect(hidden?.show).toBe('hidden');
    expect(DEFAULT_LENS.kinds).not.toContain('stated');
    const [shown] = applyPolicy([own], { trusted: [AUTHOR] });
    expect(shown).toMatchObject({ show: 'plain' });
    expect(shown?.why).toBe(`Said by ${AUTHOR} on their own word, and this lens trusts them.`);
  });

  test('a declared name needs its proof, as any declared claim does', () => {
    const self = annotation({ kind: 'declared', by: POOL, evidence: [] });
    expect(rules(kept(self))).toEqual(['declared']);
    expect(kept({ ...self, proof: proofOf(POOL) }).ok).toBe(true);
  });
});

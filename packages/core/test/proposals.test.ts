// proposals/v2 (11 Nov): v1 and an outcome its source doesn't state, each proposal's
// recipient and options, and a ballot's choices and weights as said. v1 still reads. Nothing guessed.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { validateProposals } from '../src/proposals.ts';

const fixture = (v: 1 | 2 | 3) =>
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, '..', 'schema', 'fixtures', `proposals.v${v}.json`),
      'utf8',
    ),
  );

describe('proposals/v2', () => {
  test("House of Stake Ops' proposals, read as v2: each Transfer names whom it pays; v1 still reads", () => {
    const v2 = fixture(2);
    expect(validateProposals(v2).ok).toBe(true);
    expect(v2.petal).toBe('proposals/v2');
    const transfers = v2.proposals.filter((p: { kind: string }) => p.kind === 'Transfer');
    expect(transfers.length).toBeGreaterThan(0);
    for (const p of transfers) expect(typeof p.recipient).toBe('string');
    expect(validateProposals(fixture(1)).ok).toBe(true);
  });

  test("a closed vote whose result isn't said, its options, and a weighted ballot's choices; a null vote shows what it chose", () => {
    const v2 = fixture(2);
    const base = v2.proposals[0];
    const ballot = {
      account: '0xaaaa000000000000000000000000000000000001',
      vote: null,
      choices: [
        { choice: 'Option A', weight: '12345678901234567890.5' },
        { choice: 'Option B', weight: '1' },
      ],
      power: '12345678901234567891.5',
      as_said: 'weighted',
      at: null,
    };
    const closed = {
      ...base,
      outcome: 'closed',
      as_said: 'closed',
      options: ['Option A', 'Option B'],
      votes: [ballot],
    };
    expect(validateProposals({ ...v2, proposals: [closed] }).ok).toBe(true);
    // a null vote without its choices says nothing: refused
    const { choices: _c, ...silent } = ballot;
    expect(validateProposals({ ...v2, proposals: [{ ...closed, votes: [silent] }] }).ok).toBe(
      false,
    );
    // weights are decimal text, never a JSON number
    const numeric = { ...ballot, choices: [{ choice: 'Option A', weight: 1.5 }] };
    expect(validateProposals({ ...v2, proposals: [{ ...closed, votes: [numeric] }] }).ok).toBe(
      false,
    );
    // v1 has no closed
    expect(
      validateProposals({
        ...fixture(1),
        proposals: [{ ...fixture(1).proposals[0], outcome: 'closed' }],
      }).ok,
    ).toBe(false);
  });
});

describe('proposals/v3', () => {
  test("the Near Africa Community DAO's proposals: each with its own text and, where its text names one, a link that says so; v2 still reads", () => {
    const v3 = fixture(3);
    expect(validateProposals(v3).ok).toBe(true);
    expect(v3.petal).toBe('proposals/v3');
    const linked = v3.proposals.filter((p: { link: unknown }) => p.link);
    expect(linked.length).toBeGreaterThan(0);
    for (const p of linked) expect(p.link.kind).toBe('named in its text');
    expect(validateProposals(fixture(2)).ok).toBe(true);
  });

  test('a link is a web address and says its kind; summary and link are both there, null when none', () => {
    const v3 = fixture(3);
    const base = v3.proposals[0];
    const withLink = (link: unknown) => ({ ...v3, proposals: [{ ...base, link }] });
    expect(
      validateProposals(
        withLink({ url: 'https://snapshot.org/#/x/proposal/1', kind: 'where it was made' }),
      ).ok,
    ).toBe(true);
    expect(validateProposals(withLink({ url: 'https://x.org', kind: 'somewhere' })).ok).toBe(false);
    expect(
      validateProposals(withLink({ url: 'javascript:alert(1)', kind: 'named in its text' })).ok,
    ).toBe(false);
    const { summary: _s, ...noSummary } = base;
    expect(validateProposals({ ...v3, proposals: [noSummary] }).ok).toBe(false);
  });
});

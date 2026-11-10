// Codex's research as claim/v2 annotations (codex-claims.ts). Invented rows in Codex's own columns: the real
// CSV names real people, so it stays on the person's computer.
import { validateClaim } from '@petal/core';
import { describe, expect, test } from 'vitest';
import { codexClaims, csvRows } from '../codex-claims.ts';

const TX = `0x${'AB'.repeat(32)}`;
const CSV = [
  'address,name,kind,link,proposal,transaction,quote,quote_source,basis,status',
  `0x1111111111111111111111111111111111111111,Ada,person/handle claim,explicit,7,${TX},"Elect Ada as Keeper, Q1 ""2026""",https://gnosisscan.io/tx/${TX},Incoming wearer.,passed; action succeeded`,
  `0x2222222222222222222222222222222222222222,Guild Treasury,organization / role / escrow,inferred,9,${TX},Fund the treasury,https://github.com/example/rips/issues/9,"Named destination;
two lines",cancelled`,
  `not-an-address,Nobody,person/handle claim,explicit,1,${TX},x,https://example.org,y,passed`,
].join('\r\n');
const BY = 'near:mainnet:reed.example.near';
const AT = '2026-11-10T12:00:00Z';

describe("Codex's CSV as annotations", () => {
  test('quoted fields keep their commas, quotes and line breaks', () => {
    const rows = csvRows(CSV);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.quote).toBe('Elect Ada as Keeper, Q1 "2026"');
    expect(rows[1]?.basis).toBe('Named destination;\ntwo lines');
  });

  test('a row a proposal names is sourced; one Codex worked out is inferred, from research', () => {
    const { claims, refused } = codexClaims(CSV, BY, AT);
    expect(claims.map((c) => [c.kind, c.object])).toEqual([
      ['sourced', { value: 'Ada' }],
      ['inferred', { value: 'Guild Treasury' }],
    ]);
    expect(claims[0]).toMatchObject({
      petal: 'claim/v2',
      subject: 'eip155:100:0x1111111111111111111111111111111111111111',
      verb: 'named',
      by: BY,
      via: 'tool:codex@2026-11-10',
      evidence: [
        {
          url: `https://gnosisscan.io/tx/${TX}`,
          tx: `eip155:100:${TX.toLowerCase()}`,
          proposal: 'proposal:eip155:100:0xf02fd4286917270cb94fbc13a0f4e1ed76f7e986:7',
          quote: 'Elect Ada as Keeper, Q1 "2026"',
          note: 'Incoming wearer. Proposal passed; action succeeded.',
        },
      ],
    });
    expect(claims[1]).toMatchObject({
      method: 'codex/research@2026-11-10',
      qualifiers: { grounds: 'research' },
    });
    // kept in a person's own project; a name is never published yet
    for (const c of claims) {
      expect(validateClaim(c, { private: true }).ok).toBe(true);
      expect(validateClaim(c).ok).toBe(false);
    }
    expect(refused).toEqual([
      { row: 3, name: 'Nobody', why: ['not an address on eip155:100: not-an-address'] },
    ]);
  });

  test('the same file gives the same ids', () => {
    const ids = (csv: string) => codexClaims(csv, BY, AT).claims.map((c) => c.id);
    expect(ids(CSV)).toEqual(ids(CSV));
  });
});

// What's said about a petal's account (annotation-layer.md, steps 3 and 7): each claim with what it says,
// how it's known, where it rests and who said it; never "verified".
import { describe, expect, test } from 'vitest';
import { type AnnotationRow, claimLines, noteDraft, whoSaid } from '../lib/claim-lines.ts';

const ABOUT = 'eip155:100:0x68f2aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa8379';
const row = (
  claim: Partial<AnnotationRow['claim']>,
  at = '2026-11-11T10:00:00Z',
): AnnotationRow => ({
  claim: { subject: ABOUT, verb: 'named', object: { value: 'Tae' }, kind: 'sourced', ...claim },
  exploration: null,
  added_at: at,
});

describe('what the box says of each claim', () => {
  test('a name, sourced in a proposal, with its quote and link, by an own agent', () => {
    const [line] = claimLines(
      [
        row({
          by: 'tool:codex@1',
          evidence: [
            {
              proposal: 'proposal:eip155:100:168',
              quote: 'Elect Tae as Keeper',
              url: 'https://gnosisscan.io/tx/0xab',
            },
          ],
        }),
      ],
      ABOUT,
    );
    expect(line).toMatchObject({
      says: 'Named Tae',
      kind: 'sourced',
      rests: 'in proposal #168',
      quote: 'Elect Tae as Keeper',
      source: 'https://gnosisscan.io/tx/0xab',
      who: 'Codex',
    });
  });

  test('only this account’s names, notes and links; nothing says verified', () => {
    const lines = claimLines(
      [
        row({ verb: 'noted', object: { value: 'Pays the hosting.' }, kind: 'stated' }),
        row({ subject: 'eip155:100:0xother' }),
        row({ verb: 'holds', object: { value: '10' } }),
        row({ verb: 'linked', object: { value: 'https://raidguild.org' }, kind: 'stated' }),
      ],
      ABOUT,
    );
    expect(lines.map((l) => l.says)).toEqual(['Pays the hosting.', 'A link']);
    expect(lines[1]?.link).toBe('https://raidguild.org');
    expect(JSON.stringify(lines)).not.toMatch(/verified/i);
    expect(claimLines([row({})], null)).toEqual([]);
  });

  test('who said it: Petals’ agent, an own agent, or the person', () => {
    expect(whoSaid({ by: 'near:mainnet:elco.near', via: 'tool:petals-agent@1' })).toBe(
      "Petals' agent",
    );
    expect(whoSaid({ by: 'tool:claude-code@1' })).toBe('Claude Code');
    expect(whoSaid({ by: 'near:mainnet:elco.near' })).toBe('you');
  });
});

describe('what the page adds', () => {
  test('a note or a name, stated, resting on the person’s word alone', () => {
    expect(noteDraft(ABOUT, '  Dekan  ', 'name')).toEqual({
      subject: ABOUT,
      verb: 'named',
      object: { value: 'Dekan' },
      kind: 'stated',
      evidence: [],
    });
    expect(noteDraft(ABOUT, 'A note', 'note').verb).toBe('noted');
  });
});

// What Petals' own mapping says about a map's accounts, as the overlay says it (lib/map-claims.ts), on real
// claims (lab/map-claims-fixtures.ts, SYSTEMS's samples).
import { describe, expect, test } from 'vitest';
import { LAB_CLAIM_NAMES, LAB_MAP_CLAIMS } from '../lab/map-claims-fixtures.ts';
import { claimWho, mapClaimGroups, noteOf, toolOf, wordsOf } from '../lib/map-claims.ts';

describe("the mapping's claims, in words", () => {
  test('who said it: the tool or the model by its name', () => {
    expect(toolOf('tool:codex-solana-wave@1')).toBe('codex-solana-wave');
    expect(toolOf('tool:dao-set-near-direct@2026-11-11')).toBe('dao-set-near-direct');
    expect(toolOf('model:glm@unreported')).toBe('glm');
    expect(toolOf('near:mainnet:someone.near')).toBeNull();
  });

  test('who answers for it: a person who published it by their account, else Petals’ mapping', () => {
    expect(claimWho('near:mainnet:raidguild-scribe.near')).toBe('raidguild-scribe.near');
    expect(claimWho('tool:codex-solana-wave@1')).toBe("Petals' mapping");
    expect(claimWho('model:gpt-6-astra@unreported')).toBe("Petals' mapping");
    expect(claimWho(undefined)).toBe("Petals' mapping");
  });

  test("a note that's a record says its words, its kind, and the rest as parts", () => {
    const n = noteOf(
      '{"type":"valuation-scope","asset":"NEAR","meaning":"Known-amount price estimate only.","pricing_time":"2026-11-11T16:00:31.435Z"}',
    );
    expect(n.says).toBe('Known-amount price estimate only.');
    expect(n.tag).toBe('valuation scope');
    expect(n.more).toEqual([
      ['asset', 'NEAR'],
      ['pricing time', '2026-11-11T16:00:31.435Z'],
    ]);
    const v = noteOf(
      '{"type":"technical-form","value":"Sputnik policy","basis":"its policy","limits":"not who"}',
    );
    expect([v.says, v.basis, v.limits]).toEqual(['Sputnik policy', 'its policy', 'not who']);
    expect(noteOf('Plain words.')).toEqual({ says: 'Plain words.', more: [] });
  });

  test('one group per account, oldest first, the picked one first, never "verified"', () => {
    const groups = mapClaimGroups(LAB_MAP_CLAIMS, LAB_CLAIM_NAMES);
    expect(groups.reduce((n, g) => n + g.lines.length, 0)).toBe(LAB_MAP_CLAIMS.length);
    const last = groups.at(-1)?.account ?? null;
    expect(mapClaimGroups(LAB_MAP_CLAIMS, LAB_CLAIM_NAMES, last)[0]?.account).toBe(last);
    const lines = groups.flatMap((g) => g.lines);
    expect(lines.every((l) => l.who === "Petals' mapping" && l.kind !== 'verified')).toBe(true);
    const inferred = lines.find((l) => l.kind === 'inferred');
    expect(inferred?.method).toBe('retained-ballot-pair-agreement@1');
    expect(inferred?.evidence[0]?.found).toMatch(/^found by codex-solana-wave, 11 Nov 2026$/);
  });

  test('long addresses and hashes in the words read as their ends, whole on hover', () => {
    const w = wordsOf(
      'Ballots: 8HVYKgq2PA4SCDuPZSfHBH1aupTBJYPVru6kq3UfuSX9 and 0xf02fd4286917270cb94fbc13a0f4e1ed76f7e986 agree.',
    );
    expect(w.map((x) => x.text).join('')).toBe('Ballots: 8HVYKg…uSX9 and 0xf02f…e986 agree.');
    expect(w[1]?.whole).toBe('8HVYKgq2PA4SCDuPZSfHBH1aupTBJYPVru6kq3UfuSX9');
    expect(wordsOf('Plain words, no addresses.')).toEqual([{ text: 'Plain words, no addresses.' }]);
  });
});

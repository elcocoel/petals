// Server only. Names for the outline bench (annotation-layer.md, step 7; Elco's (b), 11 Nov): made-up
// annotations on a real DAO's largest accounts, so the outline has a person's name_kind to show. Every name
// says it's a sample. Each kind of claim appears, in turn, so the bench shows a value past the outline's three.
import type { Claim, ClaimDraft } from '@petal/core/types';

const KINDS = ['sourced', 'inferred', 'stated', 'declared'] as const;
/** How many accounts get a sample name. */
const NAMED = 8;
const LETTERS = 'ABCDEFGH';

/**
 * The bench's sample claims about a flower's largest accounts (its petals' ids, largest first, on its chain),
 * made with core's own makeClaim.
 */
export function sampleClaims(
  chain: string,
  largest: readonly string[],
  makeClaim: (draft: ClaimDraft, petal: Claim['petal']) => Claim,
): Claim[] {
  return largest.slice(0, NAMED).map((id, i) => {
    const kind = KINDS[i % KINDS.length] as (typeof KINDS)[number];
    return makeClaim(
      {
        subject: `${chain}:${id}`,
        verb: 'named',
        object: { value: `Sample ${LETTERS[i]}` },
        issued_at: '2026-11-11T12:00:00Z',
        kind,
        evidence: kind === 'sourced' ? [{ url: 'https://example.org/sample' }] : [],
        by: 'near:mainnet:lab.example.near',
        ...(kind === 'inferred'
          ? { method: 'lab/sample@2026-11-11', qualifiers: { grounds: 'research' } }
          : {}),
      } as ClaimDraft,
      'claim/v2',
    );
  });
}

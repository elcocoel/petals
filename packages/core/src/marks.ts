// mark/v1: what tells one
// organisation on the map from another, its name, its token's symbol and its logo, each saying where it came
// from. One per map, named by the map's address. Reading one is @petal/inputs' (marks/); this is the format.
import type { Claim } from './claims/types.ts';
import { createAjv, schemaId } from './schema/ajv.ts';
import type { Result, ValidationIssue } from './types/index.ts';

/** mark/v2 since 11 Nov: mark/v1 with its types, as is_a claims. v1 still reads. */
export const MARK_VERSION = 'mark/v2';

/** self-declared: the thing says it of itself. verified: a curated list holds the address. inferred: Petals' own. */
export type MarkStatus = 'self-declared' | 'verified' | 'inferred';

/** One part of a mark, said somewhere. */
export interface MarkSaid {
  value: string;
  status: MarkStatus;
  /** where, in a word: chain, poster, daohaus, metaplex, ft_metadata, trustwallet, uniswap, coingecko, … */
  source: string;
  /** exactly where: the call, or the list and its version, or the page */
  ref: string;
  /** the curated lists that hold this address, each with its version */
  verified_by?: string[];
  at: string;
}

/** A logo, kept by Petals as a picture named by its sha256. */
export interface MarkLogo {
  sha256: string;
  media_type: 'image/png' | 'image/jpeg' | 'image/webp';
  status: MarkStatus;
  source: string;
  ref: string;
  at: string;
}

export interface Mark {
  petal: 'mark/v1' | typeof MARK_VERSION;
  /** the map's address: chain:address, or chain:population */
  about: string;
  name: MarkSaid | null;
  symbol: MarkSaid | null;
  logo: MarkLogo | null;
  /** v2: its types, each an is_a claim (claim/v4) about its own address, in the order found */
  types?: Claim[];
  read_at: string;
}

const compiled = new Map<string, ReturnType<ReturnType<typeof createAjv>['getSchema']>>();

export function validateMark(x: unknown): Result<Mark> {
  const name = (x as { petal?: unknown } | null)?.petal === 'mark/v1' ? 'mark' : 'markV2';
  if (!compiled.has(name)) compiled.set(name, createAjv().getSchema(schemaId(name)));
  const v = compiled.get(name);
  if (!v) throw new Error('mark schema not registered');
  if (v(x)) return { ok: true, value: x as Mark };
  return {
    ok: false,
    errors: (v.errors ?? []).slice(0, 30).map(
      (e): ValidationIssue => ({
        path: e.instancePath,
        rule: 'schema',
        message: e.message ?? 'invalid',
      }),
    ),
  };
}

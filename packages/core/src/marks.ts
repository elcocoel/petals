// mark/v1 (board #85; research/org-names-logos-2026-11-11.md, strategy 2, Elco's pick, 11 Nov): what tells one
// organisation on the map from another, its name, its token's symbol and its logo, each saying where it came
// from. One per map, named by the map's address. Reading one is @petal/inputs' (marks/); this is the format.
import { createAjv, schemaId } from './schema/ajv.ts';
import type { Result, ValidationIssue } from './types/index.ts';

export const MARK_VERSION = 'mark/v1';

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
  petal: typeof MARK_VERSION;
  /** the map's address: chain:address, or chain:population */
  about: string;
  name: MarkSaid | null;
  symbol: MarkSaid | null;
  logo: MarkLogo | null;
  read_at: string;
}

let compiled: ReturnType<ReturnType<typeof createAjv>['getSchema']> | undefined;

/** The mark, typed, or every reason it isn't one. */
export function validateMark(x: unknown): Result<Mark> {
  if (!compiled) compiled = createAjv().getSchema(schemaId('mark'));
  const v = compiled;
  if (!v) throw new Error('mark schema not registered');
  if (v(x)) return { ok: true, value: x as Mark };
  return {
    ok: false,
    errors: (v.errors ?? []).map(
      (e): ValidationIssue => ({
        path: e.instancePath,
        rule: 'schema',
        message: e.message ?? 'invalid',
      }),
    ),
  };
}

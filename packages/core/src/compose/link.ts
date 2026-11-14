// link/v1 (specs/005-mapping-brain/composition.md, section 2c): a profile's master key is its NEAR account; an
// Ethereum or Solana wallet joins it the way a social account does, proving once, with its own signature, that it
// belongs to it. The text the wallet signs names both and the link's hash without its proof; the link goes public
// in the profile's own publication about its own account, which NEAR signs. Pure: the wallet's signature itself
// is checked where the chains' checks live (@petal/near/auth/wallets.ts).
import { canonicalJson, sha256Hex } from '../hash.ts';
import { createAjv, schemaId } from '../schema/ajv.ts';
import type { Result, ValidationIssue } from '../types/index.ts';

export const LINK_VERSION = 'link/v1';

export interface Link {
  petal: typeof LINK_VERSION;
  /** the NEAR account the wallet belongs to, CAIP-10 */
  profile: string;
  /** the linked wallet, CAIP-10 */
  wallet: string;
  linked_at: string;
  proof: { standard: 'eip191' | 'ed25519'; message: string; signature: string };
}

let compiled: ReturnType<ReturnType<typeof createAjv>['getSchema']> | undefined;

/** The link, typed, or every reason it isn't one. */
export function validateLink(x: unknown): Result<Link> {
  compiled ??= createAjv().getSchema(schemaId('link'));
  if (!compiled) throw new Error('link schema not registered');
  if (compiled(x)) return { ok: true, value: x as Link };
  return {
    ok: false,
    errors: (compiled.errors ?? []).map(
      (e): ValidationIssue => ({
        path: e.instancePath,
        rule: 'schema',
        message: e.message ?? 'invalid',
      }),
    ),
  };
}

/** A link's name in its text: the hash of its canonical JSON without its proof, so the signature covers the rest. */
export const linkHash = (l: Omit<Link, 'proof'> & { proof?: unknown }) => {
  const { proof: _, ...rest } = l;
  return sha256Hex(canonicalJson(rest));
};

/** An account as people read it: the last part of its CAIP-10. */
const bare = (caip10: string) => caip10.split(':').at(-1) ?? caip10;

/** The statement the wallet signs, one line: both accounts by name, and the link's hash. */
export const linkStatement = (l: Omit<Link, 'proof'>) =>
  `Petals: ${bare(l.wallet)} belongs to ${bare(l.profile)}. Link ${linkHash(l)}`;

/** Does this text carry this link's statement, on a line of its own, as the wallet signed it? */
export const textNamesLink = (text: string, l: Omit<Link, 'proof'>) =>
  text.split('\n').some((line) => line.trim() === linkStatement(l));

/** The link a signed text states, if it states one: its two accounts by name and its hash. */
export function linkStated(text: string): { wallet: string; profile: string; hash: string } | null {
  for (const line of text.split('\n')) {
    const m = /^Petals: (\S+) belongs to (\S+)\. Link ([0-9a-f]{64})$/.exec(line.trim());
    if (m) return { wallet: m[1] as string, profile: m[2] as string, hash: m[3] as string };
  }
  return null;
}

// Canonical JSON and fingerprints (T015; research R4).
// RFC 8785 (JCS) canonical JSON, SHA-256 over its UTF-8 bytes. Built on @noble/hashes, not
// node:crypto, because apps/web imports core and it must run in the browser too.
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import canonicalize from 'canonicalize';
import type { EntryWithoutId, Spec } from './types/index.ts';

/** RFC 8785 canonical JSON. Throws on values JSON cannot carry (undefined, NaN, Infinity). */
export function canonicalJson(value: unknown): string {
  const out = canonicalize(value);
  if (out === undefined) throw new TypeError('canonicalJson: value has no JSON form');
  return out;
}

/** Lower-case hex SHA-256. Strings are hashed as UTF-8. */
export function sha256Hex(bytes: Uint8Array | string): string {
  return bytesToHex(sha256(typeof bytes === 'string' ? utf8ToBytes(bytes) : bytes));
}

/** spec_sha256: SHA-256 of the canonical spec. */
export function specHash(spec: Spec): string {
  return sha256Hex(canonicalJson(spec));
}

/**
 * What an entry's id and the maker's signature cover (shared-map.md, Entry versions). flower/v1:
 * all of it but `id`, the hash of its drawing included. flower/v2: `drawn_with` stays out too, so
 * the same facts drawn by another renderer are the same flower. An `id` passed by mistake is
 * ignored, so a stored entry can be checked against its own id.
 */
export function signedPart(entry: EntryWithoutId): object {
  const { id: _ignored, ...rest } = entry as EntryWithoutId & { id?: string };
  if (rest.petal !== 'flower/v2') return rest;
  const { drawn_with: _receipt, ...signed } = rest;
  return signed;
}

/** A flower's id: the first 24 hex characters of SHA-256 over its canonical signed part. */
export function entryId(entryWithoutId: EntryWithoutId): string {
  return sha256Hex(canonicalJson(signedPart(entryWithoutId))).slice(0, 24);
}

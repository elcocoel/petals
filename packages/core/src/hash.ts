// Canonical JSON and fingerprints (T015; research R4).
// RFC 8785 (JCS) canonical JSON, SHA-256 over its UTF-8 bytes. Built on @noble/hashes, not
// node:crypto, because apps/web imports core and it must run in the browser too.
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import canonicalize from 'canonicalize';
import type { Entry, Spec } from './types/index.ts';

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
 * A flower's id: the first 24 hex characters of SHA-256 over the canonical entry without `id`.
 * An `id` passed by mistake is ignored, so a stored entry can be checked against its own id.
 */
export function entryId(entryWithoutId: Omit<Entry, 'id'>): string {
  const { id: _ignored, ...rest } = entryWithoutId as Omit<Entry, 'id'> & { id?: string };
  return sha256Hex(canonicalJson(rest)).slice(0, 24);
}

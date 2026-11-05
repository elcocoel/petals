// Checks a reader makes on every flower entry (shared-map.md, Trust and verification): the id and
// spec hash are recomputed, and the maker's NEP-413 signature is checked with the stored public
// key. Signature only, no RPC: a key removed later does not unsign an old flower. The full check
// at publish time (fresh nonce, full-access key) is verifyNep413 in @petal/near/auth.
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { canonicalJson, entryId, sha256Hex, signedPart, specHash } from '@petal/core';
import type { Entry, EntryWithoutId, Nep413Proof } from '@petal/core/types';
import { base58, base64 } from '@scure/base';

/** 2^31 + 413, the NEP-413 prefix tag. */
const NEP413_TAG = 2147484061;

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}
function str(s: string): Uint8Array {
  const bytes = utf8ToBytes(s);
  return concat(u32(bytes.length), bytes);
}

/** sha256(borsh(tag) || borsh({ message, nonce: [u8; 32], recipient, callbackUrl: None })) */
function nep413Hash(message: string, nonce: Uint8Array, recipient: string): Uint8Array {
  return sha256(concat(u32(NEP413_TAG), str(message), nonce, str(recipient), new Uint8Array([0])));
}

/** True when `proof` is an ed25519 NEP-413 signature over exactly this message and recipient. */
export function nep413SignatureOk(
  proof: Nep413Proof,
  expect: { message: string; recipient: string },
): boolean {
  if (proof.message !== expect.message || proof.recipient !== expect.recipient) return false;
  if (!proof.public_key.startsWith('ed25519:')) return false;
  try {
    const nonce = base64.decode(proof.nonce);
    if (nonce.length !== 32) return false;
    return ed25519.verify(
      base64.decode(proof.signature),
      nep413Hash(expect.message, nonce, expect.recipient),
      base58.decode(proof.public_key.slice('ed25519:'.length)),
    );
  } catch {
    return false;
  }
}

/** A draft entry: no id, no maker yet. This is what the maker signs (prepare_publish). */
export type DraftEntry = EntryWithoutId;

/** Normalise an entry or draft to the signed form: `id` dropped, `provenance.maker` null. */
export function draftOf(entry: Partial<Entry> | DraftEntry): DraftEntry {
  const { id: _id, ...rest } = entry as Entry;
  return { ...rest, provenance: { ...rest.provenance, maker: null } };
}

/** entry_sha256: SHA-256 of the canonical signed part of the draft (maker null). */
export function entrySha256(entry: Partial<Entry> | DraftEntry): string {
  return sha256Hex(canonicalJson(signedPart(draftOf(entry))));
}

/** The exact text a maker signs with NEP-413 to publish (shared-map.md, Writing). */
export function publishMessage(entry_sha256: string): string {
  return JSON.stringify({ petal: 'publish/v1', entry_sha256 });
}

export interface Verified {
  entry_hash: boolean;
  maker_signature: boolean;
  model_signature: 'present' | 'absent';
}

/** Recompute id and spec hash; check the maker's signature over this entry's hash, by its version. */
export function verifyEntry(
  entry: Entry,
  opts: { id?: string; recipient?: string } = {},
): Verified {
  let entry_hash = false;
  try {
    entry_hash =
      entry.id === entryId(entry) &&
      (opts.id === undefined || opts.id === entry.id) &&
      entry.spec_sha256 === specHash(entry.spec);
  } catch {
    entry_hash = false;
  }
  const maker = entry.provenance?.maker ?? null;
  let maker_signature = false;
  if (maker) {
    const recipient = opts.recipient ?? maker.recipient;
    maker_signature = nep413SignatureOk(maker, {
      message: publishMessage(entrySha256(entry)),
      recipient,
    });
  }
  return {
    entry_hash,
    maker_signature,
    model_signature: entry.provenance?.agent?.signature ? 'present' : 'absent',
  };
}

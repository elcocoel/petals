// EntityRef: one thing, one spelling, so a claim's hash is stable and two things never collide.
//
//   near:mainnet:alice.near     an account or contract: CAIP-10, strict. `_` is written %5F, because
//   eip155:1:0xabc…             CAIP-10 allows only [-.%a-zA-Z0-9] there. EVM is lower case; base58
//   solana:5eyk…:Abc…           is never touched. The same address on two chains is two refs.
//   group:<sha256>:<key>        a group, scoped to one snapshot: `group:*` ids repeat across
//                               snapshots with unrelated meanings.
//   asset:<caip2>:<key>         an asset. `NEAR` on NEAR is not the account `near`.
//   proposal:<caip2>:<key>      a proposal.
//   claim:<sha256>              another claim.
//   tool:<name>@<version>       a tool, as a writer or `via`.
//   model:<name>@<version>      a named model and version, likewise.
import { utf8ToBytes } from '@noble/hashes/utils.js';
import type { EntityRef } from './types.ts';

export type ParsedRef =
  | { ns: 'account'; chain: string; address: string }
  | { ns: 'group'; scope: string; key: string }
  | { ns: 'asset' | 'proposal'; chain: string; key: string }
  | { ns: 'claim'; id: string }
  | { ns: 'tool' | 'model'; name: string; version: string };

export const HEX64 = /^[0-9a-f]{64}$/;
const REFERENCE = /^[-_a-zA-Z0-9]{1,32}$/;
const KEY = /^(?:[-.:a-zA-Z0-9]|%[0-9A-F]{2}){1,160}$/;
const NAMED = /^([a-zA-Z0-9][a-zA-Z0-9._/-]*)@([a-zA-Z0-9][a-zA-Z0-9._/-]*)$/;

/** The chains a claim can name in this version, and what an account looks like on each. */
const ACCOUNT: Readonly<Record<string, RegExp>> = {
  near: /^(?:[a-z0-9.-]|%5F){2,}$/,
  eip155: /^0x[0-9a-f]{40}$/,
  solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  bip122: /^[a-zA-Z0-9]{25,62}$/,
};

const SAFE = /[-.a-zA-Z0-9]/;

/** Percent-encodes all but the characters CAIP-10 allows. Upper-case hex, always. */
function encode(part: string, keepColons: boolean): string {
  let out = '';
  for (const ch of part) {
    if (SAFE.test(ch) || (keepColons && ch === ':')) out += ch;
    else
      for (const byte of utf8ToBytes(ch))
        out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

function decode(part: string): string | null {
  try {
    return decodeURIComponent(part);
  } catch {
    return null;
  }
}

/** The text a canonical key spells, or null when it isn't in its one canonical spelling. */
function canonicalKey(raw: string): string | null {
  if (!KEY.test(raw)) return null;
  const text = decode(raw);
  return text !== null && encode(text, true) === raw ? text : null;
}

/** CAIP-2 `namespace:reference`, for a chain whose accounts this version knows. */
function chainOf(namespace: string, reference: string | undefined): string | null {
  if (!Object.hasOwn(ACCOUNT, namespace) || !reference || !REFERENCE.test(reference)) return null;
  return `${namespace}:${reference}`;
}

/** What a ref names, or null when it isn't a ref in its one canonical spelling. */
export function parseRef(ref: EntityRef): ParsedRef | null {
  const first = ref.indexOf(':');
  if (first < 0) return null;
  const ns = ref.slice(0, first);
  const rest = ref.slice(first + 1);

  if (ns === 'claim') return HEX64.test(rest) ? { ns: 'claim', id: rest } : null;

  if (ns === 'tool' || ns === 'model') {
    const m = NAMED.exec(rest);
    return m ? { ns, name: m[1] as string, version: m[2] as string } : null;
  }

  if (ns === 'group') {
    const scope = rest.slice(0, 64);
    if (!HEX64.test(scope) || rest[64] !== ':') return null;
    const key = canonicalKey(rest.slice(65));
    return key === null ? null : { ns: 'group', scope, key };
  }

  if (ns === 'asset' || ns === 'proposal') {
    const [namespace = '', reference, ...tail] = rest.split(':');
    const chain = chainOf(namespace, reference);
    const key = canonicalKey(tail.join(':'));
    return chain === null || key === null ? null : { ns, chain, key };
  }

  const parts = rest.split(':');
  if (parts.length !== 2) return null;
  const chain = chainOf(ns, parts[0]);
  const raw = parts[1] as string;
  if (chain === null || !ACCOUNT[ns]?.test(raw)) return null;
  const address = decode(raw);
  return address !== null && encode(address, false) === raw && address.length <= 128
    ? { ns: 'account', chain, address }
    : null;
}

/** An account or contract on a chain, or null when the address isn't one there. */
export function accountRef(chain: string, address: string): EntityRef | null {
  const normal = chain.startsWith('eip155:') ? address.toLowerCase() : address;
  const ref = `${chain}:${encode(normal, false)}`;
  return parseRef(ref)?.ns === 'account' ? ref : null;
}

/** A group, scoped to the snapshot that defines it. */
export function groupRef(snapshotSha256: string, key: string): EntityRef | null {
  const ref = `group:${snapshotSha256}:${encode(key, true)}`;
  return parseRef(ref)?.ns === 'group' ? ref : null;
}

export function assetRef(chain: string, key: string): EntityRef | null {
  const ref = `asset:${chain}:${encode(key, true)}`;
  return parseRef(ref)?.ns === 'asset' ? ref : null;
}

export function proposalRef(chain: string, key: string): EntityRef | null {
  const ref = `proposal:${chain}:${encode(key, true)}`;
  return parseRef(ref)?.ns === 'proposal' ? ref : null;
}

export const claimRef = (id: string): EntityRef => `claim:${id}`;

// A NEAR account's public profile on NEAR Social: reading it (Elco, 9 Nov, through META;
// research/near-social-profile-fit.md): its name, picture, bio and the links it declares, from the current
// social-kv/1 API (receiver `social` on mainnet, not the legacy social.near). Pure: the browser reads it
// directly (lib/agent-client.ts, readSocialProfile), as the API answers the site's origin. Everything here is the account's own words, so it stays plain text,
// and the links are what the account declares, never a proof that it controls them. It signs nobody in,
// grants nothing, and is never merged with another account's.

/** The current NEAR Social API. */
export const NEAR_SOCIAL_API = 'https://api2.near.social';

/** What the lobby shows of a profile. Null fields are ones the account hasn't filled in. */
export interface SocialProfile {
  name: string | null;
  about: string | null;
  /** an https address of the picture, or null */
  avatar: string | null;
  /** the services the account names, in the order the API gives them, each with what it declares there */
  links: { service: string; value: string }[];
}

const text = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;

/**
 * GET /v1/accounts/{id}'s answer as the lobby shows it, or null when there's nothing to show: no profile,
 * or one with nothing filled in. A picture counts only at an https address.
 */
export function socialProfile(json: unknown): SocialProfile | null {
  const o = json as {
    has_profile?: unknown;
    name?: unknown;
    about?: unknown;
    avatar_url?: unknown;
    links?: unknown;
  } | null;
  if (o?.has_profile !== true) return null;
  const avatar = text(o.avatar_url);
  const links =
    o.links && typeof o.links === 'object'
      ? Object.entries(o.links as Record<string, unknown>).flatMap(([service, v]) => {
          const value = text(v);
          return value ? [{ service, value }] : [];
        })
      : [];
  const profile: SocialProfile = {
    name: text(o.name),
    about: text(o.about),
    avatar: avatar?.startsWith('https://') ? avatar : null,
    links,
  };
  const empty = !profile.name && !profile.about && !profile.avatar && profile.links.length === 0;
  return empty ? null : profile;
}

// ---- Writing (Elco, 10 Nov: people create and edit their public profile inside Petals). The current
// standard (research/spikes/near-social-2026-11-09/standard.md): every write is one FunctionCall to the
// account `social` on mainnet, which has no contract, so its receipt fails with CodeDoesNotExist, as
// expected; the indexer reads the call anyway. Text goes to `__fastdata_kv` as JSON, one key per field;
// a picture goes first to `__fastdata_fastfs` as borsh, then its fastfs:// address into profile/avatar.
// The person's own wallet signs each one; nothing here holds a key.

/** Where NEAR Social's writes go, on mainnet. */
export const SOCIAL_RECEIVER = 'social';
export const KV_METHOD = '__fastdata_kv';
export const FASTFS_METHOD = '__fastdata_fastfs';
/** 1 Ggas, as near.social attaches: the call does no work, and a wallet's gas allowance is kept small. */
export const WRITE_GAS = '1000000000';

const utf8 = (s: string) => new TextEncoder().encode(s);

const u32 = (n: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
};

/** A borsh string or byte array: its length as a little-endian u32, then its bytes. */
const sized = (bytes: Uint8Array) => {
  const out = new Uint8Array(4 + bytes.length);
  out.set(u32(bytes.length), 0);
  out.set(bytes, 4);
  return out;
};

const joined = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** FastFS's largest file in one call; a profile picture is made smaller than this before it's sent. */
export const FASTFS_SIMPLE_MAX = 1 << 20;

/**
 * `FastfsData::Simple { relative_path, content: Some({ mime_type, content }) }` in borsh: the args of one
 * `__fastdata_fastfs` call that stores a whole file of at most 1 MiB.
 */
export function fastfsSimple(path: string, mime: string, content: Uint8Array): Uint8Array {
  if (content.length > FASTFS_SIMPLE_MAX) throw new Error('A file over 1 MiB takes several calls.');
  return joined([
    Uint8Array.of(0),
    sized(utf8(path)),
    Uint8Array.of(1),
    sized(utf8(mime)),
    sized(content),
  ]);
}

/** The bytes as base64, as NEAR's RPC shows a call's args. */
export function base64Of(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

// ---- The profile editor's data (Elco, 10 Nov: name, picture, bio and links, edited inside Petals).

/** What the editor holds: the fields as typed, and the picture shown now. */
export interface ProfileDraft {
  name: string;
  about: string;
  links: { service: string; value: string }[];
}

export const draftOf = (p: SocialProfile | null): ProfileDraft => ({
  name: p?.name ?? '',
  about: p?.about ?? '',
  links: p && p.links.length > 0 ? p.links.map((l) => ({ ...l })) : [{ service: '', value: '' }],
});

/** The standard's limits (standard.md, profile keys). */
export const PROFILE_LIMITS = { name: 256, about: 10_000, link: 2048 } as const;

/** A service as a key segment: lower case, letters, digits, - and _ (keys are ASCII). */
export const serviceKey = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '');

/**
 * The `__fastdata_kv` args that make the public profile what the draft says: each field as typed, empty
 * ones removed (null) only where they were set before, every link the draft keeps, null for each it
 * dropped, and the new picture's fastfs:// address when there is one.
 */
export function profileArgs(
  before: SocialProfile | null,
  draft: ProfileDraft,
  avatar: string | null,
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  const set = (key: string, value: string, had: boolean) => {
    if (value) out[key] = value;
    else if (had) out[key] = null;
  };
  set('profile/name', draft.name.trim().slice(0, PROFILE_LIMITS.name), Boolean(before?.name));
  set('profile/about', draft.about.trim().slice(0, PROFILE_LIMITS.about), Boolean(before?.about));
  const kept = new Set<string>();
  for (const l of draft.links) {
    const service = serviceKey(l.service);
    const value = l.value.trim().slice(0, PROFILE_LIMITS.link);
    if (!service || !value) continue;
    kept.add(service);
    out[`profile/links/${service}`] = value;
  }
  for (const l of before?.links ?? [])
    if (!kept.has(serviceKey(l.service))) out[`profile/links/${serviceKey(l.service)}`] = null;
  if (avatar) out['profile/avatar'] = avatar;
  return out;
}

/** Where a picture lives once it's stored, by FastFS's rule: content-addressed, under `social`. */
export const fastfsPath = (sha256Hex: string, mime: string) =>
  `media/${sha256Hex}.${mime === 'image/webp' ? 'webp' : mime === 'image/jpeg' ? 'jpg' : 'png'}`;
export const fastfsUri = (account: string, path: string) =>
  `fastfs://${account}/${SOCIAL_RECEIVER}/${path}`;
export const fastfsUrl = (account: string, path: string) =>
  `https://main.fastfs.io/${account}/${SOCIAL_RECEIVER}/${path}`;

/** What NEAR Social's indexer did with one transaction (GET /v1/tx/{hash}). */
export type TxOutcome = { kind: 'waiting' } | { kind: 'ok' } | { kind: 'refused'; why: string[] };

export function txOutcome(json: unknown): TxOutcome {
  const o = json as {
    indexed?: boolean;
    actions?: { status?: string; keys?: { key?: string; status?: string; reason?: string }[] }[];
  } | null;
  if (!o?.indexed) return { kind: 'waiting' };
  const why: string[] = [];
  for (const a of o.actions ?? []) {
    if (a.status && a.status !== 'ok') why.push(a.status);
    for (const k of a.keys ?? [])
      if (k.status && k.status !== 'ok') why.push(`${k.key}: ${k.reason ?? k.status}`);
  }
  return why.length > 0 ? { kind: 'refused', why } : { kind: 'ok' };
}

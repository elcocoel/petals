// NEAR Social's profile of an account, read on the server the way the site reads it: from api2.near.social, the
// indexer of the current standard, where a profile written through Petals lands (a write to the account
// `social`, which the older social.near contract never sees). Name, bio, picture and links only; null when the
// account has none, or the indexer doesn't answer. A public profile (GET /api/v1/profiles/:account) uses it.

/** A profile anyone can read: what a person shows about themselves, and nothing else. */
export interface PublicProfile {
  name: string | null;
  about: string | null;
  /** The picture's address, https only. */
  avatar: string | null;
  links: Record<string, string>;
}

/** Reads one account's NEAR Social profile, or null. */
export type PublicProfileReader = (account: string) => Promise<PublicProfile | null>;

export const NEAR_SOCIAL_API = 'https://api2.near.social';

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** The indexer's answer as a public profile; null when it says there's no profile, or it's empty. */
export function publicProfileOf(json: unknown): PublicProfile | null {
  const o = json as {
    has_profile?: unknown;
    name?: unknown;
    about?: unknown;
    avatar_url?: unknown;
    links?: unknown;
  } | null;
  if (o?.has_profile !== true) return null;
  const avatar = text(o.avatar_url);
  const links: Record<string, string> = {};
  if (o.links && typeof o.links === 'object') {
    for (const [service, v] of Object.entries(o.links as Record<string, unknown>)) {
      const value = text(v);
      if (value) links[service] = value;
    }
  }
  const profile: PublicProfile = {
    name: text(o.name),
    about: text(o.about),
    avatar: avatar?.startsWith('https://') ? avatar : null,
    links,
  };
  const empty =
    !profile.name && !profile.about && !profile.avatar && Object.keys(profile.links).length === 0;
  return empty ? null : profile;
}

/** NEAR Social's profile of `account` on mainnet, as its indexer has it; null when none or no answer. */
export function nearSocialReader(fetchImpl: typeof fetch = globalThis.fetch): PublicProfileReader {
  return async (account) => {
    try {
      const res = await fetchImpl(`${NEAR_SOCIAL_API}/v1/accounts/${encodeURIComponent(account)}`);
      if (!res.ok) return null;
      return publicProfileOf(await res.json());
    } catch {
      return null;
    }
  };
}

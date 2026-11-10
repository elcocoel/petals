// A NEAR account's public profile on NEAR Social, read-only (Elco, 9 Nov, through META;
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

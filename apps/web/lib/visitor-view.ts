// A visitor's own view (Elco, 12 Nov, walk 3: "their choice kept in their browser; costs nothing on the server"):
// the server keeps it by its hash, nobody's (PUT /api/v1/views), and the visitor's browser keeps the hash in a
// cookie, so the pages the server builds for them ask for it (lib/viewer-view.ts). A person signed in keeps
// their own on the server instead, and the cookie goes. Pure: the browser sets it (viewmodels/usePersonView.ts).

/** The cookie that holds it: the hash alone, nothing about the person. */
export const VISITOR_VIEW_COOKIE = 'petals_view';

/** A view's hash: sha-256, hex. Anything else in the cookie is nobody's view. */
const HASH = /^[0-9a-f]{64}$/;

/** The hash a request's cookie header holds, or null. */
export function visitorViewOf(cookie: string | null): string | null {
  if (!cookie) return null;
  for (const part of cookie.split(';')) {
    const [name, value] = part.trim().split('=');
    if (name === VISITOR_VIEW_COOKIE && value && HASH.test(value)) return value;
  }
  return null;
}

/** For a year, on every page of the site: the visitor's view until they change it again. */
const YEAR = 60 * 60 * 24 * 365;

/** The cookie that keeps a visitor's view by its hash, for the browser to set; null forgets it. */
export function visitorViewCookie(hash: string | null): string {
  return hash
    ? `${VISITOR_VIEW_COOKIE}=${hash}; path=/; max-age=${YEAR}; samesite=lax`
    : `${VISITOR_VIEW_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

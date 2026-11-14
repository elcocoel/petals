// The paths the server answers (lib/server.ts) go to it from here, at this one address. On the way, the
// visitor's address, the site's own address and the site key are added, so the server can tell visitors
// apart and answer only its site. A caller can't set these: each is overwritten. The rewrite is made here,
// when the request comes, rather than in next.config.ts, so PETAL_SERVER is read when the site runs and
// one build serves any server. Through Vercel this passes Set-Cookie, Origin and streams unchanged
// (002-system research.md, section 5, the /mw path), and caps a body at 4.5 MB.
//
// A page opened with ?invite=<token> (a link handed to someone, /make?invite=…) redeems that invite here, before
// the page is drawn: the server's session cookie comes back with a move to the same address without the token,
// so the page opens as a session that holds the invite (and /make lets it in with no wallet).
import { type NextRequest, NextResponse } from 'next/server';
import {
  SITE_HEADER,
  SITE_KEY_HEADER,
  serverBase,
  siteKey,
  VISITOR_HEADER,
  visitorOf,
} from './lib/server.ts';

export async function proxy(request: NextRequest) {
  const invite = request.nextUrl.searchParams.get('invite');
  if (invite && !request.nextUrl.pathname.startsWith('/api/')) return redeem(request, invite);
  const headers = new Headers(request.headers);
  const visitor = visitorOf(request.headers);
  if (visitor) headers.set(VISITOR_HEADER, visitor);
  else headers.delete(VISITOR_HEADER);
  headers.set(SITE_HEADER, request.nextUrl.origin);
  const key = siteKey();
  if (key) headers.set(SITE_KEY_HEADER, key);
  else headers.delete(SITE_KEY_HEADER);
  const { pathname, search } = request.nextUrl;
  return NextResponse.rewrite(new URL(`${pathname}${search}`, `${serverBase()}/`), {
    request: { headers },
  });
}

/** Redeems an invite for this visitor's session (a new one if they have none) and moves to the address without it. */
async function redeem(request: NextRequest, token: string): Promise<NextResponse> {
  // a call from this site's own server, not from a page: no Origin, which the server reads only from browsers
  const headers = new Headers({ 'content-type': 'application/json' });
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  const visitor = visitorOf(request.headers);
  if (visitor) headers.set(VISITOR_HEADER, visitor);
  headers.set(SITE_HEADER, request.nextUrl.origin);
  const key = siteKey();
  if (key) headers.set(SITE_KEY_HEADER, key);
  const answer = await fetch(`${serverBase()}/api/v1/auth/invite`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ token }),
  }).catch(() => null);
  const to = request.nextUrl.clone();
  to.searchParams.delete('invite');
  const moved = NextResponse.redirect(to);
  for (const set of answer?.headers.getSetCookie() ?? []) moved.headers.append('set-cookie', set);
  return moved;
}

// The same paths as FORWARDED in lib/server.ts, then any page opened with an invite; Next reads this list as
// written, so it can't import it.
export const config = {
  matcher: [
    '/api/:path*',
    '/mcp',
    '/mcp/:path*',
    '/skill.md',
    '/setup',
    '/schema',
    '/schema/:path*',
    '/petal.mjs',
    '/d/:path*',
    '/s/:path*',
    { source: '/:path*', has: [{ type: 'query', key: 'invite' }] },
  ],
};

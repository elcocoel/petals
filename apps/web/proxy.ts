// The paths the server answers (lib/server.ts) go to it from here, at this one address. On the way, the
// visitor's address, the site's own address and the site key are added, so the server can tell visitors
// apart and answer only its site. A caller can't set these: each is overwritten. The rewrite is made here,
// when the request comes, rather than in next.config.ts, so PETAL_SERVER is read when the site runs and
// one build serves any server. Through Vercel this passes Set-Cookie, Origin and streams unchanged
// (002-system research.md, section 5, the /mw path), and caps a body at 4.5 MB.
import { type NextRequest, NextResponse } from 'next/server';
import {
  SITE_HEADER,
  SITE_KEY_HEADER,
  serverBase,
  siteKey,
  VISITOR_HEADER,
  visitorOf,
} from './lib/server.ts';

export function proxy(request: NextRequest) {
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

// The same paths as FORWARDED in lib/server.ts; Next reads this list as written, so it can't import it.
export const config = {
  matcher: [
    '/api/:path*',
    '/mcp',
    '/mcp/:path*',
    '/skill.md',
    '/petal.mjs',
    '/d/:path*',
    '/s/:path*',
  ],
};

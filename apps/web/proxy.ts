// On each request the site forwards to the server (lib/server.ts), add the visitor's address, the
// site's own address and the site key, so the server can tell visitors apart and answer only its site.
// A caller can't set these: each is overwritten here. The rewrite itself is in next.config.ts.
import { type NextRequest, NextResponse } from 'next/server';
import { SITE_HEADER, SITE_KEY_HEADER, siteKey, VISITOR_HEADER, visitorOf } from './lib/server.ts';

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  const visitor = visitorOf(request.headers);
  if (visitor) headers.set(VISITOR_HEADER, visitor);
  else headers.delete(VISITOR_HEADER);
  headers.set(SITE_HEADER, request.nextUrl.origin);
  const key = siteKey();
  if (key) headers.set(SITE_KEY_HEADER, key);
  else headers.delete(SITE_KEY_HEADER);
  return NextResponse.next({ request: { headers } });
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

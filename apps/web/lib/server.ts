// Where the server is, for the site (002-system research, C1 and C4). The site shows pages; everything
// below goes to the server, at one address for people and agents. The rewrites in next.config.ts send
// those paths there, and proxy.ts adds the visitor's address and the site key on the way.
//
//   PETAL_SERVER     the server's own address (default http://127.0.0.1:8787, `pnpm server`)
//   PETAL_SITE_KEY   shared with the server, which answers nothing without it; unset on this machine

/** The paths the server answers, as next.config.ts rewrites them. proxy.ts's matcher lists the same. */
export const FORWARDED = [
  '/api/:path*',
  '/mcp',
  '/mcp/:path*',
  '/skill.md',
  '/petal.mjs',
  '/d/:path*',
  '/s/:path*',
];

export const SITE_KEY_HEADER = 'x-petal-site-key';
export const VISITOR_HEADER = 'x-petal-visitor';
export const SITE_HEADER = 'x-petal-site';

type Env = Record<string, string | undefined>;

export function serverBase(env: Env = process.env): string {
  return (env.PETAL_SERVER?.trim() || 'http://127.0.0.1:8787').replace(/\/+$/, '');
}

export function siteKey(env: Env = process.env): string | undefined {
  return env.PETAL_SITE_KEY?.trim() || undefined;
}

/** The visitor's address as the host in front of the site reports it; none when it can't say. */
export function visitorOf(headers: { get(name: string): string | null }): string | undefined {
  const real = headers.get('x-real-ip')?.trim();
  if (real) return real;
  const first = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (first) return first;
  return headers.get('cf-connecting-ip')?.trim() || undefined;
}

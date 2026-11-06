// Per-address limits, in memory (http-api.md, Rules; Phase A): 60 tool calls a minute. The one helper
// that says who a caller is, for every limiter on this server: cf-connecting-ip, which Cloudflare
// overwrites, so the tunnel is the only way in that can set it; then the socket, only on a local
// deployment. x-forwarded-for and x-real-ip are anyone's to write, so they name nobody.
import type { Context, MiddlewareHandler } from 'hono';
import { versioned } from '../define.ts';
import { toolError } from '../errors.ts';

/** Addresses a limiter remembers at most. Past this the oldest is forgotten, without scanning. */
export const MAX_TRACKED_KEYS = 10_000;

/** A public deployment with no cf-connecting-ip: one limit between them, so none gets a fresh one. */
const NO_ADDRESS = 'unknown';

/** No site, or a site on this machine. A malformed PETAL_API counts as none, as sign-in reads it. */
export function isLocalSite(apiBase: string | undefined): boolean {
  if (!apiBase) return true;
  try {
    const { hostname } = new URL(apiBase);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return true;
  }
}

/** An IPv6 caller is its /64: one host can rotate through all of those, so an address means nothing. */
function oneNetwork(address: string): string {
  if (!address.includes(':')) return address;
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(address)?.[1];
  if (v4) return v4;
  const [head = '', tail = ''] = address.toLowerCase().split('::');
  const start = head ? head.split(':') : [];
  const end = tail ? tail.split(':') : [];
  const zeros = Array<string>(Math.max(0, 8 - start.length - end.length)).fill('0');
  return `${[...start, ...zeros, ...end].slice(0, 4).join(':')}::/64`;
}

/** Who this caller is, for a limit. `local`: this deployment is on this machine (isLocalSite). */
export function clientAddress(c: Context, local: boolean): string {
  const cf = c.req.header('cf-connecting-ip')?.trim();
  if (cf) return oneNetwork(cf);
  // The keyless copy on Vercel, which overwrites this itself, so a client can't set it there.
  const vercel = process.env.VERCEL ? c.req.header('x-real-ip')?.trim() : undefined;
  if (vercel) return oneNetwork(vercel);
  if (!local) return NO_ADDRESS;
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  return env?.incoming?.socket?.remoteAddress ?? 'local';
}

/** Remembers `value` as the newest under `key`, and forgets the oldest past the limit. Constant time. */
export function remember<V>(map: Map<string, V>, key: string, value: V): void {
  map.delete(key);
  map.set(key, value);
  if (map.size > MAX_TRACKED_KEYS) map.delete(map.keys().next().value as string);
}

export function rateLimit(opts: {
  max: number;
  windowMs: number;
  now: () => number;
  what: string;
  /** this deployment is on this machine; default not */
  local?: boolean;
  /** where the windows live; default a new map */
  tracked?: Map<string, { start: number; count: number }>;
}): MiddlewareHandler {
  const windows = opts.tracked ?? new Map<string, { start: number; count: number }>();
  return async (c, next) => {
    const now = opts.now();
    const address = clientAddress(c, opts.local ?? false);
    let w = windows.get(address);
    if (!w || now - w.start >= opts.windowMs) {
      w = { start: now, count: 0 };
      remember(windows, address, w);
    }
    w.count += 1;
    if (w.count > opts.max) {
      const retry = Math.max(1, Math.ceil((w.start + opts.windowMs - now) / 1000));
      c.header('Retry-After', String(retry));
      return c.json(
        versioned(
          toolError(
            'rate_limited',
            `Over the limit of ${opts.max} ${opts.what} a minute from one address.`,
            `Wait ${retry} s.`,
            retry,
          ),
        ),
        429,
      );
    }
    await next();
  };
}

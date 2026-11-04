// Per-IP limits, in memory (http-api.md, Rules; Phase A): 60 tool calls a minute.
import type { Context, MiddlewareHandler } from 'hono';
import { versioned } from '../define.ts';
import { toolError } from '../errors.ts';

/** The caller's IP: the first X-Forwarded-For hop, X-Real-IP, or the Node socket. */
export function clientIp(c: Context): string {
  const fwd = c.req.header('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || 'unknown';
  const real = c.req.header('x-real-ip');
  if (real) return real.trim();
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  return env?.incoming?.socket?.remoteAddress ?? 'local';
}

export function rateLimit(opts: {
  max: number;
  windowMs: number;
  now: () => number;
  what: string;
}): MiddlewareHandler {
  const windows = new Map<string, { start: number; count: number }>();
  return async (c, next) => {
    const now = opts.now();
    if (windows.size > 10_000) {
      for (const [ip, w] of windows) if (now - w.start >= opts.windowMs) windows.delete(ip);
    }
    const ip = clientIp(c);
    let w = windows.get(ip);
    if (!w || now - w.start >= opts.windowMs) {
      w = { start: now, count: 0 };
      windows.set(ip, w);
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

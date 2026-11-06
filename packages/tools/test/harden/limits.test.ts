// T300, finding 2: limits that can't be spoofed. One helper reads the address: cf-connecting-ip
// (Cloudflare overwrites it), then the socket only on a local deployment. x-forwarded-for and
// x-real-ip are anyone's to write, so they never name a caller.
import { describe, expect, test } from 'vitest';
import { httpApp } from '../../src/http/app.ts';
import { clientAddress, rateLimit } from '../../src/http/rate-limit.ts';
import { rig } from '../helpers.ts';

const random = () => Array.from({ length: 4 }, () => Math.floor(Math.random() * 250)).join('.');

async function app(apiBase: string) {
  const r = await rig();
  r.ctx.config.apiBase = apiBase;
  return httpApp(r.ctx);
}

const statuses = async (
  a: Awaited<ReturnType<typeof app>>,
  headers: () => Record<string, string>,
  n: number,
) => {
  const out: number[] = [];
  for (let i = 0; i < n; i++)
    out.push((await a.request('/api/v1/networks', { headers: headers() })).status);
  return out;
};

describe('the caller’s address', () => {
  for (const [what, apiBase] of [
    ['public', 'https://petals.example'],
    ['local', 'http://localhost:3186'],
  ] as const) {
    test(`${what}: a new x-forwarded-for or x-real-ip per request gets no fresh limit`, async () => {
      const a = await app(apiBase);
      const seen = await statuses(
        a,
        () => ({ 'x-forwarded-for': random(), 'x-real-ip': random() }),
        61,
      );
      expect(seen.slice(0, 60).every((s) => s === 200)).toBe(true);
      expect(seen[60]).toBe(429);
    });
  }

  test('public: cf-connecting-ip names the caller, whatever x-forwarded-for says', async () => {
    const a = await app('https://petals.example');
    const same = await statuses(
      a,
      () => ({ 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-for': random() }),
      61,
    );
    expect(same[60]).toBe(429);
    const other = await a.request('/api/v1/networks', {
      headers: { 'cf-connecting-ip': '198.51.100.8' },
    });
    expect(other.status).toBe(200);
  });

  test('public: with no cf-connecting-ip everyone shares one limit, not the socket’s', async () => {
    const a = await app('https://petals.example');
    const seen = await statuses(a, () => ({}), 61);
    expect(seen[60]).toBe(429);
  });

  test('an IPv6 caller is one network: a /64 can’t rotate its way to a fresh limit', async () => {
    const a = await app('https://petals.example');
    let n = 0;
    const seen = await statuses(
      a,
      () => ({ 'cf-connecting-ip': `2001:db8:1:2::${(n++).toString(16)}` }),
      61,
    );
    expect(seen[60]).toBe(429);
    const other = await a.request('/api/v1/networks', {
      headers: { 'cf-connecting-ip': '2001:db8:1:3::1' },
    });
    expect(other.status).toBe(200);
  });

  test('the helper itself: local falls back to the socket, public never does', () => {
    const c = (headers: Record<string, string>, remote?: string) =>
      ({
        req: { header: (k: string) => headers[k.toLowerCase()] },
        env: remote ? { incoming: { socket: { remoteAddress: remote } } } : undefined,
      }) as never;
    expect(clientAddress(c({ 'cf-connecting-ip': '198.51.100.1' }, '127.0.0.1'), true)).toBe(
      '198.51.100.1',
    );
    expect(clientAddress(c({}, '127.0.0.1'), true)).toBe('127.0.0.1');
    expect(clientAddress(c({}, '127.0.0.1'), false)).not.toBe('127.0.0.1');
    expect(clientAddress(c({ 'x-forwarded-for': '1.1.1.1' }, '127.0.0.1'), true)).toBe('127.0.0.1');
  });
});

describe('the limiter’s memory', () => {
  test('random keys can’t grow the map or make a request scan it', async () => {
    let scans = 0;
    class Watched<K, V> extends Map<K, V> {
      override [Symbol.iterator]() {
        scans++;
        return super[Symbol.iterator]();
      }
      override entries() {
        scans++;
        return super.entries();
      }
    }
    const tracked = new Watched<string, { start: number; count: number }>();
    const mw = rateLimit({ max: 60, windowMs: 60_000, now: () => 0, what: 'calls', tracked });
    const ctx = (ip: string) =>
      ({
        req: { header: (k: string) => (k === 'cf-connecting-ip' ? ip : undefined) },
        header: () => {},
        json: () => new Response(),
      }) as never;
    for (let i = 0; i < 10_050; i++)
      await mw(ctx(`10.${i >> 16}.${(i >> 8) & 255}.${i & 255}`), async () => {});
    expect(tracked.size).toBeGreaterThan(0);
    expect(tracked.size).toBeLessThanOrEqual(10_000);
    expect(scans).toBe(0);
  });
});

describe('/mcp', () => {
  test('a batch is refused: one POST is one call against the limit', async () => {
    const a = await app('https://petals.example');
    const call = { jsonrpc: '2.0', method: 'tools/list', params: {} };
    const batch = Array.from({ length: 100 }, (_, id) => ({ ...call, id }));
    const res = await a.request('/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(batch),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('bad_input');
    for (const body of [' [ {} ]', '\n[]']) {
      const again = await a.request('/mcp', { method: 'POST', body });
      expect(again.status, body).toBe(400);
    }
  });
});

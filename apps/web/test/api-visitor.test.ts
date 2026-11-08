// A page's call to the server is its visitor's (002-system research, C6). Without that, every visitor to
// a public site shares one limit of 60 tool calls a minute, and past it pages lose what they load. The
// call goes over HTTP with the site key, so the server answers it as it answers everyone else.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { FORWARDED, serverBase, visitorOf } from '../lib/server.ts';
import { readVisitorFrom } from '../lib/visitor.ts';

let incoming: Record<string, string> | null = null;
const seen: { url: string; headers: Headers }[] = [];

describe('api', () => {
  beforeEach(() => {
    seen.length = 0;
    incoming = null;
    readVisitorFrom(async () => {
      if (!incoming) throw new Error('headers() was called outside a request scope');
      return new Headers(incoming);
    });
    vi.stubGlobal('fetch', async (url: string, init: { headers: Record<string, string> }) => {
      seen.push({ url, headers: new Headers(init.headers) });
      return new Response('{"ok":true}', { status: 200 });
    });
    vi.stubEnv('PETAL_SERVER', 'http://server.example:8787/');
    vi.stubEnv('PETAL_SITE_KEY', 'the-site-key');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test('the layout supplies the source, since lib/ does not import next', () => {
    const layout = readFileSync(join(import.meta.dirname, '../app/layout.tsx'), 'utf8');
    expect(layout).toContain('readVisitorFrom(headers)');
  });

  test('calls the server, with the site key', async () => {
    const { api } = await import('../lib/api.ts');
    await api('/api/v1/flowers');
    expect(seen[0]?.url).toBe('http://server.example:8787/api/v1/flowers');
    expect(seen[0]?.headers.get('x-petal-site-key')).toBe('the-site-key');
  });

  test("passes on the visitor's address and the site's own", async () => {
    incoming = {
      'x-real-ip': '203.0.113.7',
      host: 'petals.example',
      cookie: 'petal_session=secret',
    };
    const { api } = await import('../lib/api.ts');
    await api('/api/v1/flowers');
    expect(seen[0]?.headers.get('x-petal-visitor')).toBe('203.0.113.7');
    expect(seen[0]?.headers.get('x-petal-site')).toBe('https://petals.example');
  });

  test('and only that: a session comes along only when a page passes it on', async () => {
    incoming = { 'x-real-ip': '203.0.113.7', cookie: 'petal_session=secret', 'x-other': 'x' };
    const { api } = await import('../lib/api.ts');
    await api('/api/v1/flowers');
    expect(seen[0]?.headers.get('cookie')).toBeNull();
    expect(seen[0]?.headers.get('x-other')).toBeNull();
    await api('/api/v1/me', { cookie: 'petal_session=secret' });
    expect(seen[1]?.headers.get('cookie')).toBe('petal_session=secret');
  });

  test('outside a request there is nobody to name, and the call still works', async () => {
    const { api } = await import('../lib/api.ts');
    expect(await api('/api/v1/flowers')).toEqual({ ok: true, value: { ok: true } });
    expect(seen[0]?.headers.get('x-petal-visitor')).toBeNull();
  });

  test('a server that does not answer is a plain error, not a crash', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('ECONNREFUSED');
    });
    const { api } = await import('../lib/api.ts');
    const out = await api('/api/v1/flowers');
    expect(out.ok).toBe(false);
    expect(out.ok ? null : out.error.code).toBe('source_failed');
  });
});

describe('the seam', () => {
  test('the proxy runs on exactly the paths the site forwards', () => {
    const proxy = readFileSync(join(import.meta.dirname, '../proxy.ts'), 'utf8');
    const matcher = /matcher:\s*\[([^\]]*)\]/.exec(proxy)?.[1] ?? '';
    const listed = [...matcher.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(listed).toEqual(FORWARDED);
  });

  test('the server is on this machine unless the site is told where', () => {
    expect(serverBase({})).toBe('http://127.0.0.1:8787');
    expect(serverBase({ PETAL_SERVER: 'https://server.example/' })).toBe('https://server.example');
  });

  test("the visitor's address: what the host in front says, first", () => {
    expect(visitorOf(new Headers({ 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '5.6.7.8' }))).toBe(
      '1.2.3.4',
    );
    expect(visitorOf(new Headers({ 'x-forwarded-for': '5.6.7.8, 9.9.9.9' }))).toBe('5.6.7.8');
    expect(visitorOf(new Headers({}))).toBeUndefined();
  });
});

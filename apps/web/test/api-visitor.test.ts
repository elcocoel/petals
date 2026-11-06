// A page's call to the API is its visitor's. Without that, every visitor to a public site shares one
// limit of 60 tool calls a minute, and past it pages lose what they load.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { readVisitorFrom } from '../lib/visitor.ts';

let incoming: Record<string, string> | null = null;
const seen: Headers[] = [];

vi.mock('../lib/server-app.ts', () => ({
  getApp: async () => ({
    app: {
      request: async (_path: string, init: { headers: Record<string, string> }) => {
        seen.push(new Headers(init.headers));
        return new Response('{"ok":true}', { status: 200 });
      },
    },
  }),
}));

describe('api', () => {
  beforeEach(() => {
    seen.length = 0;
    incoming = null;
    readVisitorFrom(async () => {
      if (!incoming) throw new Error('headers() was called outside a request scope');
      return new Headers(incoming);
    });
  });

  test('the layout supplies the source, since lib/ does not import next', () => {
    const layout = readFileSync(join(import.meta.dirname, '../app/layout.tsx'), 'utf8');
    expect(layout).toContain('readVisitorFrom(headers)');
  });

  test("passes on the visitor's address, as the limiter reads it", async () => {
    incoming = { 'cf-connecting-ip': '203.0.113.7', cookie: 'petal_session=secret' };
    const { api } = await import('../lib/api.ts');
    await api('/api/v1/flowers');
    expect(seen[0]?.get('cf-connecting-ip')).toBe('203.0.113.7');
  });

  test('and only that: a session comes along only when a page passes it on', async () => {
    incoming = {
      'cf-connecting-ip': '203.0.113.7',
      cookie: 'petal_session=secret',
      'x-other': 'x',
    };
    const { api } = await import('../lib/api.ts');
    await api('/api/v1/flowers');
    expect(seen[0]?.get('cookie')).toBeNull();
    expect(seen[0]?.get('x-other')).toBeNull();
  });

  test('outside a request there is nobody to name, and the call still works', async () => {
    const { api } = await import('../lib/api.ts');
    expect(await api('/api/v1/flowers')).toEqual({ ok: true, value: { ok: true } });
    expect(seen[0]?.get('cf-connecting-ip')).toBeNull();
  });
});

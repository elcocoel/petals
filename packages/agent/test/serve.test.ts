// The server alone (002-system research, C3 and C4): it answers only its website, believes the visitor's
// address only from it, and serves the skill and the file with the website's address in them.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Config } from '@petal/tools';
import { describe, expect, test } from 'vitest';
import { serveApi, serverApp, serverConfig, siteKeyFrom } from '../src/serve.ts';

const REPO = join(import.meta.dirname, '../../..');
const KEY = 'the-site-key-for-this-test';
const SITE = 'https://petals.example';

const fresh = (o: Partial<Config> = {}): Config => ({
  root: REPO,
  fake: true,
  stateDir: mkdtempSync(join(tmpdir(), 'petal-serve-')),
  apiBase: SITE,
  ...o,
});

const call = (
  app: ReturnType<typeof serverApp>,
  path: string,
  headers: Record<string, string> = {},
) => app.fetch(new Request(`http://server.local${path}`, { headers }));

describe('the site key', () => {
  const app = serverApp(fresh(), { siteKey: KEY });

  test('health answers anyone, so the host can check the server is up', async () => {
    const res = await call(app, '/api/v1/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, mock: false, fake: true });
  });

  test('anything else, without the key or with a wrong one, is the same 404', async () => {
    const tries: Record<string, string>[] = [
      {},
      { 'x-petal-site-key': 'wrong' },
      { 'x-petal-site-key': '' },
    ];
    for (const headers of tries) {
      const res = await call(app, '/api/v1/networks', headers);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Not found.' } });
    }
    expect((await call(app, '/skill.md')).status).toBe(404);
    expect((await call(app, '/mcp')).status).toBe(404);
  });

  test('with the key, it answers', async () => {
    const res = await call(app, '/api/v1/networks', { 'x-petal-site-key': KEY });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-petal-api')).toBe('real');
  });

  test("the visitor's address counts only with the key, and a caller's own copy is dropped", async () => {
    const limited = serverApp(fresh(), { siteKey: KEY });
    const as = (visitor: string) => ({
      'x-petal-site-key': KEY,
      'x-petal-visitor': visitor,
      // what a caller might send to pass as someone else, which the key's holder replaces
      'cf-connecting-ip': '198.51.100.1',
    });
    let last = 0;
    for (let i = 0; i < 61; i++)
      last = (await call(limited, '/api/v1/networks', as('203.0.113.7'))).status;
    expect(last).toBe(429);
    // another visitor behind the same website has a limit of their own
    expect((await call(limited, '/api/v1/networks', as('203.0.113.8'))).status).toBe(200);
  });
});

describe('with no key, as on this machine', () => {
  test('every request is answered as it came', async () => {
    const app = serverApp(fresh());
    expect((await call(app, '/api/v1/networks')).status).toBe(200);
  });

  test('a public server refuses to start without its key', () => {
    expect(() => serveApi({ port: 0, cfg: fresh({ public: true }) })).toThrow(/site key/);
  });

  test('the key comes from the environment or its file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'petal-key-'));
    writeFileSync(join(dir, 'site-key'), `${KEY}\n`);
    expect(siteKeyFrom({ PETAL_SITE_KEY: KEY })).toBe(KEY);
    expect(siteKeyFrom({ PETAL_SITE_KEY_FILE: join(dir, 'site-key') })).toBe(KEY);
    expect(siteKeyFrom({})).toBeUndefined();
    writeFileSync(join(dir, 'empty'), '\n');
    expect(() => siteKeyFrom({ PETAL_SITE_KEY_FILE: join(dir, 'empty') })).toThrow(/empty/);
  });

  test('every setting the tools read, PETAL_PUBLIC included, and links only to PETAL_API', () => {
    expect(serverConfig({ PETAL_PUBLIC: '1' }).public).toBe(true);
    expect(serverConfig({}).apiBase).toBeUndefined();
    expect(serverConfig({ PETAL_API: SITE }).apiBase).toBe(SITE);
  });
});

describe('what the server serves for agents', () => {
  test("the skill, with the website's address and not the server's", async () => {
    const app = serverApp(fresh(), { siteKey: KEY });
    const res = await call(app, '/skill.md', { 'x-petal-site-key': KEY });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/plain/);
    const text = await res.text();
    expect(text).toContain(`curl -fsSL ${SITE}/petal.mjs`);
    expect(text).not.toContain('server.local');
  });

  test("the file, with the website's address written in", async () => {
    const root = mkdtempSync(join(tmpdir(), 'petal-root-'));
    mkdirSync(join(root, 'apps/cli/dist'), { recursive: true });
    writeFileSync(join(root, 'apps/cli/dist/petal.mjs'), 'var SERVED_FROM = "%%PETALS_SITE%%";\n');
    const app = serverApp(fresh(), { siteKey: KEY, root });
    const res = await call(app, '/petal.mjs', { 'x-petal-site-key': KEY });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(`var SERVED_FROM = "${SITE}";\n`);
    const none = serverApp(fresh(), { root: mkdtempSync(join(tmpdir(), 'petal-empty-')) });
    expect((await call(none, '/petal.mjs')).status).toBe(404);
  });
});

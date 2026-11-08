// The website in front of the server, as two processes (002-system research; Elco, 8 Nov: "when I test
// I must test reality"). The server alone (packages/agent/src/serve.ts), public, with a site key; the
// site built with Next and started with `next start`, forwarding to it. Everything goes through the
// site's one address, as a person and their agent would use it. Ports 3176 (server) and 3177 (site),
// on 127.0.0.1 only. No model, no wallet, no outside reads: a public server refuses those.
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { REPO } from './helpers.ts';

const SERVER_PORT = 3176;
const SITE_PORT = 3177;
const SERVER = `http://127.0.0.1:${SERVER_PORT}`;
const SITE = `http://127.0.0.1:${SITE_PORT}`;
const KEY = randomBytes(24).toString('hex');
const FLOWER = '9ac16c8917aa5ca579c8421a';

const children: ChildProcess[] = [];
let log = '';

function start(cmd: string, args: string[], cwd: string, env: Record<string, string>) {
  const child = spawn(cmd, args, {
    cwd,
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (d) => (log += d));
  child.stderr?.on('data', (d) => (log += d));
  children.push(child);
  return child;
}

async function until(url: string, ms: number): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${url} never answered\n${log.slice(-2000)}`);
}

const json = { 'content-type': 'application/json' };

beforeAll(async () => {
  // The file the server serves, and the site, built knowing nothing of the server: it's told where the
  // server is when it starts, as a host would tell it.
  const bundle = spawnSync(process.execPath, ['apps/cli/scripts/bundle.ts'], { cwd: REPO });
  if (bundle.status !== 0) throw new Error(`bundle failed: ${bundle.stderr}`);
  const web = join(REPO, 'apps/web');
  const next = join(web, 'node_modules/next/dist/bin/next');
  const siteEnv = { PETAL_SERVER: SERVER, PETAL_SITE_KEY: KEY, NEXT_TELEMETRY_DISABLED: '1' };
  const { PETAL_SERVER: _s, PETAL_SITE_KEY: _k, ...buildEnv } = process.env;
  const built = spawnSync(process.execPath, [next, 'build'], {
    cwd: web,
    env: { ...buildEnv, NEXT_TELEMETRY_DISABLED: '1' },
    encoding: 'utf8',
  });
  if (built.status !== 0) throw new Error(`next build failed:\n${built.stdout}\n${built.stderr}`);

  start(process.execPath, ['packages/agent/src/serve.ts'], REPO, {
    PORT: String(SERVER_PORT),
    PETAL_PUBLIC: '1',
    PETAL_SITE_KEY: KEY,
    PETAL_API: SITE,
    PETAL_STATE_DIR: mkdtempSync(join(tmpdir(), 'petal-seam-')),
  });
  start(
    process.execPath,
    [next, 'start', '--hostname', '127.0.0.1', '-p', String(SITE_PORT)],
    web,
    {
      ...siteEnv,
      NODE_ENV: 'production',
    },
  );
  await until(`${SERVER}/api/v1/health`, 30_000);
  await until(`${SITE}/api/v1/health`, 60_000);
}, 600_000);

afterAll(() => {
  for (const c of children) c.kill('SIGTERM');
});

describe('the server answers only its website', () => {
  test('health answers anyone at the server', async () => {
    const h = (await (await fetch(`${SERVER}/api/v1/health`)).json()) as Record<string, unknown>;
    expect(h).toMatchObject({ ok: true, public: true, agent_access: 'none', mock: false });
  });

  test('anything else at the server, without the site, is not found', async () => {
    for (const path of ['/api/v1/networks', '/skill.md', '/petal.mjs', '/mcp']) {
      expect((await fetch(`${SERVER}${path}`)).status).toBe(404);
    }
    const wrong = await fetch(`${SERVER}/api/v1/networks`, {
      headers: { 'x-petal-site-key': 'x' },
    });
    expect(wrong.status).toBe(404);
  });

  test('the same paths answer through the site', async () => {
    const res = await fetch(`${SITE}/api/v1/networks`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-petal-api')).toBe('real');
  });

  test('outside work is refused, as a public site does', async () => {
    const res = await fetch(`${SITE}/api/v1/find?query=moloch`);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('not_on_this_site');
  });

  test('each visitor behind the site has a limit of their own', async () => {
    const as = (ip: string) => fetch(`${SITE}/api/v1/networks`, { headers: { 'x-real-ip': ip } });
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await as('203.0.113.21')).status;
    expect(last).toBe(429);
    expect((await as('203.0.113.22')).status).toBe(200);
  });
});

describe('agents get one address, the site', () => {
  test("/skill.md comes from the server, with the site's address", async () => {
    const text = await (await fetch(`${SITE}/skill.md`)).text();
    expect(text).toContain(`curl -fsSL ${SITE}/petal.mjs`);
    expect(text).not.toContain(SERVER);
  });

  test("/petal.mjs comes from the server, with the site's address written in", async () => {
    const res = await fetch(`${SITE}/petal.mjs`);
    expect(res.status).toBe(200);
    const file = await res.text();
    expect(file).toContain(JSON.stringify(SITE));
    expect(file).not.toContain(SERVER);
  });

  test('/mcp answers through the site', async () => {
    const res = await fetch(`${SITE}/mcp`, {
      method: 'POST',
      headers: { ...json, accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'seam-test', version: '0' },
        },
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('"serverInfo"');
  });
});

describe('a conversation from elsewhere, watched through the site', () => {
  let token = '';
  let id = '';

  test('an agent starts it at the site; its links name the site', async () => {
    const res = await fetch(`${SITE}/api/v1/explorations`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ question: 'Who holds the most?', client: 'Seam test' }),
    });
    expect(res.status).toBe(200);
    const out = (await res.json()) as {
      exploration: string;
      link: { url: string };
      open_url: string;
    };
    id = out.exploration;
    token = out.link.url.slice(out.link.url.lastIndexOf('/') + 1);
    expect(out.link.url.startsWith(`${SITE}/s/`)).toBe(true);
    expect(out.open_url.startsWith(`${SITE}/make?elsewhere=`)).toBe(true);
    expect((await fetch(`${SITE}/s/${token}`)).status).toBe(200);
  });

  test("the browser's claim sets its cookie through the site, and the cookie works", async () => {
    const claim = await fetch(`${SITE}/api/v1/explorations/${token}/claim`, {
      method: 'POST',
      headers: { origin: SITE },
    });
    expect(claim.status).toBe(200);
    const cookie = claim.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/HttpOnly/i);
    const pair = cookie.split(';')[0] as string;
    const own = await fetch(`${SITE}/api/v1/explorations/${id}`, { headers: { cookie: pair } });
    expect(own.status).toBe(200);
    expect((await fetch(`${SITE}/api/v1/explorations/${id}`)).status).toBe(404);
  });

  test("another site's page is refused", async () => {
    const res = await fetch(`${SITE}/api/v1/explorations/${token}/claim`, {
      method: 'POST',
      headers: { origin: 'https://elsewhere.example' },
    });
    expect(res.status).toBe(401);
  });

  test('the live stream comes through the site, and a note wakes it', async () => {
    const ac = new AbortController();
    const res = await fetch(`${SITE}/api/v1/explorations/${token}/live`, { signal: ac.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let seen = '';
    const changes = () => (seen.match(/event: change/g) ?? []).length;
    const read = async (want: number) => {
      const end = Date.now() + 15_000;
      while (changes() < want && Date.now() < end) {
        const { value, done } = await reader.read();
        if (done) break;
        seen += decoder.decode(value);
      }
    };
    await read(1);
    expect(changes()).toBeGreaterThanOrEqual(1);
    const before = changes();
    const note = await fetch(`${SITE}/api/v1/explorations/${token}/notes`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ text: 'A reply, word for word.' }),
    });
    expect(note.status).toBe(200);
    await read(before + 1);
    expect(changes()).toBeGreaterThan(before);
    ac.abort();
  });
});

describe('pages built on the site call the server', () => {
  test("a flower's page renders from the server's answer", async () => {
    const res = await fetch(`${SITE}/f/${FLOWER}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Who stands behind NEAR');
  });

  test('the landing page is the site', async () => {
    expect((await fetch(`${SITE}/`)).status).toBe(200);
  });
});

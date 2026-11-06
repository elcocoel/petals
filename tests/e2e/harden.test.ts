// T300: a forced attack on a real server process (harden-server.ts): HTTP on a free port, SQLite and
// files on disk, no model, no public source. A stranger with one address, then with many, tries to fill
// the disk and stall the process, at the real limits. Every address in here is a test address.
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const SERVER = join(import.meta.dirname, 'harden-server.ts');
const LONG = { timeout: 60_000 };

// biome-ignore lint/suspicious/noExplicitAny: walking what the server answers
type Out = Record<string, any>;

interface Server {
  url: string;
  child: ChildProcess;
  stateDir: string;
}

function start(stateDir: string, env: Record<string, string> = {}): Promise<Server> {
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', SERVER], {
    env: { ...process.env, PETAL_STATE_DIR: stateDir, PETAL_API_MOCK: '0', ...env },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((ok, no) => {
    let seen = '';
    child.stdout?.on('data', (d) => {
      seen += String(d);
      const port = /localhost:(\d+)/.exec(seen)?.[1];
      if (port) ok({ url: `http://127.0.0.1:${port}`, child, stateDir });
    });
    child.once('exit', (code) => no(new Error(`the server exited with ${code}: ${seen}`)));
  });
}

const stop = (s: Server) =>
  new Promise<void>((ok) => {
    s.child.removeAllListeners('exit');
    s.child.once('exit', () => ok());
    s.child.kill('SIGKILL');
  });

let botnet = 0;
/** A new caller, as Cloudflare would name one: a stranger with many addresses. And its own claim. */
const someoneNew = () => {
  const address = `203.0.${(botnet >> 8) & 255}.${botnet++ & 255}`;
  return { 'cf-connecting-ip': address, 'x-forwarded-for': address };
};

const post = (
  s: Server,
  path: string,
  body: unknown,
  headers: Record<string, string> = someoneNew(),
) =>
  fetch(`${s.url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const folderBytes = (dir: string) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .reduce((n, e) => n + statSync(join(e.parentPath, e.name)).size, 0);

/** A note at the size a stranger would pick. */
const NOTE = 'n'.repeat(2000);

/** An exploration with as many of the longest notes as it will take: the most a fork can copy. */
async function fullExploration(s: Server) {
  const made = (await (await post(s, '/api/v1/explorations', { question: 'seed' })).json()) as Out;
  const url = made.link.url as string;
  const path = `/api/v1/explorations/${url.slice(url.lastIndexOf('/') + 1)}/notes`;
  let notes = 0;
  while ((await post(s, path, { text: NOTE })).status === 200) notes++;
  return { made, notes };
}

describe('at the real limits', () => {
  let s: Server;
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'petal-attack-'));
    s = await start(dir);
  });
  afterAll(async () => {
    await stop(s);
    rmSync(dir, { recursive: true, force: true });
  });

  test(
    'a huge body is refused, declared or streamed, and the process carries on',
    LONG,
    async () => {
      const huge = 'x'.repeat(10 * 1024 * 1024);
      for (const path of ['/api/v1/publish/prepare', '/api/v1/explorations', '/mcp']) {
        const declared = await post(s, path, huge);
        expect(declared.status, path).toBe(400);
        expect(((await declared.json()) as Out).error.code, path).toBe('bad_input');
      }
      const chat = await post(s, '/api/v1/agent/chat', huge);
      expect(chat.status).toBe(400);

      let sent = 0;
      const chunks = new ReadableStream({
        pull(c) {
          if (sent > 10 * 1024 * 1024) return c.close();
          sent += 64 * 1024;
          c.enqueue(new Uint8Array(64 * 1024));
        },
      });
      const streamed = await fetch(`${s.url}/api/v1/figures`, {
        method: 'POST',
        headers: someoneNew(),
        body: chunks,
        duplex: 'half',
      } as RequestInit);
      expect(streamed.status).toBe(400);
      expect(sent).toBeLessThan(10 * 1024 * 1024);
      expect((await fetch(`${s.url}/api/v1/health`)).status).toBe(200);
    },
  );

  test('a batch at /mcp is refused', async () => {
    const batch = Array.from({ length: 100 }, (_, id) => ({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name: 'list_networks', arguments: {} },
    }));
    const res = await post(s, '/mcp', batch);
    expect(res.status).toBe(400);
    expect(((await res.json()) as Out).error.code).toBe('bad_input');
  });

  test('a fork loop stops at its cap, whatever address each request claims', LONG, async () => {
    const before = folderBytes(dir);
    const { made, notes } = await fullExploration(s);
    expect(notes).toBeLessThanOrEqual(100);
    const url = made.link.url as string;
    let forks = 0;
    let refusal: Out | undefined;
    for (let i = 0; i < 500 && !refusal; i++) {
      const res = await post(s, '/api/v1/explorations', { fork_of: url });
      if (res.status === 200) forks++;
      else refusal = { status: res.status, ...((await res.json()) as Out) };
    }
    expect(refusal?.status).toBe(429);
    expect(refusal?.error.code).toBe('rate_limited');
    expect(refusal?.error.retry_after_s).toBeGreaterThan(0);
    // the seed counted, and every fork that got through
    expect(forks).toBe(99);
    const grown = folderBytes(dir) - before;
    console.log(
      `fork loop: ${forks} forks, then ${refusal?.error.code}; the folder grew ${Math.round(grown / 1e6)} MB`,
    );
    expect(grown).toBeLessThan(150 * 1024 * 1024);
  });

  test('spoofed headers get no fresh limit', async () => {
    const spoof = () => {
      const n = () => Math.floor(Math.random() * 250);
      return {
        'x-forwarded-for': `${n()}.${n()}.${n()}.${n()}`,
        'x-real-ip': `${n()}.${n()}.${n()}.${n()}`,
      };
    };
    const seen: number[] = [];
    for (let i = 0; i < 61; i++) {
      seen.push((await fetch(`${s.url}/api/v1/networks`, { headers: spoof() })).status);
    }
    expect(seen.filter((x) => x === 429).length).toBeGreaterThan(0);
    expect(seen.at(-1)).toBe(429);
    // a caller Cloudflare names is someone else
    expect((await fetch(`${s.url}/api/v1/networks`, { headers: someoneNew() })).status).toBe(200);
  });

  test(
    'two fresh reads at once, then a refusal, and nothing else waits for them',
    LONG,
    async () => {
      const read = () => post(s, '/api/v1/snapshots', { network: 'slow-live', fresh: true });
      const reads = [read(), read(), read()];
      // the refusal comes at once, while the other two hold the two turns
      const third = await Promise.race(reads);
      expect(third.status).toBe(429);
      expect(third.headers.get('retry-after')).toBeTruthy();
      const refused = (await third.json()) as Out;
      expect(refused.error.code).toBe('rate_limited');

      // while both are running: stored data, health, and a whole run of the agent to its flower
      const t0 = Date.now();
      const stored = await post(s, '/api/v1/snapshots', { network: 'near-validators' });
      expect(stored.status).toBe(200);
      expect((await stored.json()) as Out).toMatchObject({ reused: true });
      expect((await fetch(`${s.url}/api/v1/health`)).status).toBe(200);
      console.log(`while two fresh reads ran: stored read and health in ${Date.now() - t0} ms`);
      const chat = await post(s, '/api/v1/agent/chat', {
        messages: [{ role: 'user', content: 'who stands behind NEAR’s validators?' }],
      });
      expect(chat.status).toBe(200);
      expect(await chat.text()).toMatch(/event: flower/);

      const statuses = (await Promise.all(reads)).map((r) => r.status).sort();
      expect(statuses).toEqual([200, 200, 429]);
      const again = await read();
      expect(again.status).toBe(200);
    },
  );

  test('a restart forgets none of the day’s caps', LONG, async () => {
    await stop(s);
    s = await start(dir);
    const out = await post(s, '/api/v1/explorations', { question: 'after a restart' });
    expect(out.status).toBe(429);
    expect(((await out.json()) as Out).error.code).toBe('rate_limited');
  });
});

describe('at the budget’s edge', () => {
  let s: Server;
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'petal-attack-'));
    s = await start(dir, {
      PETAL_DATA_MAX_MB: '1',
      PETAL_DATA_CHECK_S: '0',
      PETAL_FRESH_PER_DAY: '2',
      HARDEN_READ_MS: '10',
    });
  });
  afterAll(async () => {
    await stop(s);
    rmSync(dir, { recursive: true, force: true });
  });

  test('the fresh-read limit for the day: only real reads count', LONG, async () => {
    const read = () => post(s, '/api/v1/snapshots', { network: 'slow-live', fresh: true });
    for (let i = 0; i < 3; i++) {
      expect((await post(s, '/api/v1/snapshots', { network: 'near-validators' })).status).toBe(200);
    }
    expect((await read()).status).toBe(200);
    expect((await read()).status).toBe(200);
    const over = await read();
    expect(over.status).toBe(429);
    const { error } = (await over.json()) as Out;
    expect(error.code).toBe('rate_limited');
    expect(error.message).toMatch(/fresh reads for today/);
    expect((await post(s, '/api/v1/snapshots', { network: 'near-validators' })).status).toBe(200);
  });

  test(
    'the data budget: a stranger’s writes stop, in plain words, and stored data still answers',
    LONG,
    async () => {
      const { made } = await fullExploration(s);
      const url = made.link.url as string;
      let refusal: Out | undefined;
      for (let i = 0; i < 60 && !refusal; i++) {
        const res = await post(s, '/api/v1/explorations', { fork_of: url });
        if (res.status !== 200) refusal = { status: res.status, ...((await res.json()) as Out) };
      }
      expect(refusal?.status).toBe(429);
      expect(refusal?.error.code).toBe('budget_exhausted');
      expect(refusal?.error.message).toMatch(/full/);
      const bytes = folderBytes(dir);
      console.log(`data budget: refused at ${Math.round(bytes / 1024)} KiB of a 1024 KiB budget`);

      const note = await post(s, '/api/v1/explorations', { question: 'one more' });
      expect(((await note.json()) as Out).error.code).toBe('budget_exhausted');
      expect((await post(s, '/api/v1/snapshots', { network: 'near-validators' })).status).toBe(200);
      const fresh = await post(s, '/api/v1/snapshots', { network: 'slow-live', fresh: true });
      expect(fresh.status).toBe(429);
      expect((await fetch(`${s.url}/api/v1/health`)).status).toBe(200);
    },
  );
});

// T192, T193, T196: sign-in, run owners and who pays, through petalApp over HTTP shapes. Browsers are
// cookie jars. The NEP-413 signer and RPC are the test ones; the chain itself is in tests/e2e/auth-path.ts.
import { join } from 'node:path';
import {
  fakeRpc,
  fakeRpcFor,
  functionCall,
  implicitSigner,
  testSigner,
} from '@petal/near/auth/testing';
import { openStore } from '@petal/store';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { buildPetalApp } from '../src/app.ts';
import { mintInvite, revokeInvite } from '../src/invites.ts';
import type { LlmClient } from '../src/llm.ts';
import { HAND_TRANSCRIPT, recordedClient } from '../src/recorded.ts';
import { walletCipher } from '../src/wallet-cipher.ts';
import { fakeRegistry, parseSse, scriptedLlm, tmpRoot } from './helpers.ts';

const SITE = 'https://petals.example';
const WALLET_KEY = 'ab'.repeat(32);
const COOKIE = '__Host-petal_session';
const maker = testSigner('maker.testnet');
const QUESTION = { messages: [{ role: 'user', content: 'who holds the power here?' }] };
const answers = (n: number) => Array.from({ length: n }, () => ({ content: 'an answer' }));

type App = ReturnType<typeof buildPetalApp>;

interface Setup {
  access?: string;
  llm?: LlmClient;
  rpc?: Parameters<typeof fakeRpcFor>[0] | ReturnType<typeof fakeRpc>;
  apiBase?: string;
  dailyUsd?: number;
}

function setup(o: Setup = {}) {
  const root = tmpRoot();
  const stateDir = join(root, 'state');
  const llm = o.llm ?? scriptedLlm(answers(20), { costUsd: 0.01 });
  const rpc = Array.isArray(o.rpc) ? fakeRpcFor(o.rpc) : (o.rpc ?? fakeRpcFor([maker]));
  const app = buildPetalApp(
    {
      root,
      stateDir,
      apiBase: o.apiBase ?? SITE,
      llmDailyUsd: o.dailyUsd ?? 1,
    },
    {
      llm,
      rpcFor: () => rpc,
      registry: fakeRegistry().registry,
      env: {
        PETAL_AGENT_ACCESS: o.access ?? 'gated',
        PETAL_WALLET_KEY: WALLET_KEY,
        NODE_ENV: 'test',
      },
    },
  );
  return { app, llm, rpc, stateDir, store: () => openStore(join(stateDir, 'private.db')) };
}

/** A browser: it keeps cookies, and sends the site's Origin on a POST, as a real one does. */
class Browser {
  jar = new Map<string, string>();
  app: App;
  origin: string | null;
  constructor(app: App, origin: string | null = SITE) {
    this.app = app;
    this.origin = origin;
  }
  async request(path: string, init: RequestInit & { json?: unknown } = {}) {
    const headers = new Headers(init.headers);
    const cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) headers.set('cookie', cookie);
    if (this.origin && init.method === 'POST') headers.set('origin', this.origin);
    if (init.json !== undefined) headers.set('content-type', 'application/json');
    const res = await this.app.request(path, {
      ...init,
      headers,
      ...(init.json === undefined ? {} : { body: JSON.stringify(init.json) }),
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair = '', ...attrs] = line.split('; ');
      const at = pair.indexOf('=');
      const name = pair.slice(0, at);
      if (attrs.includes('Max-Age=0')) this.jar.delete(name);
      else this.jar.set(name, pair.slice(at + 1));
    }
    return res;
  }
  post = (path: string, json: unknown = {}) => this.request(path, { method: 'POST', json });
  get = (path: string, headers: Record<string, string> = {}) => this.request(path, { headers });
  chat = (json: unknown = QUESTION) => this.post('/api/v1/agent/chat', json);
  /** Sign in with a fresh challenge, as a wallet would. */
  async signIn(signer = maker, network = 'testnet') {
    const ch = (await (await this.post('/api/v1/auth/challenge')).json()) as Challenge;
    const proof = signer.sign({ message: ch.message, nonce: ch.nonce, recipient: ch.recipient });
    return this.post('/api/v1/auth/verify', { network, proof });
  }
}

interface Challenge {
  nonce: string;
  message: string;
  recipient: string;
  expires_at: string;
}
interface Err {
  error: { code: string; message: string; hint?: string };
}

async function runOfChat(
  res: Response,
): Promise<{ id: string; events: ReturnType<typeof parseSse> }> {
  const events = parseSse(await res.text());
  const first = events[0]?.data as { run_id: string } | undefined;
  return { id: first?.run_id ?? '', events };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('T192: POST /api/v1/auth/challenge', () => {
  test('a nonce, a plain sentence and the site’s hostname as recipient', async () => {
    const { app } = setup();
    const res = await new Browser(app).post('/api/v1/auth/challenge');
    expect(res.status).toBe(200);
    const ch = (await res.json()) as Challenge & { tools_version: string };
    expect(ch.recipient).toBe('petals.example');
    expect(ch.message).toMatch(/^Sign in to Petals at petals\.example\. /);
    expect(Buffer.from(ch.nonce, 'base64')).toHaveLength(32);
    expect(Date.parse(ch.expires_at)).toBeGreaterThan(Date.now());
    expect(ch.tools_version).toBe('tools/v1');
  });

  test('a Host header can’t choose the recipient', async () => {
    const { app } = setup();
    const res = await new Browser(app).request('/api/v1/auth/challenge', {
      method: 'POST',
      headers: { host: 'evil.example' },
    });
    expect(((await res.json()) as Challenge).recipient).toBe('petals.example');
  });
});

describe('T192: POST /api/v1/auth/verify', () => {
  test('finds or creates the person, binds the wallet, sets the session, and /me answers', async () => {
    const { app } = setup();
    const b = new Browser(app);
    const res = await b.signIn();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { person_id: string; wallets: unknown[]; network: string };
    expect(body.person_id).toMatch(/^prs_[0-9a-f]{32}$/);
    expect(body.network).toBe('testnet');
    const cookie = res.headers.getSetCookie().join();
    expect(cookie).toContain(`${COOKIE}=`);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=2592000/);
    expect(res.headers.get('cache-control')).toBe('no-store');

    const me = await b.get('/api/v1/me');
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      person_id: body.person_id,
      network: 'testnet',
      wallets: [
        { caip10: 'near:testnet:maker.testnet', network: 'testnet', account_id: 'maker.testnet' },
      ],
    });
    expect(me.headers.get('cache-control')).toBe('no-store');
  });

  test('the same wallet is the same person from another browser', async () => {
    const { app } = setup();
    const ids = await Promise.all(
      [new Browser(app), new Browser(app)].map(async (b) => {
        return ((await (await b.signIn()).json()) as { person_id: string }).person_id;
      }),
    );
    expect(ids[0]).toBe(ids[1]);
  });

  test('near:testnet: and near:mainnet: are different wallets, so different people', async () => {
    const signer = implicitSigner('both-networks');
    const { app } = setup({ rpc: fakeRpc({}) });
    const a = new Browser(app);
    const b = new Browser(app);
    const ta = (await (await a.signIn(signer, 'testnet')).json()) as { person_id: string };
    const mb = (await (await b.signIn(signer, 'mainnet')).json()) as { person_id: string };
    expect(ta.person_id).not.toBe(mb.person_id);
    expect(await (await b.get('/api/v1/me')).json()).toMatchObject({
      network: 'mainnet',
      wallets: [{ caip10: `near:mainnet:${signer.accountId}`, network: 'mainnet' }],
    });
  });

  test('an unfunded implicit account can sign in', async () => {
    const signer = implicitSigner('new-person');
    const { app } = setup({ rpc: fakeRpc({}) });
    const res = await new Browser(app).signIn(signer);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      wallets: [{ account_id: signer.accountId, network: 'testnet' }],
    });
  });

  test('a person signing in with another wallet changes person; nothing is merged', async () => {
    const other = testSigner('other.testnet');
    const { app, store } = setup({ rpc: [maker, other] });
    const b = new Browser(app);
    const first = (await (await b.signIn()).json()) as { person_id: string };
    const second = (await (await b.signIn(other)).json()) as { person_id: string };
    expect(second.person_id).not.toBe(first.person_id);
    const s = store();
    expect(s.walletBinding.ofPerson(first.person_id)).toHaveLength(1);
    expect(s.walletBinding.ofPerson(second.person_id)).toHaveLength(1);
    s.close();
  });
});

describe('T192: refusals', () => {
  const refused = async (res: Response, reason: RegExp) => {
    expect(res.status).toBe(401);
    const { error } = (await res.json()) as Err;
    expect(error.code).toBe('unauthorised');
    expect(error.message).toMatch(reason);
    expect(res.headers.getSetCookie()).toEqual([]);
  };

  test('a replayed nonce', async () => {
    const { app } = setup();
    const b = new Browser(app);
    const ch = (await (await b.post('/api/v1/auth/challenge')).json()) as Challenge;
    const proof = maker.sign({ message: ch.message, nonce: ch.nonce, recipient: ch.recipient });
    const body = { network: 'testnet', proof };
    expect((await b.post('/api/v1/auth/verify', body)).status).toBe(200);
    await refused(await new Browser(app).post('/api/v1/auth/verify', body), /already used/);
  });

  test('a nonce this server never issued', async () => {
    const { app } = setup();
    const ch = (await (await new Browser(app).post('/api/v1/auth/challenge')).json()) as Challenge;
    const proof = maker.sign({
      message: ch.message,
      nonce: Buffer.alloc(32, 7).toString('base64'),
      recipient: ch.recipient,
    });
    await refused(
      await new Browser(app).post('/api/v1/auth/verify', { network: 'testnet', proof }),
      /not issued/,
    );
  });

  test('a wrong recipient, even with the proof claiming the right one', async () => {
    const { app } = setup();
    const b = new Browser(app);
    const ch = (await (await b.post('/api/v1/auth/challenge')).json()) as Challenge;
    const forOther = maker.sign({
      message: ch.message,
      nonce: ch.nonce,
      recipient: 'evil.example',
    });
    await refused(
      await b.post('/api/v1/auth/verify', { network: 'testnet', proof: forOther }),
      /recipient must be petals\.example/,
    );
    await refused(
      await b.post('/api/v1/auth/verify', {
        network: 'testnet',
        proof: { ...forOther, recipient: ch.recipient },
      }),
      /signature does not match/,
    );
  });

  test('another message, a bad signature, a key that isn’t the account’s, a function-call key', async () => {
    const agent = testSigner('maker.testnet', 'agent-key');
    const stranger = testSigner('maker.testnet', 'not-a-key-of-it');
    const rpc = fakeRpc({
      'maker.testnet': { [maker.publicKey]: 'FullAccess', [agent.publicKey]: functionCall() },
    });
    const { app } = setup({ rpc });
    const b = new Browser(app);
    const challenge = async () =>
      (await (await b.post('/api/v1/auth/challenge')).json()) as Challenge;
    const verify = (proof: unknown) => b.post('/api/v1/auth/verify', { network: 'testnet', proof });

    let ch = await challenge();
    const words = maker.sign({
      message: 'something else',
      nonce: ch.nonce,
      recipient: ch.recipient,
    });
    await refused(await verify(words), /message/);
    await refused(await verify({ ...words, message: ch.message }), /signature does not match/);
    ch = await challenge();
    await refused(
      await verify(
        stranger.sign({ message: ch.message, nonce: ch.nonce, recipient: ch.recipient }),
      ),
      /not a key of/,
    );
    ch = await challenge();
    await refused(
      await verify(agent.sign({ message: ch.message, nonce: ch.nonce, recipient: ch.recipient })),
      /full-access/,
    );
  });

  test('a bad body: the network or the proof', async () => {
    const { app } = setup();
    const b = new Browser(app);
    for (const body of [
      {},
      { network: 'devnet', proof: {} },
      { network: 'testnet' },
      { network: 'testnet', proof: { account_id: 'NOT VALID' } },
    ]) {
      const res = await b.post('/api/v1/auth/verify', body);
      expect(res.status).toBe(400);
      expect(((await res.json()) as Err).error.code).toBe('bad_input');
    }
  });

  test('an RPC that can’t answer changes nothing, and the same proof works later', async () => {
    const good = fakeRpcFor([maker]);
    let up = false;
    const rpc = {
      query<T>(params: { request_type: string }) {
        if (!up) return Promise.reject(new Error(`fetch failed for ${maker.accountId}`));
        return good.query<T>(params);
      },
    };
    const error = vi.spyOn(console, 'error');
    const { app } = setup({ rpc: rpc as never });
    const b = new Browser(app);
    const ch = (await (await b.post('/api/v1/auth/challenge')).json()) as Challenge;
    const proof = maker.sign({ message: ch.message, nonce: ch.nonce, recipient: ch.recipient });
    const down = await b.post('/api/v1/auth/verify', { network: 'testnet', proof });
    expect(down.status).toBe(502);
    expect(JSON.stringify(await down.json())).not.toContain(maker.accountId);
    expect(error).not.toHaveBeenCalled();
    up = true;
    expect((await b.post('/api/v1/auth/verify', { network: 'testnet', proof })).status).toBe(200);
  });

  test.each([
    ['another site', 'https://evil.example'],
    ['a sibling on the same domain', 'https://other.petals.example'],
    ['http rather than https', 'http://petals.example'],
    ['a sandboxed page', 'null'],
  ])('a bad Origin on every POST: %s', async (_name, origin) => {
    const { app, llm } = setup({ access: 'open' });
    const b = new Browser(app, origin);
    for (const path of [
      '/api/v1/auth/challenge',
      '/api/v1/auth/verify',
      '/api/v1/auth/logout',
      '/api/v1/auth/invite',
      '/api/v1/agent/chat',
    ]) {
      const res = await b.post(path, QUESTION);
      expect(res.status, path).toBe(401);
      expect(((await res.json()) as Err).error.message).toMatch(/another site/);
      expect(res.headers.getSetCookie(), path).toEqual([]);
    }
    expect((llm as ReturnType<typeof scriptedLlm>).requests).toHaveLength(0);
  });

  test('no Origin but Sec-Fetch-Site says cross-site: refused. Neither: not a browser, allowed', async () => {
    const { app } = setup();
    const b = new Browser(app, null);
    const cross = await b.request('/api/v1/auth/challenge', {
      method: 'POST',
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    expect(cross.status).toBe(401);
    expect((await b.post('/api/v1/auth/challenge')).status).toBe(200);
  });

  test('a page on a local site must match the address it asked', async () => {
    const { app } = setup({ apiBase: 'http://localhost:8787', access: 'open' });
    const here = await app.request('/api/v1/auth/challenge', {
      method: 'POST',
      headers: { origin: 'http://localhost:3080', host: 'localhost:3080' },
    });
    expect(here.status).toBe(200);
    expect(((await here.json()) as Challenge).recipient).toBe('localhost');
    const otherPort = await app.request('/api/v1/auth/challenge', {
      method: 'POST',
      headers: { origin: 'http://localhost:9999', host: 'localhost:3080' },
    });
    expect(otherPort.status).toBe(401);
    const notLocal = await app.request('/api/v1/auth/challenge', {
      method: 'POST',
      headers: { origin: 'https://evil.example', host: 'localhost:3080' },
    });
    expect(notLocal.status).toBe(401);
  });

  test('too many tries from one address', async () => {
    const { app } = setup();
    const b = new Browser(app);
    const res = await Promise.all(
      Array.from({ length: 35 }, () =>
        b.request('/api/v1/auth/challenge', {
          method: 'POST',
          headers: { 'x-forwarded-for': '203.0.113.9' },
        }),
      ),
    );
    expect(res.filter((r) => r.status === 429).length).toBe(5);
  });
});

describe('T192: sessions', () => {
  test('on http://localhost the cookie is plainly named, and not Secure', async () => {
    const { app } = setup({ apiBase: 'http://localhost:3183' });
    const b = new Browser(app, 'http://localhost:3183');
    const res = await b.signIn();
    const cookie = res.headers.getSetCookie().join();
    expect(cookie).toMatch(/^petal_session=/);
    expect(cookie).not.toMatch(/Secure/);
    expect((await b.get('/api/v1/me')).status).toBe(200);
  });

  test('only a hash is stored, and a value that is merely close gets nothing', async () => {
    const { app, store } = setup();
    const b = new Browser(app);
    await b.signIn();
    const value = b.jar.get(COOKIE) ?? '';
    expect(Buffer.from(value, 'base64url')).toHaveLength(32);
    const s = store();
    expect(s.session.get(value, new Date().toISOString())).toBeNull();
    s.close();
    b.jar.set(COOKIE, `${value}x`);
    expect((await b.get('/api/v1/me')).status).toBe(401);
  });

  test('/me says nothing to anyone else: no session, an anonymous one, or after logout', async () => {
    const { app } = setup({ access: 'open' });
    const nobody = await new Browser(app).get('/api/v1/me');
    expect(nobody.status).toBe(401);
    const said = JSON.stringify(await nobody.json());
    expect(said).not.toMatch(/prs_|near:/);

    const anon = new Browser(app);
    await (await anon.chat()).text();
    expect(anon.jar.get(COOKIE)).toBeTruthy();
    expect((await anon.get('/api/v1/me')).status).toBe(401);

    const b = new Browser(app);
    await b.signIn();
    const value = b.jar.get(COOKIE) ?? '';
    const out = await b.post('/api/v1/auth/logout');
    expect(out.status).toBe(200);
    expect(out.headers.getSetCookie().join()).toMatch(/Max-Age=0/);
    expect((await b.get('/api/v1/me')).status).toBe(401);
    b.jar.set(COOKIE, value);
    expect((await b.get('/api/v1/me')).status).toBe(401);
  });

  test('a session expires after 30 days', async () => {
    let at = Date.parse('2026-11-05T12:00:00Z');
    const root = tmpRoot();
    const app = buildPetalApp(
      { root, stateDir: join(root, 'state'), apiBase: SITE },
      {
        llm: scriptedLlm([]),
        rpcFor: () => fakeRpcFor([maker]),
        registry: fakeRegistry().registry,
        clock: () => at,
        env: { PETAL_WALLET_KEY: WALLET_KEY, NODE_ENV: 'test' },
      },
    );
    const b = new Browser(app);
    const ch = (await (await b.post('/api/v1/auth/challenge')).json()) as Challenge;
    // the nonce store uses the real clock, so the challenge is fresh by it
    const proof = maker.sign({ message: ch.message, nonce: ch.nonce, recipient: ch.recipient });
    expect((await b.post('/api/v1/auth/verify', { network: 'testnet', proof })).status).toBe(200);
    at += 29 * 86_400_000;
    expect((await b.get('/api/v1/me')).status).toBe(200);
    at += 2 * 86_400_000;
    expect((await b.get('/api/v1/me')).status).toBe(401);
  });

  test('credentialed routes send no CORS headers; the public tools stay open', async () => {
    const { app } = setup();
    const b = new Browser(app, 'https://evil.example');
    for (const res of [
      await b.get('/api/v1/me'),
      await b.get('/api/v1/auth/invite'),
      await app.request('/api/v1/auth/verify', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://evil.example',
          'access-control-request-method': 'POST',
        },
      }),
      await app.request('/api/v1/me', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://evil.example',
          'access-control-request-method': 'GET',
        },
      }),
    ]) {
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
      expect(res.headers.get('access-control-allow-credentials')).toBeNull();
    }
    const tools = await b.get('/api/v1/networks');
    expect(tools.headers.get('access-control-allow-origin')).toBe('*');
    expect(tools.headers.get('access-control-allow-credentials')).toBeNull();
  });
});

describe('T192: what is kept', () => {
  test('addresses are sealed, indexed by a keyed hash, and absent from the database and logs', async () => {
    const lines: string[] = [];
    for (const m of ['log', 'info', 'warn', 'error'] as const) {
      vi.spyOn(console, m).mockImplementation((...a) => {
        lines.push(a.join(' '));
      });
    }
    const { app, stateDir, store } = setup();
    const b = new Browser(app);
    await b.signIn();
    const s = store();
    const person = ((await (await b.get('/api/v1/me')).json()) as { person_id: string }).person_id;
    const [w] = s.walletBinding.ofPerson(person);
    const cipher = walletCipher(Buffer.from(WALLET_KEY, 'hex'));
    expect(w?.network).toBe('testnet');
    expect(cipher.open(w?.caip10_encrypted ?? '')).toBe('near:testnet:maker.testnet');
    expect(w?.caip10_hash).toBe(cipher.index('near:testnet:maker.testnet'));
    expect(w?.caip10_hash).not.toBe(
      walletCipher(Buffer.alloc(32, 1)).index('near:testnet:maker.testnet'),
    );
    s.close();

    const { readFileSync, readdirSync } = await import('node:fs');
    for (const name of readdirSync(stateDir)) {
      const bytes = readFileSync(join(stateDir, name));
      expect(bytes.includes('maker.testnet'), name).toBe(false);
      expect(bytes.includes(b.jar.get(COOKIE) ?? 'x'), name).toBe(false);
    }
    expect(lines.join('\n')).not.toContain('maker.testnet');
  });

  test('nothing says whether an address already has an account', async () => {
    const { app } = setup();
    const before = await new Browser(app).post('/api/v1/auth/verify', {
      network: 'testnet',
      proof: { ...maker.sign({ message: 'x', nonce: Buffer.alloc(32, 1), recipient: 'y' }) },
    });
    const beforeBody = await before.text();
    await new Browser(app).signIn();
    const after = await new Browser(app).post('/api/v1/auth/verify', {
      network: 'testnet',
      proof: { ...maker.sign({ message: 'x', nonce: Buffer.alloc(32, 1), recipient: 'y' }) },
    });
    expect(after.status).toBe(before.status);
    expect(await after.text()).toBe(beforeBody);
    // and a first sign-in reads like a returning one
    const first = (await (await new Browser(app).signIn()).json()) as Record<string, unknown>;
    expect(Object.keys(first).sort()).toEqual(
      ['claimed_runs', 'network', 'person_id', 'tools_version', 'wallets'].sort(),
    );
  });
});

describe('T193: run owners', () => {
  const notFoundBody = (id: string) => ({
    error: { code: 'not_found', message: `no run ${id}` },
    tools_version: 'tools/v1',
  });

  test('a run started without sign-in belongs to that anonymous handle, and to no one else', async () => {
    const { app, store } = setup({ access: 'open' });
    const mine = new Browser(app);
    const res = await mine.chat();
    expect(res.headers.getSetCookie().join()).toContain(`${COOKIE}=`);
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
    const { id } = await runOfChat(res);

    const read = await mine.get(`/api/v1/agent/runs/${id}`);
    expect(read.status).toBe(200);
    const text = await read.text();
    const s = store();
    const owner = await s.run.get(id)?.owner;
    s.close();
    expect(owner).toMatch(/^anon_/);
    expect(text).not.toContain(owner as string);
    expect(JSON.parse(text)).not.toHaveProperty('owner');
    const followed = await mine.get(`/api/v1/agent/runs/${id}`, { accept: 'text/event-stream' });
    expect(parseSse(await followed.text()).at(-1)?.event).toBe('done');

    const stranger = new Browser(app);
    for (const res of [
      await stranger.get(`/api/v1/agent/runs/${id}`),
      await stranger.get(`/api/v1/agent/runs/${id}`, { accept: 'text/event-stream' }),
      await stranger.chat({ ...QUESTION, run_id: id }),
      await new Browser(app, null).get(`/api/v1/agent/runs/${id}`),
    ]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(notFoundBody(id));
    }
    // exactly what a run that never existed says
    const none = 'a'.repeat(24);
    expect(await (await stranger.get(`/api/v1/agent/runs/${none}`)).json()).toEqual(
      notFoundBody(none),
    );
  });

  test('its owner can continue it; a stranger holding an invite still can’t', async () => {
    const { app, store } = setup();
    const s = store();
    const { token } = mintInvite(s, { usd: 1 });
    s.close();
    const mine = new Browser(app);
    await mine.post('/api/v1/auth/invite', { token });
    const { id } = await runOfChat(await mine.chat());
    const next = await mine.chat({
      messages: [{ role: 'user', content: 'and then?' }],
      run_id: id,
    });
    expect(next.status).toBe(200);
    await next.text();

    const stranger = new Browser(app);
    await stranger.post('/api/v1/auth/invite', { token });
    const res = await stranger.chat({ ...QUESTION, run_id: id });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(notFoundBody(id));
  });

  test('a run still going says nothing to a stranger either', async () => {
    const llm = scriptedLlm(answers(2), { delayMs: 150 });
    const { app } = setup({ access: 'open', llm });
    const mine = new Browser(app);
    const res = await mine.chat();
    const reader = res.body?.getReader();
    const first = new TextDecoder().decode((await reader?.read())?.value);
    const id = /"run_id":"([^"]+)"/.exec(first)?.[1] ?? '';
    const stranger = new Browser(app);
    const cont = await stranger.chat({ ...QUESTION, run_id: id });
    expect(cont.status).toBe(404);
    expect(((await cont.json()) as Err).error.message).toBe(`no run ${id}`);
    await reader?.cancel();
  });

  test('sign-in claims the handle’s runs in one step; another browser comes back to them', async () => {
    const { app, store } = setup({ access: 'open' });
    const mine = new Browser(app);
    const a = await runOfChat(await mine.chat());
    const b = await runOfChat(await mine.chat());
    const handle = mine.jar.get(COOKIE);
    const stranger = new Browser(app);
    expect((await stranger.get(`/api/v1/agent/runs/${a.id}`)).status).toBe(404);

    const signed = await mine.signIn();
    const body = (await signed.json()) as { person_id: string; claimed_runs: number };
    expect(body.claimed_runs).toBe(2);
    const s = store();
    expect(s.run.get(a.id)?.owner).toBe(body.person_id);
    expect(s.run.get(b.id)?.owner).toBe(body.person_id);
    s.close();
    expect(mine.jar.get(COOKIE)).not.toBe(handle);
    expect((await mine.get(`/api/v1/agent/runs/${a.id}`)).status).toBe(200);
    expect((await stranger.get(`/api/v1/agent/runs/${a.id}`)).status).toBe(404);

    // the old handle's cookie is finished
    const old = new Browser(app);
    old.jar.set(COOKIE, handle ?? '');
    expect((await old.get(`/api/v1/agent/runs/${a.id}`)).status).toBe(404);

    const phone = new Browser(app);
    await phone.signIn();
    expect((await phone.get(`/api/v1/agent/runs/${a.id}`)).status).toBe(200);
    const cont = await phone.chat({ messages: [{ role: 'user', content: 'on' }], run_id: a.id });
    expect(cont.status).toBe(200);
    await cont.text();
  });

  test('a person signing in with another wallet leaves their runs where they are', async () => {
    const other = testSigner('other.testnet');
    const { app } = setup({ access: 'open', rpc: [maker, other] });
    const b = new Browser(app);
    await b.signIn();
    const { id } = await runOfChat(await b.chat());
    const second = (await (await b.signIn(other)).json()) as { claimed_runs: number };
    expect(second.claimed_runs).toBe(0);
    expect((await b.get(`/api/v1/agent/runs/${id}`)).status).toBe(404);
    await b.signIn();
    expect((await b.get(`/api/v1/agent/runs/${id}`)).status).toBe(200);
  });

  test('existing unowned runs stay readable by link, and stay unowned when continued', async () => {
    const { app, store } = setup({ access: 'open' });
    const s = store();
    const at = new Date().toISOString();
    s.run.insert({
      id: 'old-run-1',
      owner: null,
      exploration: null,
      status: 'done',
      model: null,
      body: JSON.stringify({ messages: [{ role: 'user', content: 'from before' }] }),
      created_at: at,
      updated_at: at,
    });
    s.close();
    const anyone = new Browser(app, null);
    expect((await anyone.get('/api/v1/agent/runs/old-run-1')).status).toBe(200);
    const cont = await anyone.chat({
      messages: [{ role: 'user', content: 'on' }],
      run_id: 'old-run-1',
    });
    expect(cont.status).toBe(200);
    await cont.text();
    const again = store();
    expect(again.run.get('old-run-1')?.owner).toBeNull();
    again.close();
  });
});

describe('T196: who pays', () => {
  const recorded = () => recordedClient(HAND_TRANSCRIPT);

  test('gated, no invite: refused in plain words, with nothing spent or stored', async () => {
    const { app, llm, store } = setup();
    const b = new Browser(app);
    const res = await b.chat();
    expect(res.status).toBe(403);
    const { error } = (await res.json()) as Err;
    expect(error.code).toBe('invite_required');
    expect(error.message).toMatch(/nothing was spent/);
    expect(error.hint).toMatch(/\/connect/);
    expect(res.headers.getSetCookie()).toEqual([]);
    expect((llm as ReturnType<typeof scriptedLlm>).requests).toHaveLength(0);
    const s = store();
    const today = new Date().toISOString().slice(0, 10);
    expect(s.ledger.get(today)).toMatchObject({ usd: 0, reserved_usd: 0 });
    s.close();
  });

  test('gated is the default, and anything but `open` is gated', async () => {
    for (const value of [undefined, '', 'OPEN', 'opne', 'gated']) {
      const root = tmpRoot();
      const llm = scriptedLlm([]);
      const app = buildPetalApp(
        { root, stateDir: join(root, 'state'), apiBase: SITE },
        {
          llm,
          registry: fakeRegistry().registry,
          env: { PETAL_AGENT_ACCESS: value, PETAL_WALLET_KEY: WALLET_KEY, NODE_ENV: 'test' },
        },
      );
      expect((await new Browser(app).chat()).status).toBe(403);
      expect(llm.requests).toHaveLength(0);
    }
  });

  test('open: the local app’s own tool needs no invite, and health says which it is', async () => {
    const { app } = setup({ access: 'open' });
    const res = await new Browser(app).chat();
    expect(res.status).toBe(200);
    expect(parseSse(await res.text()).at(-1)?.event).toBe('done');
    expect(await (await app.request('/api/v1/health')).json()).toMatchObject({
      agent_access: 'open',
    });
    const gated = setup();
    expect(await (await gated.app.request('/api/v1/health')).json()).toMatchObject({
      agent_access: 'gated',
    });
  });

  test('gated keeps the recorded demo, viewing and the tools open, with no sign-in', async () => {
    const { app } = setup({ llm: recorded() });
    const visitor = new Browser(app, 'https://elsewhere.example');
    const res = await visitor.chat();
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()).toEqual([]);
    const { id, events } = await runOfChat(res);
    expect(events.at(-1)?.event).toBe('done');
    expect((await visitor.get(`/api/v1/agent/runs/${id}`)).status).toBe(200);
    expect((await new Browser(app, null).get(`/api/v1/agent/runs/${id}`)).status).toBe(200);
    expect((await visitor.get('/api/v1/networks')).status).toBe(200);
    expect((await visitor.get('/api/v1/health')).status).toBe(200);
  });

  test('redeem, chat, and the invite and the day’s ledger both draw down', async () => {
    const { app, store, llm } = setup({ llm: scriptedLlm(answers(4), { costUsd: 0.01 }) });
    const s = store();
    const { token, id } = mintInvite(s, { usd: 0.5, days: 7 });
    s.close();
    const b = new Browser(app);
    const redeemed = await b.post('/api/v1/auth/invite', { token });
    expect(redeemed.status).toBe(200);
    expect(redeemed.headers.getSetCookie().join()).toContain(`${COOKIE}=`);
    expect(await redeemed.json()).toMatchObject({
      invite: { status: 'active', budget_usd: 0.5, spent_usd: 0, left_usd: 0.5 },
    });

    const res = await b.chat();
    expect(res.status).toBe(200);
    expect(parseSse(await res.text()).map((e) => e.event)).toContain('message');
    expect((llm as ReturnType<typeof scriptedLlm>).requests).toHaveLength(1);

    const state = (await (await b.get('/api/v1/auth/invite')).json()) as {
      invite: { spent_usd: number; left_usd: number };
    };
    expect(state.invite.spent_usd).toBeCloseTo(0.01, 9);
    expect(state.invite.left_usd).toBeCloseTo(0.49, 9);
    const after = store();
    const today = new Date().toISOString().slice(0, 10);
    expect(after.ledger.get(today).usd).toBeCloseTo(0.01, 9);
    expect(after.ledger.get(today).reserved_usd).toBe(0);
    expect(after.credit.get(`invite:${id}`)?.reserved_usd).toBe(0);
    expect(after.credit.entries(`invite:${id}`).map((e) => e.delta_usd)).toEqual(
      expect.arrayContaining([0.5, -0.01]),
    );
    const invite = after.invite.get(id);
    expect(JSON.stringify(invite)).not.toContain(token);
    after.close();
  });

  test('at the budget’s end: a plain message mid-chat, then a refusal before any call', async () => {
    // a tool round each time, so one chat would keep buying
    const llm = scriptedLlm(
      Array.from({ length: 10 }, () => ({ calls: [{ name: 'list_networks', args: {} }] })),
      { costUsd: 0.02 },
    );
    const { app, store } = setup({ llm });
    const s = store();
    const { token } = mintInvite(s, { usd: 0.03 });
    s.close();
    const b = new Browser(app);
    await b.post('/api/v1/auth/invite', { token });

    const es = parseSse(await (await b.chat()).text());
    const stop = es.find((e) => e.event === 'error')?.data as Err['error'];
    expect(stop.code).toBe('budget_exhausted');
    expect(stop.message).toMatch(/budget is used up/);
    expect(stop.hint).toMatch(/\/connect/);
    expect(es.at(-1)?.event).toBe('done');
    const bought = llm.requests.length;
    expect(bought).toBe(2);

    const next = await b.chat();
    expect(next.status).toBe(429);
    const { error } = (await next.json()) as Err;
    expect(error.code).toBe('budget_exhausted');
    expect(error.message).toMatch(/budget is used up/);
    expect(llm.requests).toHaveLength(bought);
    expect(await (await b.get('/api/v1/auth/invite')).json()).toMatchObject({
      invite: { status: 'spent', left_usd: 0 },
    });
    // and a spent token can't be redeemed anew
    const again = await new Browser(app).post('/api/v1/auth/invite', { token });
    expect(again.status).toBe(429);
    expect(((await again.json()) as Err).error.code).toBe('budget_exhausted');
  });

  test('a budget that adds up exactly is spent: rounding dust doesn’t buy another call', async () => {
    // 0.0126 - 3 × 0.0042 is about 2e-18 in floating point, not 0
    const llm = scriptedLlm(
      Array.from({ length: 6 }, () => ({ calls: [{ name: 'list_networks', args: {} }] })),
      { costUsd: 0.0042 },
    );
    const { app, store } = setup({ llm });
    const s = store();
    const { token, id } = mintInvite(s, { usd: 0.0126 });
    s.close();
    const b = new Browser(app);
    await b.post('/api/v1/auth/invite', { token });
    await (await b.chat()).text();
    expect(llm.requests).toHaveLength(3);
    expect(await (await b.get('/api/v1/auth/invite')).json()).toMatchObject({
      invite: { status: 'spent', left_usd: 0 },
    });
    const after = store();
    expect(after.invite.get(id)?.spent_usd).toBeCloseTo(0.0126, 9);
    after.close();
  });

  test('a revoked invite: refused at redeem, at the next chat, and at the next call of a chat', async () => {
    const llm = scriptedLlm(
      Array.from({ length: 6 }, () => ({ calls: [{ name: 'list_networks', args: {} }] })),
      { costUsd: 0.001, delayMs: 30 },
    );
    const { app, store } = setup({ llm });
    const s = store();
    const { token, id } = mintInvite(s, { usd: 1 });
    const b = new Browser(app);
    await b.post('/api/v1/auth/invite', { token });

    // revoked while a chat runs: the call in flight is paid for, and the next isn't bought
    const res = await b.chat();
    const reader = res.body?.getReader();
    await reader?.read();
    revokeInvite(s, id);
    let text = '';
    for (;;) {
      const part = await reader?.read();
      if (!part || part.done) break;
      text += new TextDecoder().decode(part.value);
    }
    const stop = parseSse(text).find((e) => e.event === 'error')?.data as Err['error'];
    expect(stop.code).toBe('budget_exhausted');
    expect(stop.message).toMatch(/isn't valid any more/);
    expect(llm.requests.length).toBeLessThan(6);

    const bought = llm.requests.length;
    const next = await b.chat();
    expect(next.status).toBe(403);
    const { error } = (await next.json()) as Err;
    expect(error.code).toBe('invite_required');
    expect(error.message).toMatch(/isn't valid any more/);
    expect(llm.requests).toHaveLength(bought);
    const fresh = await new Browser(app).post('/api/v1/auth/invite', { token });
    expect(fresh.status).toBe(401);
    expect(((await fresh.json()) as Err).error.message).toMatch(/isn't valid/);
    s.close();
  });

  test('an expired invite, and a token that was never minted, are refused alike', async () => {
    const { app, store } = setup();
    const s = store();
    const { token } = mintInvite(s, { usd: 1, days: 1, now: new Date('2020-01-01T00:00:00Z') });
    s.close();
    const expired = await new Browser(app).post('/api/v1/auth/invite', { token });
    const unknown = await new Browser(app).post('/api/v1/auth/invite', { token: 'petal_invite_x' });
    expect(expired.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await expired.text()).toBe(await unknown.text());
    expect(unknown.headers.getSetCookie()).toEqual([]);
    const bad = await new Browser(app).post('/api/v1/auth/invite', { token: 7 });
    expect(bad.status).toBe(400);
  });

  test('sign-in keeps the invite; a second browser can redeem the same token, on one budget', async () => {
    const { app, store } = setup({ llm: scriptedLlm(answers(6), { costUsd: 0.01 }) });
    const s = store();
    const { token, id } = mintInvite(s, { usd: 1 });
    s.close();
    const judge = new Browser(app);
    await judge.post('/api/v1/auth/invite', { token });
    await (await judge.chat()).text();
    await judge.signIn();
    expect((await judge.chat()).status).toBe(200);
    const other = new Browser(app);
    await other.post('/api/v1/auth/invite', { token });
    await (await other.chat()).text();
    await new Promise((r) => setTimeout(r, 20));
    const after = store();
    expect(after.invite.get(id)?.spent_usd).toBeCloseTo(0.03, 9);
    after.close();
  });

  test('the day’s cap still holds with budget left on the invite, and gives the hold back', async () => {
    const llm = scriptedLlm(
      Array.from({ length: 6 }, () => ({ calls: [{ name: 'list_networks', args: {} }] })),
      { costUsd: 0.02 },
    );
    const { app, store } = setup({ llm, dailyUsd: 0.03 });
    const s = store();
    const { token, id } = mintInvite(s, { usd: 1 });
    s.close();
    const b = new Browser(app);
    await b.post('/api/v1/auth/invite', { token });
    const es = parseSse(await (await b.chat()).text());
    const stop = es.find((e) => e.event === 'error')?.data as Err['error'];
    expect(stop.code).toBe('budget_exhausted');
    expect(stop.message).toMatch(/today's budget/);
    const after = store();
    expect(after.credit.get(`invite:${id}`)?.reserved_usd).toBe(0);
    expect(after.credit.get(`invite:${id}`)?.balance_usd).toBeCloseTo(0.96, 9);
    after.close();
  });

  test('a store that fails during a chat’s invite check stops the chat: nothing more is bought', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const llm = scriptedLlm(answers(3), { costUsd: 0.01 });
    const { app, store, stateDir } = setup({ llm });
    const s = store();
    const { token } = mintInvite(s, { usd: 1 });
    s.close();
    const b = new Browser(app);
    await b.post('/api/v1/auth/invite', { token });
    const { stateStore } = await import('@petal/store');
    stateStore(stateDir).close();
    const res = await b.chat();
    expect(res.status).toBe(500);
    expect(llm.requests).toHaveLength(0);
    expect(error).toHaveBeenCalled();
  });
});

describe('T192, T196: the key at start', () => {
  const start = (env: Record<string, string | undefined>, llm: LlmClient = scriptedLlm([])) => {
    const root = tmpRoot();
    return buildPetalApp(
      { root, stateDir: join(root, 'state'), apiBase: SITE },
      { llm, rpcFor: () => fakeRpcFor([maker]), registry: fakeRegistry().registry, env },
    );
  };

  test('a real gated server with no key refuses to start', () => {
    for (const NODE_ENV of ['production', undefined]) {
      expect(() => start({ NODE_ENV })).toThrow(/PETAL_WALLET_KEY is not set/);
    }
    expect(() => start({ NODE_ENV: 'production', PETAL_AGENT_ACCESS: 'gated' })).toThrow(
      /PETAL_WALLET_KEY/,
    );
  });

  test('a bad key stops any server, whatever it spends', () => {
    expect(() =>
      start({ PETAL_WALLET_KEY: 'too-short', PETAL_AGENT_ACCESS: 'open', NODE_ENV: 'test' }),
    ).toThrow(/at least 32 bytes/);
  });

  test('the keyless copy starts: it spends nothing, and warns only if someone signs in', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const app = start({ NODE_ENV: 'production' }, recordedClient(HAND_TRANSCRIPT));
    expect(warn).not.toHaveBeenCalled();
    const b = new Browser(app);
    await b.signIn();
    await b.signIn();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls.join()).toMatch(/throwaway key/);
    expect(warn.mock.calls.join()).not.toContain('maker.testnet');
  });

  test('open and dev start with a throwaway too', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    start({ NODE_ENV: 'production', PETAL_AGENT_ACCESS: 'open' });
    start({ NODE_ENV: 'development' });
    start({ NODE_ENV: 'test' });
    expect(warn).not.toHaveBeenCalled();
  });

  test('wallets sealed under a lost key don’t break /me; the session still works', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const root = tmpRoot();
    const stateDir = join(root, 'state');
    const make = () =>
      buildPetalApp(
        { root, stateDir, apiBase: SITE },
        {
          llm: scriptedLlm([]),
          rpcFor: () => fakeRpcFor([maker]),
          registry: fakeRegistry().registry,
          env: { PETAL_AGENT_ACCESS: 'open', NODE_ENV: 'test' },
        },
      );
    const b = new Browser(make());
    await b.signIn();
    const later = new Browser(make());
    later.jar = b.jar;
    const me = await later.get('/api/v1/me');
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ wallets: [] });
  });
});

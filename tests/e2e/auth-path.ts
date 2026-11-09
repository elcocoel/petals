// T192, T193, T196 on a real server, with no person awake. Run by hand; `pnpm test:e2e` doesn't.
//
//   NEAR_CLI=/path/to/near node tests/e2e/auth-path.ts
//   NEAR_CLI=/path/to/near node tests/e2e/auth-path.ts --against http://localhost:3183   (the path
//     through a server someone else started: sign-in only, for the web app's own routes)
//
// What's real: HTTP on port 3183, cookies, SQLite on disk, NEAR's RPC on testnet and mainnet, a
// faucet account on testnet with keys near-cli-rs made and signatures near-cli-rs wrote. What isn't:
// the model, a local stub on port 3184 behind the real NEAR AI client. It spends $0 of NEAR AI, and
// sends no mainnet transaction: mainnet is only ever read. Keys live in a temp folder that's deleted.
// near-cli-rs: `npm i near-cli-rs` in any temp folder, with its HOME pointed at a temp folder here.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { serveApi } from '@petal/agent/serve';
import { openStore } from '@petal/store';

const REPO = resolve(import.meta.dirname, '..', '..');
const NEAR = process.env.NEAR_CLI ?? '';
if (!NEAR) throw new Error('Set NEAR_CLI to a near-cli-rs binary.');
const PORT = 3183;
const STUB_PORT = 3184;
const STUB_KEY = 'stub';
const against = process.argv[2] === '--against' ? process.argv[3] : undefined;
const SITE = against ?? `http://localhost:${PORT}`;
const API = `${SITE}/api/v1`;

const tmp = mkdtempSync(join(tmpdir(), 'petal-auth-path-'));
const home = join(tmp, 'home');
const stateDir = join(tmp, 'state');
let failures = 0;

function check(what: string, ok: boolean, saw?: unknown) {
  if (!ok) failures++;
  const detail =
    saw === undefined ? '' : `: ${typeof saw === 'string' ? saw : JSON.stringify(saw)}`;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail}`);
}

// -- near-cli-rs, on its own HOME, so it can't see or touch anyone's real keys
const nearOptions = () => ({
  env: { HOME: home, PATH: process.env.PATH, NO_COLOR: '1' },
  encoding: 'utf8' as const,
  timeout: 180_000,
});

function near(args: string[]): string {
  let r = spawnSync(NEAR, ['--quiet', ...args], nearOptions());
  // its RPC can hand it a block hash too old to use; nothing was sent, so try once more
  if (r.status !== 0 && /Transaction has expired/.test(r.stderr)) {
    r = spawnSync(NEAR, ['--quiet', ...args], nearOptions());
  }
  if (r.status !== 0) {
    throw new Error(
      `near ${args.slice(0, 3).join(' ')} exited ${r.status}: ${r.stderr.slice(-400)}`,
    );
  }
  return `${r.stdout}\n${r.stderr}`;
}

interface Key {
  implicit_account_id: string;
  public_key: string;
  private_key: string;
}

/** A new key from near-cli-rs. Its account id is the implicit one. */
function newKey(): Key {
  const folder = mkdtempSync(join(tmp, 'key-'));
  near([
    'account',
    'create-account',
    'fund-later',
    'use-auto-generation',
    'save-to-folder',
    folder,
  ]);
  const [file] = readdirSync(folder);
  return JSON.parse(readFileSync(join(folder, file as string), 'utf8')) as Key;
}

interface Challenge {
  nonce: string;
  message: string;
  recipient: string;
}

/** A proof near-cli-rs signs: a separate implementation of NEP-413, as a wallet would be. */
function sign(key: Key, account: string, ch: Challenge) {
  const out = near([
    'message',
    'sign-nep413',
    'utf8',
    ch.message,
    'nonce',
    ch.nonce,
    'recipient',
    ch.recipient,
    'sign-as',
    account,
    'sign-with-plaintext-private-key',
    key.private_key,
  ]);
  const json = /\{[\s\S]*\}/.exec(out)?.[0];
  if (!json) throw new Error(`no signature in near-cli-rs's output: ${out.slice(0, 200)}`);
  const signed = JSON.parse(json) as { accountId: string; publicKey: string; signature: string };
  return {
    type: 'nep413',
    account_id: signed.accountId,
    public_key: signed.publicKey,
    signature: signed.signature,
    message: ch.message,
    nonce: ch.nonce,
    recipient: ch.recipient,
  };
}

let browsers = 0;

/** A browser: a cookie jar, and the site's Origin on a POST. */
class Browser {
  cookies = new Map<string, string>();
  origin: string;
  /** a public proxy names each caller; the auth routes' rate limit is per caller */
  caller = `198.51.100.${++browsers % 250}`;
  constructor(origin = SITE) {
    this.origin = origin;
  }
  async request(path: string, init: { method?: string; json?: unknown; accept?: string } = {}) {
    const headers: Record<string, string> = { 'cf-connecting-ip': this.caller };
    if (this.cookies.size) {
      headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    if (init.method === 'POST') headers.origin = this.origin;
    if (init.json !== undefined) headers['content-type'] = 'application/json';
    if (init.accept) headers.accept = init.accept;
    const res = await fetch(`${API}${path}`, {
      ...(init.method ? { method: init.method } : {}),
      headers,
      ...(init.json === undefined ? {} : { body: JSON.stringify(init.json) }),
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair = ''] = line.split('; ');
      const at = pair.indexOf('=');
      if (/Max-Age=0/.test(line)) this.cookies.delete(pair.slice(0, at));
      else this.cookies.set(pair.slice(0, at), pair.slice(at + 1));
    }
    return res;
  }
  post = (path: string, json: unknown = {}) => this.request(path, { method: 'POST', json });
  get = (path: string, accept?: string) => this.request(path, accept ? { accept } : {});
  chat = (content: string, run_id?: string) =>
    this.post('/agent/chat', {
      messages: [{ role: 'user', content }],
      ...(run_id ? { run_id } : {}),
    });
  async challenge() {
    return (await (await this.post('/auth/challenge')).json()) as Challenge;
  }
  async signIn(key: Key, account: string, network: string) {
    const proof = sign(key, account, await this.challenge());
    return this.post('/auth/verify', { network, proof });
  }
}

/** Whatever comes back, in the shapes of http-api.md. */
interface Reply {
  error: { code: string; message: string; hint?: string };
  invite: { status: string; spent_usd: number; left_usd: number };
  person_id: string;
  network: string;
  claimed_runs: number;
  wallets?: { caip10: string; network: string; account_id: string }[];
  agent_access: string;
}
const jsonOf = async (res: Response) => (await res.json()) as Reply;

function events(text: string) {
  return [...text.matchAll(/event: (\w+)\ndata: (.*)/g)].map((m) => ({
    event: m[1] as string,
    data: JSON.parse(m[2] as string) as Partial<{
      run_id: string;
      model: string;
      cost_usd: number;
      code: string;
      message: string;
    }>,
  }));
}

/** Reads an account from NEAR's RPC: true when it exists. */
async function onChain(account: string, network = 'testnet') {
  const res = await fetch(`https://rpc.${network}.fastnear.com`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: '1',
      method: 'query',
      params: { request_type: 'view_account', finality: 'final', account_id: account },
    }),
  });
  const body = (await res.json()) as { result?: unknown };
  return !!body.result;
}

async function waitOnChain(account: string, exists: boolean) {
  for (let i = 0; i < 30; i++) {
    if ((await onChain(account)) === exists) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

// -- the stub model: OpenAI's shape, behind the real client. "keep going" asks for a tool each time.
const stub = {
  completions: 0,
  /** when set, the next calls answer 402 with this `error.type` */
  refuse: null as string | null,
};
const stubServer = createServer((req, res) => {
  let body = '';
  req.on('data', (d) => {
    body += d;
  });
  req.on('end', () => {
    const send = (status: number, value: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (!req.url?.endsWith('/chat/completions')) return send(404, { error: { message: 'stub' } });
    stub.completions++;
    if (stub.refuse) {
      return send(402, {
        error: {
          type: stub.refuse,
          message: 'API key spend limit exceeded. Spent: 12345, Limit: 12345',
        },
      });
    }
    const asked = JSON.parse(body) as { model: string; messages: { content: unknown }[] };
    const keepGoing = JSON.stringify(asked.messages).includes('keep going');
    send(200, {
      id: `stub-${stub.completions}`,
      object: 'chat.completion',
      created: 1,
      model: asked.model,
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: keepGoing
            ? {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: `c${stub.completions}`,
                    type: 'function',
                    function: { name: 'list_networks', arguments: '{}' },
                  },
                ],
              }
            : { role: 'assistant', content: 'An answer from the stub.' },
        },
      ],
      // $0.0042 at the default model's prices
      usage: { prompt_tokens: 10_000, completion_tokens: 1000, total_tokens: 11_000 },
    });
  });
});

function mint(args: string[]) {
  const r = spawnSync(process.execPath, ['scripts/mint-invite.ts', ...args], {
    cwd: REPO,
    env: { ...process.env, PETAL_STATE_DIR: stateDir },
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`mint-invite exited ${r.status}: ${r.stderr}`);
  return {
    out: r.stdout,
    token: /token\s+(\S+)/.exec(r.stdout)?.[1] ?? '',
    id: /invite\s+(\S+)/.exec(r.stdout)?.[1] ?? '',
  };
}

function startServer(walletKey: string) {
  return serveApi({
    port: PORT,
    cfg: {
      root: REPO,
      stateDir,
      apiBase: SITE,
      nearAiApiKey: STUB_KEY,
      llmDailyUsd: 1,
      map: null,
    },
    options: {
      nearAi: {
        baseURL: `http://127.0.0.1:${STUB_PORT}/v1`,
        signatureDelaysMs: [0],
        attestationsDir: join(stateDir, 'attestations'),
      },
      env: { NODE_ENV: 'production', PETAL_AGENT_ACCESS: 'gated', PETAL_WALLET_KEY: walletKey },
    },
  });
}

function startAccount() {
  const key = newKey();
  const account = `petal-auth-${randomBytes(5).toString('hex')}.testnet`;
  near([
    'account',
    'create-account',
    'sponsor-by-faucet-service',
    account,
    'use-manually-provided-public-key',
    key.public_key,
    'network-config',
    'testnet',
    'create',
  ]);
  return { key, account };
}

/** Sign-in only, on a server already running: the web app's own route, cookies through it. */
async function viaWebApp() {
  const { key, account } = startAccount();
  check('faucet account for the web app', await waitOnChain(account, true), account);
  const b = new Browser();
  const ch = await b.challenge();
  check('challenge through the web app', !!ch.nonce, {
    recipient: ch.recipient,
    message: ch.message,
  });
  const res = await b.post('/auth/verify', { network: 'testnet', proof: sign(key, account, ch) });
  const body = await jsonOf(res);
  check('verify through the web app', res.status === 200, {
    status: res.status,
    person: !!body.person_id,
  });
  check('set-cookie survives the web app', [...b.cookies.keys()].join() === 'petal_session', [
    ...b.cookies.keys(),
  ]);
  const me = await jsonOf(await b.get('/me'));
  check(
    '/me through the web app',
    me.wallets?.[0]?.account_id === account,
    me.wallets?.[0]?.caip10,
  );
  const stranger = await new Browser().get('/me');
  check('/me to a stranger', stranger.status === 401, stranger.status);
  const bad = await new Browser('https://evil.example').post('/auth/challenge');
  check('a bad Origin through the web app', bad.status === 401, bad.status);
  const chat = await new Browser().chat('hello');
  const run = events(await chat.text());
  const id = run[0]?.data.run_id as string;
  check('recorded chat, gated, no sign-in', chat.status === 200 && run.at(-1)?.event === 'done', {
    model: run.at(-1)?.data.model,
  });
  const read = await new Browser().get(`/agent/runs/${id}`);
  check('recorded run readable by anyone', read.status === 200, read.status);
  const out = await b.post('/auth/logout');
  check('logout through the web app', out.status === 200 && !b.cookies.size, out.status);
}

async function wholePath() {
  const taken = await fetch(`${API}/health`).then(
    () => true,
    () => false,
  );
  if (taken) throw new Error(`Something already answers on port ${PORT}: stop it first.`);
  stubServer.listen(STUB_PORT, '127.0.0.1');
  const walletKey = randomBytes(32).toString('hex');
  let server = startServer(walletKey);
  await new Promise((r) => setTimeout(r, 300));

  console.log('\n# the throwaway testnet account');
  const { key, account } = startAccount();
  check('created from the faucet, key from near-cli-rs', await waitOnChain(account, true), account);

  console.log('\n# gated, no invite');
  const a = new Browser();
  const refused = await a.chat('who holds the power here?');
  const refusedBody = await jsonOf(refused);
  check('chat refused', refused.status === 403 && refusedBody.error.code === 'invite_required', {
    status: refused.status,
    ...refusedBody.error,
  });
  check('no model call', stub.completions === 0, stub.completions);
  check('tools still answer, no sign-in', (await a.get('/networks')).status === 200);
  const health = await jsonOf(await a.get('/health'));
  check('health says gated', health.agent_access === 'gated', health.agent_access);

  console.log('\n# an invite, redeemed by an anonymous session');
  const first = mint(['0.0126', '7']);
  check('mint-invite prints a token once', first.token.startsWith('petal_invite_'), first.id);
  const redeemed = await a.post('/auth/invite', { token: first.token });
  const state = await jsonOf(redeemed);
  check('redeemed', redeemed.status === 200 && state.invite.status === 'active', state.invite);

  console.log('\n# a run owned by that handle');
  const chat = events(await (await a.chat('who holds the power here?')).text());
  const runId = chat[0]?.data.run_id as string;
  check('chat on the stub model, through the real client', chat.at(-1)?.event === 'done', {
    model: chat.at(-1)?.data.model,
    cost_usd: chat.at(-1)?.data.cost_usd,
    calls: stub.completions,
  });
  const mine = await a.get(`/agent/runs/${runId}`);
  const mineText = await mine.text();
  check('its owner reads it', mine.status === 200, mine.status);
  check('no owner in its public shape', !/anon_|prs_|owner/.test(mineText));
  const unknown = await (await new Browser().get('/agent/runs/aaaaaaaaaaaaaaaaaaaaaaaa')).json();
  const b = new Browser();
  const r1 = await b.get(`/agent/runs/${runId}`);
  const r1Body = await jsonOf(r1);
  const sameAsUnknown =
    JSON.stringify(r1Body).replace(runId, 'ID') ===
    JSON.stringify(unknown).replaceAll('a'.repeat(24), 'ID');
  check(
    'a second browser: 404, the same as a run that never existed',
    r1.status === 404 && sameAsUnknown,
    r1Body.error,
  );
  const r2 = await b.get(`/agent/runs/${runId}`, 'text/event-stream');
  check('a second browser can’t follow it', r2.status === 404, r2.status);
  await b.post('/auth/invite', { token: mint(['0.01']).token });
  const r3 = await b.chat('and then?', runId);
  check('a second browser, with its own invite, can’t continue it', r3.status === 404, r3.status);

  console.log('\n# sign-in, with a real signature, claims it');
  const handleCookie = [...a.cookies.values()][0];
  const signedIn = await a.signIn(key, account, 'testnet');
  const person = await jsonOf(signedIn);
  check('verify', signedIn.status === 200, {
    status: signedIn.status,
    person_id: person.person_id,
    claimed_runs: person.claimed_runs,
    wallets: person.wallets,
  });
  check('the run moved in one step', person.claimed_runs === 1);
  const setCookie = signedIn.headers.getSetCookie().join();
  check(
    'the cookie',
    /HttpOnly/.test(setCookie) && /SameSite=Lax/.test(setCookie),
    setCookie.replace(/=[^;]+/, '=<value>'),
  );
  const me = await jsonOf(await a.get('/me'));
  check('/me is that person', !!me.person_id && me.person_id === person.person_id, {
    person_id: me.person_id,
    network: me.network,
    wallets: me.wallets,
  });
  check('the owner still reads it', (await a.get(`/agent/runs/${runId}`)).status === 200);
  check('the second browser still can’t', (await b.get(`/agent/runs/${runId}`)).status === 404);
  const old = new Browser();
  old.cookies.set('petal_session', handleCookie as string);
  check(
    'the old anonymous cookie is finished',
    (await old.get(`/agent/runs/${runId}`)).status === 404,
  );
  check('/me to the second browser says nothing', (await b.get('/me')).status === 401);

  console.log('\n# what is on disk');
  const db = openStore(join(stateDir, 'private.db'));
  const today = new Date().toISOString().slice(0, 10);
  const wallets = await db.walletBinding.ofPerson(person.person_id);
  check('the binding keeps its network', wallets[0]?.network === 'testnet', wallets[0]?.network);
  check('sealed, with a keyed hash', !JSON.stringify(wallets).includes(account), {
    hash: `${wallets[0]?.caip10_hash.slice(0, 12)}…`,
  });
  // grep, not readFileSync: closing any descriptor on a SQLite file in this process would drop the
  // server's POSIX locks on it, and another process's writes would then go unseen here.
  const files = readdirSync(stateDir).filter((f) => f.startsWith('private.db'));
  const onDisk = (needle: string) =>
    spawnSync('grep', ['-lF', needle, ...files], { cwd: stateDir, encoding: 'utf8' }).stdout.trim();
  check('the account id is in no database file', !onDisk(account), files);
  check('the raw token is in no database file', !onDisk(first.token));
  check('the session value is in no database file', !onDisk([...a.cookies.values()][0] as string));

  console.log('\n# another browser, the same wallet');
  const phone = new Browser();
  const back = await jsonOf(await phone.signIn(key, account, 'testnet'));
  check('the same person', back.person_id === person.person_id, back.person_id);
  check('comes back to the run', (await phone.get(`/agent/runs/${runId}`)).status === 200);

  console.log('\n# refusals, with real signatures');
  const fresh = new Browser();
  const ch = await fresh.challenge();
  const proof = sign(key, account, ch);
  const once = await fresh.post('/auth/verify', { network: 'testnet', proof });
  const replay = await new Browser().post('/auth/verify', { network: 'testnet', proof });
  const replayBody = await jsonOf(replay);
  check('a replayed nonce', once.status === 200 && replay.status === 401, replayBody.error.message);
  const ch2 = await fresh.challenge();
  const otherSite = sign(key, account, { ...ch2, recipient: 'evil.example' });
  const wrong = await new Browser().post('/auth/verify', { network: 'testnet', proof: otherSite });
  check('a wrong recipient', wrong.status === 401, (await jsonOf(wrong)).error.message);
  const forged = await new Browser().post('/auth/verify', {
    network: 'testnet',
    proof: { ...otherSite, recipient: ch2.recipient },
  });
  check(
    'a wrong recipient, claiming the right one',
    forged.status === 401,
    (await jsonOf(forged)).error.message,
  );
  const ch3 = await fresh.challenge();
  const wrongNet = await new Browser().post('/auth/verify', {
    network: 'mainnet',
    proof: sign(key, account, ch3),
  });
  check(
    'a testnet account claimed on mainnet',
    wrongNet.status === 401,
    (await jsonOf(wrongNet)).error.message,
  );
  for (const path of [
    '/auth/challenge',
    '/auth/verify',
    '/auth/logout',
    '/auth/invite',
    '/agent/chat',
  ]) {
    const evil = await new Browser('https://evil.example').post(path, { token: 'x', messages: [] });
    check(`a bad Origin on ${path}`, evil.status === 401, (await jsonOf(evil)).error.message);
  }
  const preflight = await fetch(`${API}/auth/verify`, {
    method: 'OPTIONS',
    headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
  });
  check(
    'no CORS headers on a credentialed route',
    preflight.headers.get('access-control-allow-origin') === null,
    preflight.status,
  );
  const open = await fetch(`${API}/networks`, { headers: { origin: 'https://evil.example' } });
  check('public tools stay open', open.headers.get('access-control-allow-origin') === '*');

  console.log('\n# new people, on NEAR itself');
  const newcomer = newKey();
  check(
    'an implicit account with no funds doesn’t exist',
    !(await onChain(newcomer.implicit_account_id)),
  );
  const n1 = new Browser();
  const implicit = await n1.signIn(newcomer, newcomer.implicit_account_id, 'testnet');
  const implicitBody = await jsonOf(implicit);
  check('it signs in on testnet', implicit.status === 200, implicitBody.wallets?.[0]?.network);
  const n2 = new Browser();
  const onMain = await n2.signIn(newcomer, newcomer.implicit_account_id, 'mainnet');
  const onMainBody = await jsonOf(onMain);
  check(
    'it signs in on mainnet, reading only',
    onMain.status === 200,
    onMainBody.wallets?.[0]?.network,
  );
  check(
    'near:testnet: and near:mainnet: are different people',
    onMainBody.person_id !== implicitBody.person_id,
  );
  const stranger = newKey();
  const notHers = await new Browser().signIn(stranger, 'near', 'mainnet');
  check(
    'a real mainnet account, with a key that isn’t its own',
    notHers.status === 401,
    (await jsonOf(notHers)).error.message,
  );

  console.log('\n# a rotated implicit key');
  const rotated = newKey();
  const replacement = newKey();
  near([
    'tokens',
    account,
    'send-near',
    rotated.implicit_account_id,
    '0.5 NEAR',
    'network-config',
    'testnet',
    'sign-with-plaintext-private-key',
    key.private_key,
    'send',
  ]);
  check(
    'funded, so it exists',
    await waitOnChain(rotated.implicit_account_id, true),
    `${rotated.implicit_account_id.slice(0, 12)}…`,
  );
  const whileOn = await new Browser().signIn(rotated, rotated.implicit_account_id, 'testnet');
  check('its own key still signs in', whileOn.status === 200, whileOn.status);
  near([
    'account',
    'add-key',
    rotated.implicit_account_id,
    'grant-full-access',
    'use-manually-provided-public-key',
    replacement.public_key,
    'network-config',
    'testnet',
    'sign-with-plaintext-private-key',
    rotated.private_key,
    'send',
  ]);
  near([
    'account',
    'delete-keys',
    rotated.implicit_account_id,
    'public-keys',
    rotated.public_key,
    'network-config',
    'testnet',
    'sign-with-plaintext-private-key',
    replacement.private_key,
    'send',
  ]);
  await new Promise((r) => setTimeout(r, 4000));
  const gone = await new Browser().signIn(rotated, rotated.implicit_account_id, 'testnet');
  check(
    'rotated away: refused, even though the id is the hex of that key',
    gone.status === 401,
    (await jsonOf(gone)).error.message,
  );

  console.log('\n# a function-call key');
  const agentKey = newKey();
  near([
    'account',
    'add-key',
    account,
    'grant-function-call-access',
    '--allowance',
    '0.01 NEAR',
    '--contract-account-id',
    'petals.testnet',
    '--function-names',
    '__fastdata_kv',
    'use-manually-provided-public-key',
    agentKey.public_key,
    'network-config',
    'testnet',
    'sign-with-plaintext-private-key',
    key.private_key,
    'send',
  ]);
  await new Promise((r) => setTimeout(r, 4000));
  const fc = await new Browser().signIn(agentKey, account, 'testnet');
  check('refused', fc.status === 401, (await jsonOf(fc)).error.message);

  console.log('\n# the budget draws down, and ends');
  const before = (await jsonOf(await a.get('/auth/invite'))).invite;
  const calls0 = stub.completions;
  await (await a.chat('one more')).text();
  const after = (await jsonOf(await a.get('/auth/invite'))).invite;
  check(
    'one chat draws on the invite',
    Math.abs(after.spent_usd - before.spent_usd - 0.0042) < 1e-9 && stub.completions === calls0 + 1,
    { before: before.spent_usd, after: after.spent_usd, left: after.left_usd },
  );
  check(
    'and on the day’s ledger',
    Math.abs((await db.ledger.get(today)).usd - stub.completions * 0.0042) < 1e-9,
    await db.ledger.get(today),
  );
  const stopping = events(await (await a.chat('keep going')).text());
  const stop = stopping.find((e) => e.event === 'error')?.data;
  check(
    'mid-chat, a plain message',
    stop?.code === 'budget_exhausted' && /used up/.test(String(stop?.message)),
    stop,
  );
  check('and the chat ends', stopping.at(-1)?.event === 'done', stopping.at(-1)?.data.cost_usd);
  const calls1 = stub.completions;
  const spent = await a.chat('more');
  const spentBody = await jsonOf(spent);
  check(
    'the next chat is refused before any call',
    spent.status === 429 && stub.completions === calls1,
    { status: spent.status, ...spentBody.error },
  );
  const redeemSpent = await new Browser().post('/auth/invite', { token: first.token });
  check(
    'a spent token can’t be redeemed',
    redeemSpent.status === 429,
    (await jsonOf(redeemSpent)).error.message,
  );
  console.log(
    '    invite row:',
    JSON.stringify({ ...(await db.invite.get(first.id)), token_hash: '<hash>' }),
  );
  console.log('    credit:', JSON.stringify(await db.credit.get(`invite:${first.id}`)));

  console.log('\n# a revoked invite');
  const second = mint(['0.5']);
  const c = new Browser();
  await c.post('/auth/invite', { token: second.token });
  check('works before', (await (await c.chat('hello')).text()).includes('event: done'));
  check('mint-invite --revoke', mint(['--revoke', second.id]).out.includes('revoked'));
  const revoked = await c.chat('hello again');
  check('the next chat is refused', revoked.status === 403, (await jsonOf(revoked)).error);
  const redeemRevoked = await new Browser().post('/auth/invite', { token: second.token });
  check(
    'and so is redeeming it',
    redeemRevoked.status === 401,
    (await jsonOf(redeemRevoked)).error.message,
  );

  console.log('\n# NEAR AI answers 402');
  const third = mint(['0.5']);
  const d = new Browser();
  await d.post('/auth/invite', { token: third.token });
  for (const type of ['api_key_limit_exceeded', 'no_credits']) {
    stub.refuse = type;
    const calls = stub.completions;
    const es = events(await (await d.chat('hello')).text());
    const err = es.find((e) => e.event === 'error')?.data;
    check(
      `${type}: a plain message, one call, no figures`,
      err?.code === 'budget_exhausted' &&
        stub.completions === calls + 1 &&
        !/Spent|12345/.test(JSON.stringify(err)),
      err,
    );
  }
  stub.refuse = null;
  check(
    'nothing is charged for a refused call',
    (await db.invite.get(third.id))?.spent_usd === 0,
    (await db.invite.get(third.id))?.spent_usd,
  );
  await db.close();

  console.log('\n# a restart, on the same disk and key');
  await new Promise<void>((done) => server.close(() => done()));
  server = startServer(walletKey);
  await new Promise((r) => setTimeout(r, 300));
  const again = await jsonOf(await a.get('/me'));
  check(
    'the session is still good',
    again.person_id === person.person_id,
    again.wallets?.[0]?.caip10,
  );
  check('the run is still theirs', (await a.get(`/agent/runs/${runId}`)).status === 200);
  check(
    'the second browser still can’t read it',
    (await b.get(`/agent/runs/${runId}`)).status === 404,
  );
  const stillSpent = await a.chat('hello');
  check('the spent invite stays spent', stillSpent.status === 429, stillSpent.status);
  const out = await a.post('/auth/logout');
  check('logout', out.status === 200 && !a.cookies.size, out.status);
  check('/me after logout', (await a.get('/me')).status === 401);

  await new Promise<void>((done) => server.close(() => done()));
  stubServer.close();
  console.log('\n# no key, gated, spending: a real process refuses to start');
  const noKey = spawnSync(process.execPath, ['packages/agent/src/serve.ts'], {
    cwd: REPO,
    env: {
      PATH: process.env.PATH,
      HOME: home,
      PORT: String(PORT),
      NODE_ENV: 'production',
      NEAR_AI_API_KEY: STUB_KEY,
    },
    encoding: 'utf8',
    timeout: 30_000,
  });
  check('exit code', noKey.status !== 0 && noKey.status !== null, noKey.status);
  check(
    'a plain line',
    /PETAL_WALLET_KEY is not set/.test(noKey.stderr),
    /petal: .*/.exec(noKey.stderr)?.[0]?.slice(0, 90),
  );

  return account;
}

try {
  if (against) await viaWebApp();
  else console.log(`\nThe testnet account used: ${await wholePath()}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);

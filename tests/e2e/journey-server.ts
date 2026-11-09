// A whole person's journey in a real browser, with no real wallet and no model spend. Run by hand;
// `pnpm test:e2e` doesn't.
//
//   node tests/e2e/journey-server.ts [--web-port 3190] [--api-port 4190] [--stub-port 3189] [--state <dir>] [--seed]
//
// With --seed there's also a small workspace to come back to (workspace-seed.ts): conversations, work from
// another door, follows and notes, under one session, and a link on this server that hands you that
// session and sends you to the site. A link, not a line to paste: a page can't overwrite an HttpOnly cookie
// from an earlier visit, so the line would fail with no error. Cookies don't care about ports, so this
// server can set the site's. It uses 127.0.0.1, so localhost's cookies, your real app's, are left alone.
//
// On 127.0.0.1:3189 it serves a stub model behind the real NEAR AI client (/v1, stub-model.ts), its call
// count (/calls) and test wallets (/wallet/<name>.js, test-wallet.ts). It prepares a state folder, new
// unless --state names one, and mints one invite against it. Then it prints the two commands that start
// the caller's own server and site, apart as they run on a host (002-system research), the line that lists
// the wallets in the picker, and the token. Everything binds to 127.0.0.1 only.
//
// What's real: the site, its routes, cookies, SQLite, near-connect's picker and sandbox, and NEAR's RPC
// checking the signature, on whichever network the page asks for. What isn't: the model and the wallets.
// Sign-in works on mainnet and testnet with no funds, because a test wallet's account is implicit and
// doesn't exist on chain. It spends $0 of NEAR AI and sends no transaction.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { mintInvite, openPrivateStore } from '@petal/agent';
import { testnetTransfer } from '@petal/near/auth/testing';
import { stubModel } from './stub-model.ts';
import { seedSnippet, WALLET_NAME, walletScript } from './test-wallet.ts';
import { SESSION_COOKIE, type SeedResult, seedWorkspace } from './workspace-seed.ts';

const { values } = parseArgs({
  options: {
    'web-port': { type: 'string', default: '3190' },
    // the server the site forwards to; default the web port plus 1000
    'api-port': { type: 'string' },
    // lanes run side by side, and each needs its own stub
    'stub-port': { type: 'string', default: '3189' },
    state: { type: 'string' },
    seed: { type: 'boolean', default: false },
  },
});
const webPort = values['web-port'];
const apiPort = values['api-port'] ?? String(Number(webPort) + 1000);
const PORT = Number(values['stub-port']);
const BASE = `http://127.0.0.1:${PORT}`;

interface Prepared {
  stateDir: string;
  walletKey: string;
  invite: Awaited<ReturnType<typeof mintInvite>>;
}

/** A person is found by a hash under the wallet key, so a folder that's reused keeps its key. */
async function prepareState(dir: string | undefined): Promise<Prepared> {
  const stateDir = dir ? resolve(dir) : mkdtempSync(join(tmpdir(), 'petal-journey-'));
  mkdirSync(stateDir, { recursive: true });
  const keyFile = join(stateDir, 'journey-wallet-key');
  const walletKey = existsSync(keyFile)
    ? readFileSync(keyFile, 'utf8').trim()
    : randomBytes(32).toString('hex');
  writeFileSync(keyFile, walletKey, { mode: 0o600 });
  const store = openPrivateStore(stateDir);
  try {
    return { stateDir, walletKey, invite: await mintInvite(store, { usd: 1, days: 14 }) };
  } finally {
    await store.close();
  }
}

/** A value as a shell would need it typed. */
const quoted = (s: string) => (/^[\w./:=-]+$/.test(s) ? s : `'${s.replaceAll("'", `'\\''`)}'`);

function seededLines(seed: SeedResult): string {
  return `
5. A workspace to come back to: ${seed.conversations} conversations, one of them from another door, ${seed.follows} follows and ${seed.notes} notes.
   ${seed.fresh ? 'It was made just now.' : 'This folder already had it, so it was left as it was.'} Open this link. It gives this browser that session, which holds the invite, and sends you to the site:

   http://127.0.0.1:${PORT}/session

   Use the site at http://127.0.0.1:${webPort} from then on, not localhost. The cookie belongs to 127.0.0.1.
`;
}

function instructions({ stateDir, walletKey, invite }: Prepared, seed: SeedResult | null): string {
  const line = (env: Record<string, string>) =>
    Object.entries(env)
      .map(([k, v]) => `${k}=${quoted(v)}`)
      .join(' ');
  const server = line({
    PETAL_AGENT_ACCESS: 'gated',
    NEAR_AI_API_KEY: 'stub',
    PETAL_NEAR_AI_BASE_URL: `${BASE}/v1`,
    PETAL_WALLET_KEY: walletKey,
    PETAL_STATE_DIR: stateDir,
    PETAL_MAP_NETWORK: 'testnet',
    // the site's address, which people sign in on and links point to
    PETAL_API: `http://127.0.0.1:${webPort}`,
    PORT: apiPort,
  });
  const site = line({
    PETAL_SERVER: `http://127.0.0.1:${apiPort}`,
    PETAL_LAB: '1',
    PORT: webPort,
  });
  const redeem = `fetch('/api/v1/auth/invite',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:'${invite.token}'})}).then(r=>r.json()).then(console.log)`;
  return `
Petals journey server: a stub model and test wallets on ${BASE}. It spends nothing.

1. Start the server and then the site, in two other terminals, from your own worktree, on Node 24:

   ${server} pnpm server

   ${site} pnpm --filter @petal/web dev --hostname 127.0.0.1

2. Open http://127.0.0.1:${webPort}/lab/wallet in a browser. Open its console, paste this line and press
   Enter. Chrome may first ask you to type "allow pasting". The page reloads, and each new browser
   profile needs the line once.

   ${seedSnippet(BASE, ['alice', 'bob'])}

3. Click "Sign in on mainnet", which is the default. Choose "Test wallet: alice". It signs with no prompt.
   The same name in another browser profile is the same person, and bob is another person. Testnet works
   the same way, and there the same name is a different person, because a person is a wallet on a network.

4. The invite, $${invite.budget_usd} until ${invite.expires_at}. Until a session holds it, a chat is refused:

   ${invite.token}

   To redeem it from the console:

   ${redeem}
${seed ? seededLines(seed) : ''}
A new map waits for a yes, so the first question asks, and "yes" draws the flower.

A person's own credit needs no invite. Sign in, read the id from /api/v1/me, then, here on Node 24:

   node scripts/fund-person.ts --state ${quoted(stateDir)} --person <prs_id> --total 5

Or pay for it as a visitor does, for free: sign in on testnet as alice or bob, whose testnet accounts hold
testnet NEAR, and approve the transfer the chat asks for. This server sends it on testnet, for real, to
petals.testnet, and the API server reads it back from the chain. On mainnet a test wallet refuses to send.

The stub's call count, and the model and effort each call named: ${BASE}/calls
To come back later as the same people: node tests/e2e/journey-server.ts --web-port ${webPort} --api-port ${apiPort} --stub-port ${PORT} --state ${quoted(stateDir)}${seed ? ' --seed' : ''}
That keeps the wallet key and the data, and prints a new invite.
Ctrl-C stops this one. The server and the site are yours to stop.
`;
}

let seededSession: string | null = null;

const stub = stubModel();
const server = createServer((req, res) => {
  const path = new URL(req.url ?? '/', BASE).pathname;
  if (path === '/session' && seededSession) {
    res.writeHead(302, {
      'set-cookie': `${SESSION_COOKIE}=${seededSession}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86_400}`,
      location: `http://127.0.0.1:${webPort}/make`,
      'cache-control': 'no-store',
    });
    res.end();
    return;
  }
  if (path === '/calls') {
    res.writeHead(200, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    });
    res.end(JSON.stringify({ calls: stub.calls, asked: stub.asked }));
    return;
  }
  // A test wallet's transfer (9 Nov, the pay step): testnet only, one Transfer action, sent from its own
  // implicit account, which must hold testnet NEAR.
  const send = /^\/wallet\/([^/]+)\/send$/.exec(path);
  if (send && req.method === 'POST') {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
    });
    req.on('end', async () => {
      const answer = (status: number, body: unknown) => {
        res.writeHead(status, {
          'content-type': 'application/json',
          'access-control-allow-origin': '*',
        });
        res.end(JSON.stringify(body));
      };
      try {
        const name = send[1] ?? '';
        const b = JSON.parse(raw) as {
          network?: string;
          receiverId?: string;
          actions?: { type?: string; params?: { deposit?: string } }[];
        };
        const deposit = b.actions?.length === 1 ? b.actions[0] : undefined;
        if (!WALLET_NAME.test(name)) return answer(404, { error: 'not a wallet name' });
        if (b.network !== 'testnet')
          return answer(400, { error: 'a test wallet sends only on testnet' });
        if (deposit?.type !== 'Transfer' || !b.receiverId || !deposit.params?.deposit) {
          return answer(400, { error: 'a test wallet sends one NEAR transfer, nothing else' });
        }
        answer(200, await testnetTransfer(name, b.receiverId, deposit.params.deposit));
      } catch (e) {
        answer(502, { error: (e as Error).message });
      }
    });
    return;
  }
  if (path.startsWith('/wallet/')) {
    const name = /^\/wallet\/(.+)\.js$/.exec(path)?.[1] ?? '';
    const known = WALLET_NAME.test(name);
    res.writeHead(known ? 200 : 404, {
      'content-type': known ? 'text/javascript' : 'text/plain',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    });
    res.end(known ? walletScript(name, BASE) : 'not a wallet name: letters, digits and hyphens');
    return;
  }
  stub.handle(req, res);
});

server.on('error', (e: NodeJS.ErrnoException) => {
  console.error(
    e.code === 'EADDRINUSE' ? `Something already answers on port ${PORT}: stop it first.` : e,
  );
  process.exit(1);
});
server.listen(PORT, '127.0.0.1', async () => {
  const prepared = await prepareState(values.state);
  const seed = values.seed
    ? await seedWorkspace({
        stateDir: prepared.stateDir,
        modelBase: `${BASE}/v1`,
        walletKey: prepared.walletKey,
        inviteId: prepared.invite.id,
      })
    : null;
  seededSession = seed?.session ?? null;
  console.log(instructions(prepared, seed));
});

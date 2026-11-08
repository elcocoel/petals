// Throwaway test data for the database trial, made by Petals' real code through its real routes, in
// process: a person signs in with a test wallet (a fake NEAR RPC checks the signature), then makes a
// workspace: two explorations with steps and notes, a posted reading, a follow and a private note.
//   PETAL_WALLET_KEY=<hex> node seed.ts <repo> <state folder> <site>
// Writes <state folder>/../out/seed.json: the session's value and the ids made. Prints no key.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const [repo, state, site] = process.argv.slice(2) as [string, string, string];
const { buildPetalApp } = await import(`${repo}/packages/agent/src/index.ts`);
const { testSigner, fakeRpcFor } = await import(`${repo}/packages/near/src/auth/testing.ts`);
const { canonicalJson, sha256Hex } = await import(`${repo}/packages/core/src/index.ts`);

const alice = testSigner('alice-trial.testnet');
const app = buildPetalApp(
  {
    root: repo,
    stateDir: state,
    public: true,
    apiBase: site,
    llmDailyUsd: 0,
    map: {
      network: 'testnet',
      receiver: 'petals.testnet',
      writer: 'petals-writer.testnet',
      trustedWriters: ['petals-writer.testnet'],
    },
  },
  {
    env: { PETAL_WALLET_KEY: process.env.PETAL_WALLET_KEY, NODE_ENV: 'production' },
    rpcFor: () => fakeRpcFor([alice]),
  },
);

let cookie = '';
async function call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', origin: site, cookie, ...extra },
    body: body === undefined ? undefined : typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body),
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0] as string;
  const json = (await res.json().catch(() => null)) as Record<string, any> | null;
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(json)}`);
  return json as Record<string, any>;
}

// 1. Sign in with a wallet: challenge, the wallet's NEP-413 signature, verify.
const ch = await call('POST', '/api/v1/auth/challenge', {});
const signedIn = await call('POST', '/api/v1/auth/verify', {
  network: 'testnet',
  proof: alice.sign({ message: ch.message, nonce: ch.nonce, recipient: ch.recipient }),
});
const person = signedIn.person_id as string;

// 2. A workspace: an exploration with a step and a note, as the person's own agent would make it.
const one = await call('POST', '/api/v1/explorations', { question: 'Who holds NEAR stake?', client: 'Codex' });
const proposed = await call('POST', '/api/v1/specs/propose', {
  network: 'near-validators',
  sha256: '72a6d9676d967d63712dc82bcbb90282d2f61e5ca6495c3e2e54a4f9af77e9ec',
});
await call('POST', `/api/v1/explorations/${one.exploration}/steps`, { spec: proposed.spec });
await call('POST', `/api/v1/explorations/${one.exploration}/notes`, { text: 'The top pools hold most of it.' });

// 3. A second exploration, with a reading made "on their machine" and posted here.
const two = await call('POST', '/api/v1/explorations', { question: 'Who holds Moloch shares?', client: 'Claude Code' });
const base = JSON.parse(
  gunzipSync(readFileSync(join(repo, 'fixtures/snapshots/c46437a2afb76cc7c3b07195da499a80a93bd3f09f2ce342436a366c68009a9c.json.gz'))).toString(),
);
const reading = { ...base, snapshot: { ...base.snapshot, as_of: '2021-09-10T12:00:02Z' } };
const posted = sha256Hex(canonicalJson(reading));
await call('PUT', `/api/v1/explorations/${two.exploration}/snapshots/${posted}`, canonicalJson(reading));
const p2 = await call('POST', '/api/v1/specs/propose', { network: 'moloch-v1', sha256: posted });
await call('POST', `/api/v1/explorations/${two.exploration}/steps`, { spec: p2.spec });

// 4. A followed address and a private note.
await call('POST', '/api/v1/follows', { ref: 'near:mainnet:astro-stakers.poolv1.near', label: 'a big pool' });
await call('POST', '/api/v1/notes', { about: `conversation:${one.exploration}`, text: 'Check the second pool next.' });

const out = {
  session: cookie,
  person,
  explorations: [one.exploration, two.exploration],
  posted_snapshot: posted,
};
writeFileSync(join(dirname(state), 'out', 'seed.json'), `${JSON.stringify(out, null, 2)}\n`, { mode: 0o600 });
console.log(`seeded: person ${person}, explorations ${out.explorations.join(', ')}, posted reading ${posted.slice(0, 12)}…`);
process.exit(0);

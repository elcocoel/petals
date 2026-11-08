// What `journey-server.ts --seed` hands INTERACTION: every kind of thing on the real routes, through a
// stub model, and a second run on the same folder leaves it alone. $0: nothing leaves this machine.
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPetalApp, mintInvite, openPrivateStore } from '@petal/agent';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { REPO } from './helpers.ts';
import { stubModel } from './stub-model.ts';
import { SESSION_COOKIE, type SeedOptions, seedWorkspace } from './workspace-seed.ts';

// biome-ignore lint/suspicious/noExplicitAny: walking what the server answers
type Out = Record<string, any>;

const stub = stubModel();
let server: Server;
let stateDir: string;
let options: SeedOptions;
let app: ReturnType<typeof buildPetalApp>;
let cookie: string;
const WALLET_KEY = 'cd'.repeat(32);

const get = async (path: string): Promise<Out> => {
  const res = await app.request(path, { headers: { cookie } });
  expect(res.status).toBe(200);
  return (await res.json()) as Out;
};

beforeAll(async () => {
  server = createServer((req, res) => stub.handle(req, res));
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  stateDir = mkdtempSync(join(tmpdir(), 'petal-seed-'));
  const store = openPrivateStore(stateDir);
  const invite = await mintInvite(store, { usd: 1, days: 1 });
  await store.close();
  options = {
    stateDir,
    modelBase: `http://127.0.0.1:${port}/v1`,
    walletKey: WALLET_KEY,
    inviteId: invite.id,
  };
  const seeded = await seedWorkspace(options);
  expect(seeded).toMatchObject({ conversations: 5, follows: 3, notes: 2, fresh: true });
  cookie = `${SESSION_COOKIE}=${seeded.session}`;
  app = buildPetalApp(
    { root: REPO, stateDir, nearAiApiKey: 'stub', llmDailyUsd: 1, map: null },
    {
      nearAi: { baseURL: options.modelBase, signatureDelaysMs: [0] },
      env: { NODE_ENV: 'test', PETAL_AGENT_ACCESS: 'gated', PETAL_WALLET_KEY: WALLET_KEY },
    },
  );
}, 120_000);

afterAll(async () => {
  server.close();
  rmSync(stateDir, { recursive: true, force: true });
});

test('the list has every kind of conversation, including work from another door', async () => {
  const { conversations } = await get('/api/v1/conversations');
  expect(conversations).toHaveLength(5);
  const by = (status: string) => conversations.filter((c: Out) => c.status === status);
  expect(by('interrupted')).toHaveLength(1);
  const [door] = by('elsewhere');
  expect(door).toMatchObject({ run_id: null, door: 'mcp', title: 'Who holds Moloch DAO?' });
  const open = await get(`/api/v1/conversations/${door.id}`);
  expect(open.conversation.door_turns.map((t: Out) => t.kind)).toEqual(['step', 'note']);
  expect(open.conversation.shapes).toHaveLength(1);
});

test('one conversation holds two shapes, with figures per turn, and the pick apart from what answered', async () => {
  const { conversations } = await get('/api/v1/conversations');
  const two = conversations.find((c: Out) => c.shapes_count === 2);
  const { conversation } = await get(`/api/v1/conversations/${two.id}`);
  expect(conversation.settings).toMatchObject({ model: 'z-ai/glm-5.3-flash', effort: 'medium' });
  expect(conversation.shapes.map((s: Out) => s.spec_sha256)).toHaveLength(2);
  expect(new Set(conversation.shapes.map((s: Out) => s.spec_sha256)).size).toBe(2);
  expect(conversation.turns.length).toBeGreaterThanOrEqual(3);
  for (const t of conversation.turns) expect(t.cost_usd).toBeGreaterThanOrEqual(0);
  expect(conversation.turns.at(-1).context_tokens).toBe(6900);
  expect(conversation.turns.at(-1).signed).toBe(true);
  expect(conversation.turns[0].signed).toBe(false);
});

test('follows reopen as shapes, notes and search answer, and a chat goes on from here', async () => {
  const { follows } = await get('/api/v1/follows');
  expect(follows.map((f: Out) => f.kind).sort()).toEqual(['account', 'account', 'network']);
  const drawn = follows.find((f: Out) => f.spec_sha256);
  expect((await get(`/api/v1/follows/${drawn.id}`)).current.spec.petal).toBe('spec/v1');
  expect((await get('/api/v1/notes')).notes).toHaveLength(2);
  expect((await get('/api/v1/search?q=climbing')).results[0].kind).toBe('note');
  expect((await get('/api/v1/search?q=Moloch')).results.length).toBeGreaterThan(0);

  const hash = createHash('sha256')
    .update(cookie.split('=')[1] as string)
    .digest('hex');
  const store = openPrivateStore(stateDir);
  expect((await store.session.get(hash, new Date().toISOString()))?.invite).toBe(options.inviteId);
  await store.close();
  const res = await app.request('/api/v1/agent/chat', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'one more' }] }),
  });
  expect(res.status).toBe(202);
});

test('seeding a folder again leaves what it holds', async () => {
  const again = await seedWorkspace(options);
  expect(again.fresh).toBe(false);
  expect(again.follows).toBe(3);
  expect(`${SESSION_COOKIE}=${again.session}`).toBe(cookie);
});

// Paying for Petals' own agent in NEAR (specs/003-target/proposal-payment.md), through petalApp. The
// chain and NEAR's price are stand-ins here; tests/e2e's journey server walks a real testnet transfer.
import { join } from 'node:path';
import { NearError } from '@petal/near';
import { fakeRpcFor, testSigner } from '@petal/near/auth/testing';
import type { Transfer } from '@petal/near/pay';
import { openStore } from '@petal/store';
import { describe, expect, test } from 'vitest';
import { buildPetalApp } from '../src/app.ts';
import { personCredit } from '../src/invites.ts';
import { fakeRegistry, parseSse, type ScriptTurn, scriptedLlm, tmpRoot, tool } from './helpers.ts';

const SITE = 'https://petals.example';
const COOKIE = '__Host-petal_session';
const QUESTION = { messages: [{ role: 'user', content: 'who holds the power here?' }] };
const alice = testSigner('alice.near');
const bob = testSigner('bob.near');
const HASH = '6zgh2u9DqHHiXzdy9ouTP7oGky2T4nugqzqt9wJZwNFm';
const OTHER = '9zgh2u9DqHHiXzdy9ouTP7oGky2T4nugqzqt9wJZwNFm';
const ONE_NEAR = `1${'0'.repeat(24)}`;

/** A chain with these transfers on it, by hash; anything else isn't there. */
function chain(txs: Record<string, Partial<Transfer>>) {
  const reads: string[] = [];
  const read = async (network: string, hash: string, sender: string): Promise<Transfer> => {
    reads.push(`${network}:${hash}:${sender}`);
    const t = txs[hash];
    if (!t) throw new NearError('not_found', `no transaction ${hash}`);
    return {
      tx_hash: hash,
      signer_id: sender,
      receiver_id: 'petals.near',
      yocto: ONE_NEAR,
      succeeded: true,
      methods: [],
      ...t,
    } as Transfer;
  };
  return { read, reads };
}

function setup(
  txs: Record<string, Partial<Transfer>> = {},
  o: {
    price?: number | null;
    costUsd?: number;
    turns?: ScriptTurn[];
    public?: boolean;
    dailyUsd?: number;
    registry?: ReturnType<typeof fakeRegistry>['registry'];
  } = {},
) {
  const root = tmpRoot();
  const stateDir = join(root, 'state');
  const llm = scriptedLlm(o.turns ?? Array.from({ length: 10 }, () => ({ content: 'an answer' })), {
    costUsd: o.costUsd ?? 0.01,
  });
  const onChain = chain(txs);
  const app = buildPetalApp(
    {
      root,
      stateDir,
      apiBase: SITE,
      llmDailyUsd: o.dailyUsd ?? 5,
      ...(o.public ? { public: true } : {}),
    },
    {
      llm,
      rpcFor: () => fakeRpcFor([alice, bob]),
      registry: o.registry ?? fakeRegistry().registry,
      pay: {
        readTransfer: onChain.read,
        nearUsd: async () => (o.price === undefined ? 3.5 : o.price),
      },
      env: { PETAL_AGENT_ACCESS: 'gated', PETAL_WALLET_KEY: 'ab'.repeat(32), NODE_ENV: 'test' },
    },
  );
  const jar = { cookie: '' };
  const call = async (method: string, path: string, json?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: {
        origin: SITE,
        'content-type': 'application/json',
        ...(jar.cookie ? { cookie: jar.cookie } : {}),
      },
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
    });
    const set = res.headers.getSetCookie().find((l) => l.startsWith(`${COOKIE}=`));
    if (set) jar.cookie = set.split(';')[0] as string;
    return res;
  };
  const signIn = async (who = alice, network = 'mainnet') => {
    const c = (await (await call('POST', '/api/v1/auth/challenge', {})).json()) as {
      nonce: string;
      message: string;
      recipient: string;
    };
    await call('POST', '/api/v1/auth/verify', { network, proof: who.sign(c) });
    return (await (await call('GET', '/api/v1/me')).json()) as { person_id: string };
  };
  const pay = (json: unknown) => call('POST', '/api/v1/pay', json);
  const store = () => openStore(join(stateDir, 'private.db'));
  return { app, llm, call, signIn, pay, store, onChain, jar };
}

describe('paying for Petals’ agent in NEAR', () => {
  test('GET /api/v1/pay says where to send NEAR, and its price now', async () => {
    const w = setup();
    const anyone = (await (await w.call('GET', '/api/v1/pay')).json()) as Record<string, unknown>;
    expect(anyone).toMatchObject({ network: 'mainnet', receiver: 'petals.near', near_usd: 3.5 });
  });

  test('a signed-in person with nothing paid is asked to pay, before any model call', async () => {
    const w = setup();
    await w.signIn();
    const res = await w.call('POST', '/api/v1/agent/chat', QUESTION);
    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: { code: string; hint: string } };
    expect(body.error.code).toBe('payment_required');
    expect(body.error.hint).toContain('/api/v1/pay');
    expect(w.llm.requests.length).toBe(0);
  });

  test('a stranger, not signed in, still needs an invite', async () => {
    const w = setup();
    const res = await w.call('POST', '/api/v1/agent/chat', QUESTION);
    expect(res.status).toBe(403);
  });

  test('a transfer from their wallet becomes credit at NEAR’s price, once, and the agent runs on it', async () => {
    const w = setup({ [HASH]: {} });
    const { person_id: person } = await w.signIn();
    const body = { network: 'mainnet', account_id: 'alice.near', tx_hash: HASH };
    const first = (await (await w.pay(body)).json()) as Record<string, unknown>;
    expect(first).toMatchObject({ added_usd: 3.5, added_near: 1, near_usd: 3.5 });
    expect(first.credit).toMatchObject({
      funded_usd: 3.5,
      spent_usd: 0,
      left_usd: 3.5,
      usd_per_chat: 0.5,
    });
    expect(w.onChain.reads).toEqual([`mainnet:${HASH}:alice.near`]);

    const again = (await (await w.pay(body)).json()) as Record<string, unknown>;
    expect(again).toMatchObject({ added_usd: 0, added_near: 0 });
    expect(again.credit).toMatchObject({ funded_usd: 3.5 });

    const res = await w.call('POST', '/api/v1/agent/chat', QUESTION);
    expect(res.status).toBe(200);
    const done = parseSse(await res.text()).find((e) => e.event === 'done')?.data as {
      cost_usd: number;
    };
    expect(done.cost_usd).toBeCloseTo(0.01, 9);
    const s = w.store();
    try {
      expect((await personCredit(s, person))?.left_usd).toBeCloseTo(3.49, 9);
    } finally {
      await s.close();
    }
  });

  test('when the credit runs out mid-turn, the stream says payment_required, and so does the next chat', async () => {
    const turns: ScriptTurn[] = [
      { calls: [{ name: 'list_flowers', args: {} }] },
      { content: 'never reached' },
    ];
    const w = setup(
      { [HASH]: { yocto: `1${'0'.repeat(22)}` } },
      { price: 1, costUsd: 0.02, turns },
    );
    await w.signIn();
    // 0.01 NEAR at $1 is $0.01, and the first call costs $0.02
    const paid = (await (
      await w.pay({ network: 'mainnet', account_id: 'alice.near', tx_hash: HASH })
    ).json()) as { added_usd: number };
    expect(paid.added_usd).toBe(0.01);
    const events = parseSse(await (await w.call('POST', '/api/v1/agent/chat', QUESTION)).text());
    const error = events.find((e) => e.event === 'error')?.data as { code: string; hint: string };
    expect(error.code).toBe('payment_required');
    expect(error.hint).toContain('/api/v1/pay');
    expect(events.at(-1)?.event).toBe('done');
    expect(w.llm.requests.length).toBe(1);
    const later = await w.call('POST', '/api/v1/agent/chat', QUESTION);
    expect(later.status).toBe(402);
    expect(((await later.json()) as { error: { code: string } }).error.code).toBe(
      'payment_required',
    );
  });

  test('refuses what isn’t a successful NEAR transfer from their own wallet to petals.near', async () => {
    const w = setup({
      [HASH]: { receiver_id: 'someone.near' },
      [OTHER]: { succeeded: false },
    });
    await w.signIn();
    const pay = async (json: Record<string, unknown>) => {
      const res = await w.pay({
        network: 'mainnet',
        account_id: 'alice.near',
        tx_hash: HASH,
        ...json,
      });
      return {
        status: res.status,
        code: ((await res.json()) as { error?: { code: string } }).error?.code,
      };
    };
    expect(await pay({})).toEqual({ status: 400, code: 'bad_input' });
    expect(await pay({ tx_hash: OTHER })).toEqual({ status: 400, code: 'bad_input' });
    expect(await pay({ account_id: 'bob.near' })).toEqual({ status: 401, code: 'unauthorised' });
    expect(await pay({ network: 'testnet' })).toEqual({ status: 400, code: 'bad_input' });
    expect(await pay({ tx_hash: 'not-a-hash' })).toEqual({ status: 400, code: 'bad_input' });
    expect(await pay({ tx_hash: `${HASH.slice(0, -1)}X` })).toEqual({
      status: 404,
      code: 'not_found',
    });
  });

  test('a stranger can’t pay onto anyone’s credit, and nothing counts when the price can’t be read', async () => {
    const w = setup({ [HASH]: {} }, { price: null });
    const res = await w.pay({ network: 'mainnet', account_id: 'alice.near', tx_hash: HASH });
    expect(res.status).toBe(401);
    await w.signIn();
    const priced = await w.pay({ network: 'mainnet', account_id: 'alice.near', tx_hash: HASH });
    expect(priced.status).toBe(503);
    expect(
      ((await (await w.call('GET', '/api/v1/me')).json()) as { credit: unknown }).credit,
    ).toBeNull();
  });

  test('another person can’t claim the same transaction', async () => {
    const w = setup({ [HASH]: { signer_id: 'alice.near' } });
    await w.signIn(bob);
    const res = await w.pay({ network: 'mainnet', account_id: 'alice.near', tx_hash: HASH });
    expect(res.status).toBe(401);
  });

  test('testnet pays on a development server, to petals.testnet; a public site counts mainnet NEAR only', async () => {
    const lane = setup({ [HASH]: { receiver_id: 'petals.testnet' } });
    await lane.signIn(alice, 'testnet');
    expect(
      ((await (await lane.call('GET', '/api/v1/pay')).json()) as Record<string, unknown>).receiver,
    ).toBe('petals.testnet');
    const paid = await lane.pay({ network: 'testnet', account_id: 'alice.near', tx_hash: HASH });
    expect(paid.status).toBe(200);
    expect(lane.onChain.reads).toEqual([`testnet:${HASH}:alice.near`]);

    const live = setup({ [HASH]: { receiver_id: 'petals.testnet' } }, { public: true });
    await live.signIn(alice, 'testnet');
    expect(
      ((await (await live.call('GET', '/api/v1/pay')).json()) as Record<string, unknown>).network,
    ).toBe('mainnet');
    const refused = await live.pay({ network: 'testnet', account_id: 'alice.near', tx_hash: HASH });
    expect(refused.status).toBe(400);
    expect(live.onChain.reads).toEqual([]);
  });

  test('paid turns don’t count against the daily cap (unpaid spend only)', async () => {
    const w = setup({ [HASH]: {} }, { dailyUsd: 0.015, costUsd: 0.01 });
    await w.signIn();
    await w.pay({ network: 'mainnet', account_id: 'alice.near', tx_hash: HASH });
    // three calls at $0.01 each, past a $0.015 day
    for (let i = 0; i < 3; i++) {
      const events = parseSse(await (await w.call('POST', '/api/v1/agent/chat', QUESTION)).text());
      expect(events.find((e) => e.event === 'error')).toBeUndefined();
    }
    expect(w.llm.requests.length).toBe(3);
    const s = w.store();
    try {
      expect((await s.ledger.get(new Date().toISOString().slice(0, 10))).usd).toBe(0);
    } finally {
      await s.close();
    }
  });

  test('on a public site, the paid agent’s own tools read from the server; the doors still don’t', async () => {
    const seen: (boolean | undefined)[] = [];
    const registry = [
      ...fakeRegistry().registry,
      tool('read_chain', (_a, ctx) => {
        seen.push(ctx.config.public);
        return { rows: [], tools_version: 'tools/v2' };
      }),
    ];
    const turns: ScriptTurn[] = [
      { calls: [{ name: 'read_chain', args: {} }] },
      { content: 'done' },
    ];
    const w = setup({ [HASH]: {} }, { public: true, turns, registry });
    await w.signIn();
    await w.pay({ network: 'mainnet', account_id: 'alice.near', tx_hash: HASH });
    await (await w.call('POST', '/api/v1/agent/chat', QUESTION)).text();
    expect(seen).toEqual([false]);
    const health = (await (await w.call('GET', '/api/v1/health')).json()) as Record<
      string,
      unknown
    >;
    expect(health.public).toBe(true);
  });

  test('a POST from another site is refused', async () => {
    const w = setup({ [HASH]: {} });
    await w.signIn();
    const res = await w.app.request('/api/v1/pay', {
      method: 'POST',
      headers: {
        origin: 'https://evil.example',
        'content-type': 'application/json',
        cookie: w.jar.cookie,
      },
      body: JSON.stringify({ network: 'mainnet', account_id: 'alice.near', tx_hash: HASH }),
    });
    expect(res.status).toBe(401);
  });
});

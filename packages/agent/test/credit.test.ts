// The credit contract on the server (proposal-payment.md, section 6), through petalApp, with a stand-in
// chain. A person's own credit is what the wallet they signed in with holds in the contract: read before each
// chat, and charged in NEAR when the chat ends. The real contract is walked on testnet by hand.
import { join } from 'node:path';
import { NearError } from '@petal/near';
import { fakeRpcFor, testSigner } from '@petal/near/auth/testing';
import type { Transfer } from '@petal/near/pay';
import { describe, expect, test } from 'vitest';
import { buildPetalApp } from '../src/app.ts';
import type { CreditChain } from '../src/credit.ts';
import { parseSse, scriptedLlm, tmpRoot } from './helpers.ts';

const SITE = 'https://petals.example';
const COOKIE = '__Host-petal_session';
const QUESTION = { messages: [{ role: 'user', content: 'who holds the power here?' }] };
const CONTRACT = 'credit.petals.near';
const HASH = '6zgh2u9DqHHiXzdy9ouTP7oGky2T4nugqzqt9wJZwNFm';
const NEAR = 10n ** 24n;
const alice = testSigner('alice.near');
const bob = testSigner('bob.near');

/** A contract with these balances, that records its charges. */
function stand(balances: Record<string, bigint>) {
  const charges: [string, bigint][] = [];
  const chain: CreditChain = {
    contract: { network: 'mainnet', contract: CONTRACT, chargerKeyFile: '/nowhere' },
    balanceOf: async (a) => balances[a] ?? 0n,
    charge: async (a, y) => {
      const had = balances[a] ?? 0n;
      const charged = y < had ? y : had;
      balances[a] = had - charged;
      charges.push([a, y]);
      return { charged, tx_hash: HASH };
    },
  };
  return { chain, charges, balances };
}

function setup(balances: Record<string, bigint>, txs: Record<string, Partial<Transfer>> = {}) {
  const root = tmpRoot();
  const s = stand(balances);
  const llm = scriptedLlm(
    Array.from({ length: 10 }, () => ({ content: 'an answer' })),
    { costUsd: 0.035 },
  );
  const read = async (_n: string, hash: string, sender: string): Promise<Transfer> => {
    const t = txs[hash];
    if (!t) throw new NearError('not_found', 'no such transaction');
    return {
      tx_hash: hash,
      signer_id: sender,
      receiver_id: CONTRACT,
      yocto: String(NEAR),
      succeeded: true,
      methods: ['deposit'],
      ...t,
    } as Transfer;
  };
  const app = buildPetalApp(
    { root, stateDir: join(root, 'state'), apiBase: SITE, llmDailyUsd: 5 },
    {
      llm,
      rpcFor: () => fakeRpcFor([alice, bob]),
      pay: { credit: s.chain, nearUsd: async () => 3.5, readTransfer: read },
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
  const signIn = async () => {
    const c = (await (await call('POST', '/api/v1/auth/challenge', {})).json()) as {
      nonce: string;
      message: string;
      recipient: string;
    };
    await call('POST', '/api/v1/auth/verify', { network: 'mainnet', proof: alice.sign(c) });
  };
  /** Another NEAR wallet for the person signed in. */
  const addWallet = async (who: typeof alice) => {
    const c = (await (await call('POST', '/api/v1/auth/challenge', {})).json()) as {
      nonce: string;
      message: string;
      recipient: string;
    };
    return call('POST', '/api/v1/me/wallets', { network: 'mainnet', proof: who.sign(c) });
  };
  return { ...s, llm, call, signIn, addWallet };
}

/** Lets the chat's end (the charge) happen. */
const settled = () => new Promise((r) => setTimeout(r, 20));

describe('the credit contract', () => {
  test('GET /api/v1/pay names the contract and its deposit, and the balance read now', async () => {
    const w = setup({ 'alice.near': NEAR });
    expect(await (await w.call('GET', '/api/v1/pay')).json()).toMatchObject({
      network: 'mainnet',
      receiver: CONTRACT,
      method: 'deposit',
      near_usd: 3.5,
      credit: null,
    });
    await w.signIn();
    const pay = (await (await w.call('GET', '/api/v1/pay')).json()) as {
      credit: { left_usd: number; balance_yocto: string };
    };
    expect(pay.credit.left_usd).toBe(3.5);
    expect(pay.credit.balance_yocto).toBe(String(NEAR));
  });

  test('a chat runs on what the contract holds, and its cost is charged there in NEAR when it ends', async () => {
    const w = setup({ 'alice.near': NEAR });
    await w.signIn();
    const res = await w.call('POST', '/api/v1/agent/chat', QUESTION);
    expect(res.status).toBe(200);
    const done = parseSse(await res.text()).find((e) => e.event === 'done')?.data as {
      cost_usd: number;
    };
    expect(done.cost_usd).toBeCloseTo(0.035, 9);
    await settled();
    // $0.035 at $3.50 a NEAR is 0.01 NEAR
    expect(w.charges).toEqual([['alice.near', NEAR / 100n]]);
    expect(w.balances['alice.near']).toBe(NEAR - NEAR / 100n);
  });

  test('nothing in the contract: payment_required, before any model call', async () => {
    const w = setup({});
    await w.signIn();
    const res = await w.call('POST', '/api/v1/agent/chat', QUESTION);
    expect(res.status).toBe(402);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('payment_required');
    expect(w.llm.requests.length).toBe(0);
    expect(w.charges).toEqual([]);
  });

  test('a withdrawal outside the page is seen before the next chat', async () => {
    const w = setup({ 'alice.near': NEAR });
    await w.signIn();
    await (await w.call('POST', '/api/v1/agent/chat', QUESTION)).text();
    await settled();
    w.balances['alice.near'] = 0n;
    const res = await w.call('POST', '/api/v1/agent/chat', QUESTION);
    expect(res.status).toBe(402);
  });

  test('POST /api/v1/pay after a deposit or a withdrawal sets the credit to the contract’s balance', async () => {
    const w = setup({ 'alice.near': 0n }, { [HASH]: {} });
    await w.signIn();
    w.balances['alice.near'] = 2n * NEAR;
    const paid = (await (
      await w.call('POST', '/api/v1/pay', {
        network: 'mainnet',
        account_id: 'alice.near',
        tx_hash: HASH,
      })
    ).json()) as Record<string, unknown>;
    expect(paid).toMatchObject({ added_usd: 7, added_near: 1, near_usd: 3.5 });
    expect(paid.credit).toMatchObject({
      left_usd: 7,
      usd_per_chat: 0.5,
      balance_yocto: String(2n * NEAR),
    });
  });

  test('refuses a transaction that isn’t a deposit or withdrawal in the contract, or a plain transfer to Petals', async () => {
    const OTHER = '9zgh2u9DqHHiXzdy9ouTP7oGky2T4nugqzqt9wJZwNFm';
    const w = setup(
      { 'alice.near': NEAR },
      { [HASH]: { receiver_id: 'someone.near', methods: [] }, [OTHER]: { methods: ['charge'] } },
    );
    await w.signIn();
    for (const tx_hash of [HASH, OTHER]) {
      const res = await w.call('POST', '/api/v1/pay', {
        network: 'mainnet',
        account_id: 'alice.near',
        tx_hash,
      });
      expect(res.status).toBe(400);
    }
  });

  test('a plain transfer to Petals still counts with the contract, and a chat spends it before the contract is charged', async () => {
    const PLAIN = '7zgh2u9DqHHiXzdy9ouTP7oGky2T4nugqzqt9wJZwNFm';
    const w = setup(
      { 'alice.near': NEAR },
      { [PLAIN]: { receiver_id: 'petals.near', methods: [], yocto: String(NEAR) } },
    );
    await w.signIn();
    const paid = (await (
      await w.call('POST', '/api/v1/pay', {
        network: 'mainnet',
        account_id: 'alice.near',
        tx_hash: PLAIN,
      })
    ).json()) as { added_usd: number };
    expect(paid.added_usd).toBe(3.5);
    // what the contract holds and what's off it, together
    const pay = (await (await w.call('GET', '/api/v1/pay')).json()) as {
      credit: { left_usd: number };
    };
    expect(pay.credit.left_usd).toBeCloseTo(7, 9);
    await (await w.call('POST', '/api/v1/agent/chat', QUESTION)).text();
    await settled();
    // the chat's $0.035 came off the plain transfer: the contract wasn't charged
    expect(w.charges).toEqual([]);
    const after = (await (await w.call('GET', '/api/v1/pay')).json()) as {
      credit: { left_usd: number };
    };
    expect(after.credit.left_usd).toBeCloseTo(7 - 0.035, 9);
  });

  test('what is off the contract pays first, and the contract is charged only for the rest', async () => {
    const PLAIN = '8zgh2u9DqHHiXzdy9ouTP7oGky2T4nugqzqt9wJZwNFm';
    const w = setup(
      { 'alice.near': NEAR },
      // 0.002 NEAR off the contract: $0.007 at $3.50, less than one chat's $0.035
      { [PLAIN]: { receiver_id: 'petals.near', methods: [], yocto: String((2n * NEAR) / 1000n) } },
    );
    await w.signIn();
    await w.call('POST', '/api/v1/pay', {
      network: 'mainnet',
      account_id: 'alice.near',
      tx_hash: PLAIN,
    });
    await (await w.call('POST', '/api/v1/agent/chat', QUESTION)).text();
    await settled();
    // $0.028 left after the $0.007, at $3.50 a NEAR: 0.008 NEAR
    expect(w.charges).toEqual([['alice.near', (8n * NEAR) / 1000n]]);
  });

  test('every NEAR wallet the person holds counts: a deposit from the second, and a charge drawn from each in turn', async () => {
    const w = setup({ 'alice.near': (4n * NEAR) / 1000n, 'bob.near': 0n }, { [HASH]: {} });
    await w.signIn();
    expect((await w.addWallet(bob)).status).toBe(200);
    // a deposit from the second wallet lands on the same person
    w.balances['bob.near'] = NEAR;
    const paid = (await (
      await w.call('POST', '/api/v1/pay', {
        network: 'mainnet',
        account_id: 'bob.near',
        tx_hash: HASH,
      })
    ).json()) as { credit: { left_usd: number; balance_yocto: string } };
    expect(paid.credit.balance_yocto).toBe(String(NEAR + (4n * NEAR) / 1000n));
    expect(paid.credit.left_usd).toBeCloseTo(3.514, 9);
    await (await w.call('POST', '/api/v1/agent/chat', QUESTION)).text();
    await settled();
    // the chat's 0.01 NEAR: the first wallet's 0.004, then 0.006 from the second
    expect(w.charges).toEqual([
      ['alice.near', (4n * NEAR) / 1000n],
      ['bob.near', (6n * NEAR) / 1000n],
    ]);
  });
});

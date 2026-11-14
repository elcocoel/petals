// The credit contract on the server (proposal-payment.md, section 6), through petalApp, with a stand-in
// chain. A person's own credit is what the wallet they signed in with holds in the contract: read before each
// chat, and charged in NEAR when the chat ends. The real contract is walked on testnet by hand.
import { join } from 'node:path';
import { NearError } from '@petal/near';
import { evmTestSigner, fakeRpcFor, testSigner } from '@petal/near/auth/testing';
import type { Transfer } from '@petal/near/pay';
import { describe, expect, test } from 'vitest';
import { buildPetalApp } from '../src/app.ts';
import type { CreditChain } from '../src/credit.ts';
import { fundPerson, openPrivateStore } from '../src/index.ts';
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

/** A fake 1Click: what it was asked, a quote, and a status that lands when told. No money moves. */
function fake1Click() {
  const asked: { path: string; body: unknown }[] = [];
  let status = 'PENDING_DEPOSIT';
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    asked.push({ path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null });
    const json = (x: unknown) =>
      new Response(JSON.stringify(x), { headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/v0/quote')
      return json({
        quote: {
          depositAddress: '0xdeposit',
          amountIn: '1000000',
          amountInFormatted: '1.0',
          amountInUsd: '1.0050',
          amountOut: String(NEAR / 4n),
          amountOutUsd: '0.8750',
          deadline: '2026-11-14T21:00:00.000Z',
        },
      });
    if (url.pathname === '/v0/status')
      return json({
        status,
        swapDetails: { amountOut: String(NEAR / 4n), amountOutUsd: '0.8750' },
      });
    return new Response('{}', { status: 404 });
  };
  return { fetch, asked, land: () => (status = 'SUCCESS') };
}

function setup(
  balances: Record<string, bigint>,
  txs: Record<string, Partial<Transfer>> = {},
  one = fake1Click(),
) {
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
      pay: {
        credit: s.chain,
        nearUsd: async () => 3.5,
        readTransfer: read,
        oneClick: { fetch: one.fetch },
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
  /** Signs in with an Ethereum wallet instead (SIWE, EIP-191), or links it to the person signed in. */
  const signInEvm = async (evm = evmTestSigner('credit'), path = '/api/v1/auth/verify') => {
    const c = (await (
      await call('POST', '/api/v1/auth/challenge', { chain: 'eip155', address: evm.address })
    ).json()) as { message: string };
    return call('POST', path, {
      network: 'eip155',
      proof: {
        type: 'eip191',
        address: evm.address,
        message: c.message,
        signature: evm.sign(c.message),
      },
    });
  };
  return { ...s, llm, call, signIn, addWallet, signInEvm, root, one };
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

  test("with the contract, a plain transfer to Petals isn't credited: it says to deposit into the contract", async () => {
    const PLAIN = '7zgh2u9DqHHiXzdy9ouTP7oGky2T4nugqzqt9wJZwNFm';
    const w = setup(
      { 'alice.near': NEAR },
      { [PLAIN]: { receiver_id: 'petals.near', methods: [], yocto: String(NEAR) } },
    );
    await w.signIn();
    const res = await w.call('POST', '/api/v1/pay', {
      network: 'mainnet',
      account_id: 'alice.near',
      tx_hash: PLAIN,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/add funds there, as a deposit/);
    // nothing landed off the contract: the credit is what the contract holds
    const pay = (await (await w.call('GET', '/api/v1/pay')).json()) as {
      credit: { left_usd: number };
    };
    expect(pay.credit.left_usd).toBeCloseTo(3.5, 9);
  });

  test("a NEAR Intents top-up lands in the contract as NEAR on the payer's own account, never on the ledger", async () => {
    const w = setup({ 'alice.near': 0n });
    await w.signIn();
    const top = await w.call('POST', '/api/v1/pay/intents', {
      usd: 0.875,
      origin_asset: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near',
      refund_to: '0x2527D02599Ba641c19FEa793cD0F167589a0f10D',
    });
    expect(top.status, await top.clone().text()).toBe(200);
    // wNEAR for the dollars at NEAR's price, to the contract, by ft_transfer_call naming the payer
    const quoted = w.one.asked.find((a) => a.path === '/v0/quote')?.body as Record<string, unknown>;
    expect(quoted).toMatchObject({
      destinationAsset: 'nep141:wrap.near',
      amount: String(NEAR / 4n),
      recipient: CONTRACT,
      recipientType: 'DESTINATION_CHAIN',
      customRecipientMsg: 'alice.near',
      swapType: 'EXACT_OUTPUT',
    });
    // it lands: the contract holds it under alice.near; the credit is read back from there
    w.one.land();
    w.balances['alice.near'] = NEAR / 4n;
    const after = (await (await w.call('GET', '/api/v1/pay/intents/0xdeposit')).json()) as {
      top_up: { status: string; credited_usd: number };
    };
    expect(after.top_up.status).toBe('SUCCESS');
    const pay = (await (await w.call('GET', '/api/v1/pay')).json()) as {
      credit: { left_usd: number };
    };
    expect(pay.credit.left_usd).toBeCloseTo(0.875, 9);
    // nothing was put on the ledger: a chat is charged on the contract
    await (await w.call('POST', '/api/v1/agent/chat', QUESTION)).text();
    await settled();
    expect(w.charges.length).toBe(1);
  });

  test('what is off the contract pays first, and the contract is charged only for the rest', async () => {
    const w = setup({ 'alice.near': NEAR });
    await w.signIn();
    // $0.007 off the contract, from Petals (a grant, as fund-person gives): less than one chat's $0.035
    const person = ((await (await w.call('GET', '/api/v1/me')).json()) as { person_id: string })
      .person_id;
    const store = openPrivateStore(join(w.root, 'state'));
    await fundPerson(store, person, 0.007);
    await store.close();
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

  test('an Ethereum person with a linked NEAR wallet: its deposit counts, the credit is what it holds, and a chat is charged there', async () => {
    const w = setup({ 'alice.near': 0n }, { [HASH]: {} });
    // the account starts with NEAR, links its Ethereum wallet, which then signs in to the same profile
    await w.signIn();
    expect((await w.signInEvm(undefined, '/api/v1/me/wallets')).status).toBe(200);
    expect((await w.signInEvm()).status).toBe(200);
    w.balances['alice.near'] = NEAR;
    const paid = (await (
      await w.call('POST', '/api/v1/pay', {
        network: 'mainnet',
        account_id: 'alice.near',
        tx_hash: HASH,
      })
    ).json()) as { credit: { left_usd: number; balance_yocto: string } };
    expect(paid.credit).toMatchObject({ left_usd: 3.5, balance_yocto: String(NEAR) });
    const pay = (await (await w.call('GET', '/api/v1/pay')).json()) as {
      credit: { left_usd: number };
    };
    expect(pay.credit.left_usd).toBe(3.5);
    await (await w.call('POST', '/api/v1/agent/chat', QUESTION)).text();
    await settled();
    expect(w.charges).toEqual([['alice.near', NEAR / 100n]]);
  });
});

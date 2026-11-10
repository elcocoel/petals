// A top-up through NEAR Intents (Elco, 10 Nov: "let users pay with anything from anywhere"): a real 1Click
// quote gives a deposit address, the person sends to it from any wallet on any chain, and once the swap has
// landed the dollars it delivered are on their credit, once, with their own entry. A fake 1Click: no money
// moves.
import { join } from 'node:path';
import { fakeRpcFor, testSigner } from '@petal/near/auth/testing';
import { openStore } from '@petal/store';
import { describe, expect, test } from 'vitest';
import { buildPetalApp } from '../src/app.ts';
import { fakeRegistry, scriptedLlm, tmpRoot } from './helpers.ts';

const SITE = 'https://petals.example';
const COOKIE = '__Host-petal_session';
const alice = testSigner('alice.near');
// biome-ignore lint/suspicious/noExplicitAny: walking what the server answers
type Out = Record<string, any>;
const BASE_USDC = 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near';

function fake1Click() {
  const asked: { path: string; body: unknown }[] = [];
  let status = 'PENDING_DEPOSIT';
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    asked.push({ path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null });
    const json = (x: unknown) =>
      new Response(JSON.stringify(x), { headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/v0/tokens') {
      return json([
        {
          assetId: BASE_USDC,
          blockchain: 'base',
          symbol: 'USDC',
          decimals: 6,
          price: 1,
          priceUpdatedAt: '',
        },
      ]);
    }
    if (url.pathname === '/v0/quote') {
      return json({
        quote: {
          depositAddress: '0xdeposit',
          amountIn: '5012500',
          amountInFormatted: '5.0125',
          amountInUsd: '5.0125',
          amountOut: '5000000',
          amountOutUsd: '5.0000',
          deadline: '2026-11-10T21:00:00.000Z',
        },
      });
    }
    if (url.pathname === '/v0/status') {
      return json({
        status,
        swapDetails: {
          amountOut: '5000000',
          amountOutUsd: '5.0000',
          originChainTxHashes: [{ hash: '0xorigin', explorerUrl: '' }],
          destinationChainTxHashes: [{ hash: 'neartx', explorerUrl: '' }],
          intentHashes: [],
          nearTxHashes: [],
        },
      });
    }
    return new Response('{}', { status: 404 });
  };
  return { fetch, asked, land: () => (status = 'SUCCESS') };
}

function setup() {
  const root = tmpRoot();
  const stateDir = join(root, 'state');
  const one = fake1Click();
  const app = buildPetalApp(
    { root, stateDir, apiBase: SITE, llmDailyUsd: 5 },
    {
      llm: scriptedLlm([]),
      rpcFor: () => fakeRpcFor([alice]),
      registry: fakeRegistry().registry,
      pay: { oneClick: { fetch: one.fetch } },
      env: { PETAL_AGENT_ACCESS: 'gated', PETAL_WALLET_KEY: 'ab'.repeat(32), NODE_ENV: 'test' },
    },
  );
  const jar = { cookie: '' };
  const request = async (path: string, method = 'GET', json?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: {
        origin: SITE,
        ...(json === undefined ? {} : { 'content-type': 'application/json' }),
        ...(jar.cookie ? { cookie: jar.cookie } : {}),
      },
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
    });
    const set = res.headers.getSetCookie().find((l) => l.startsWith(`${COOKIE}=`));
    if (set) jar.cookie = set.split(';')[0] as string;
    return res;
  };
  const signIn = async () => {
    const c = (await (await request('/api/v1/auth/challenge', 'POST', {})).json()) as Out;
    await request('/api/v1/auth/verify', 'POST', {
      network: 'mainnet',
      proof: alice.sign(c as never),
    });
  };
  const entries = async () => {
    const me = (await (await request('/api/v1/me')).json()) as Out;
    const s = openStore(join(stateDir, 'private.db'));
    try {
      return await s.credit.entries(`person:${me.person_id}`);
    } finally {
      await s.close();
    }
  };
  return { request, signIn, one, entries };
}

describe('a top-up through NEAR Intents', () => {
  test('any token: a deposit address, then pending, then landed on the credit once', async () => {
    const w = setup();
    const tokens = (await (await w.request('/api/v1/pay/tokens')).json()) as Out;
    expect(tokens.tokens).toEqual([
      { asset: BASE_USDC, chain: 'base', symbol: 'USDC', decimals: 6, usd: 1 },
    ]);
    expect((await w.request('/api/v1/pay/intents', 'POST', { usd: 5 })).status).toBe(401);
    await w.signIn();
    const res = await w.request('/api/v1/pay/intents', 'POST', {
      usd: 5,
      origin_asset: BASE_USDC,
      refund_to: '0xmine',
    });
    expect(res.status).toBe(200);
    const { top_up } = (await res.json()) as Out;
    expect(top_up).toMatchObject({
      deposit_address: '0xdeposit',
      amount_in_formatted: '5.0125',
      usd: 5,
    });
    // a real quote: EXACT_OUTPUT of five dollars of USDC into NEAR Intents under petals.near
    const quoted = w.one.asked.find((a) => a.path === '/v0/quote')?.body as Out;
    expect(quoted).toMatchObject({
      dry: false,
      swapType: 'EXACT_OUTPUT',
      originAsset: BASE_USDC,
      amount: '5000000',
      refundTo: '0xmine',
      recipient: 'petals.near',
      recipientType: 'INTENTS',
    });
    const pending = (await (await w.request('/api/v1/pay/intents/0xdeposit')).json()) as Out;
    expect(pending.top_up).toMatchObject({ status: 'PENDING_DEPOSIT', credited_usd: null });
    w.one.land();
    const landed = (await (await w.request('/api/v1/pay/intents/0xdeposit')).json()) as Out;
    expect(landed.top_up).toMatchObject({
      status: 'SUCCESS',
      credited_usd: 5,
      origin_tx: ['0xorigin'],
    });
    expect(landed.credit.left_usd).toBe(5);
    // asked again, it's not counted twice
    await w.request('/api/v1/pay/intents/0xdeposit');
    expect(
      (await w.entries()).filter((e) => e.id === 'intents:0xdeposit').map((e) => e.delta_usd),
    ).toEqual([5]);
  });

  test("what isn't a top-up is refused, and nobody else can read one", async () => {
    const w = setup();
    await w.signIn();
    expect(
      (
        await w.request('/api/v1/pay/intents', 'POST', {
          usd: 0,
          origin_asset: BASE_USDC,
          refund_to: 'x',
        })
      ).status,
    ).toBe(400);
    expect(
      (await w.request('/api/v1/pay/intents', 'POST', { usd: 5, refund_to: 'x' })).status,
    ).toBe(400);
    expect((await w.request('/api/v1/pay/intents/0xnobody')).status).toBe(404);
  });
});

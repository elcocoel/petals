import { base58, base64 } from '@scure/base';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Rpc, RpcQuery } from '../src/auth/index.ts';
import { nearRpc, verifyNep413 } from '../src/auth/nep413.ts';
import { createNonceStore, issueNonce, NONCE_TTL_MS } from '../src/auth/nonce.ts';
import {
  fakeRpc,
  fakeRpcFor,
  functionCall,
  implicitSigner,
  testSigner,
} from '../src/auth/testing.ts';
import { NearError } from '../src/errors.ts';

const recipient = 'petals.testnet';
const message = `{"petal":"publish/v1","entry_sha256":"${'a'.repeat(64)}"}`;
const expect_ = { message, recipient };
const maker = testSigner('maker.testnet');
const agentKey = testSigner('maker.testnet', 'agent-key'); // same account, function-call key

function signed(signer = maker, over: Partial<{ message: string; recipient: string }> = {}) {
  const { nonce } = issueNonce();
  return signer.sign({
    message: over.message ?? message,
    nonce,
    recipient: over.recipient ?? recipient,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('issueNonce', () => {
  test('32 random bytes as base64, valid 5 minutes, never the same twice', () => {
    const before = Date.now();
    const a = issueNonce();
    const b = issueNonce();
    expect(base64.decode(a.nonce)).toHaveLength(32);
    expect(a.nonce).not.toBe(b.nonce);
    const ttl = Date.parse(a.expires_at) - before;
    expect(ttl).toBeGreaterThanOrEqual(NONCE_TTL_MS);
    expect(ttl).toBeLessThan(NONCE_TTL_MS + 1_000);
  });
});

describe('verifyNep413', () => {
  test('a valid proof from a full-access key passes; view_access_key is asked at final', async () => {
    const rpc = fakeRpcFor([maker]);
    expect(await verifyNep413(signed(), expect_, rpc)).toEqual({ ok: true });
    expect(rpc.calls).toEqual([
      {
        request_type: 'view_access_key',
        finality: 'final',
        account_id: 'maker.testnet',
        public_key: maker.publicKey,
      },
    ]);
  });

  test('a wrong message fails, with no RPC call', async () => {
    const rpc = fakeRpcFor([maker]);
    const other = signed(maker, { message: '{"petal":"publish/v1","entry_sha256":"b"}' });
    expect(await verifyNep413(other, expect_, rpc)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/message/),
    });
    // the proof claims the right message but the signature covers another one
    const forged = { ...other, message };
    expect(await verifyNep413(forged, expect_, rpc)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/signature does not match/),
    });
    expect(rpc.calls).toHaveLength(0);
  });

  test('a wrong recipient fails', async () => {
    const proof = signed(maker, { recipient: 'evil.testnet' });
    expect(await verifyNep413(proof, expect_, fakeRpcFor([maker]))).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/recipient/),
    });
  });

  test('a reused nonce fails', async () => {
    const rpc = fakeRpcFor([maker]);
    const proof = signed();
    expect((await verifyNep413(proof, expect_, rpc)).ok).toBe(true);
    expect(await verifyNep413(proof, expect_, rpc)).toEqual({
      ok: false,
      reason: 'the nonce was already used',
    });
  });

  test('two requests with one proof at once: only one passes', async () => {
    const rpc = fakeRpcFor([maker]);
    const proof = signed();
    const results = await Promise.all([
      verifyNep413(proof, expect_, rpc),
      verifyNep413(proof, expect_, rpc),
    ]);
    expect(results.map((r) => r.ok).sort()).toEqual([false, true]);
  });

  test('a stale nonce fails (after 5 minutes)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 10, 4, 12));
    const rpc = fakeRpcFor([maker]);
    const fresh = signed();
    const stale = signed();
    vi.setSystemTime(Date.UTC(2026, 10, 4, 12, 4, 59));
    expect((await verifyNep413(fresh, expect_, rpc)).ok).toBe(true);
    vi.setSystemTime(Date.UTC(2026, 10, 4, 12, 5, 0));
    expect(await verifyNep413(stale, expect_, rpc)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/expired/),
    });
  });

  test('a nonce this server never issued fails', async () => {
    const proof = maker.sign({ message, nonce: new Uint8Array(32).fill(9), recipient });
    expect(await verifyNep413(proof, expect_, fakeRpcFor([maker]))).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/not issued/),
    });
  });

  test("the docs' 36-byte UUID nonce fails", async () => {
    const proof = {
      ...signed(),
      nonce: base64.encode(new TextEncoder().encode(crypto.randomUUID())),
    };
    expect(await verifyNep413(proof, expect_, fakeRpcFor([maker]))).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/32 bytes/),
    });
  });

  test('a function-call key fails: an agent key cannot sign for the maker', async () => {
    const rpc = fakeRpcFor([maker, agentKey], [agentKey]);
    expect(await verifyNep413(signed(agentKey), expect_, rpc)).toEqual({
      ok: false,
      reason: 'the key is not a full-access key of maker.testnet',
    });
  });

  test('a key that is not on the account fails', async () => {
    expect(await verifyNep413(signed(), expect_, fakeRpc({}))).toEqual({
      ok: false,
      reason: 'the key is not a key of maker.testnet',
    });
  });

  test('RPC down: throws source_failed and keeps the nonce, so the maker need not sign again', async () => {
    const proof = signed();
    const down = {
      async query(): Promise<never> {
        throw new Error('fetch failed: connect ECONNREFUSED');
      },
    };
    const err = await verifyNep413(proof, expect_, down).catch((e) => e);
    expect(err).toBeInstanceOf(NearError);
    expect(err).toMatchObject({ code: 'source_failed' });
    expect(await verifyNep413(proof, expect_, fakeRpcFor([maker]))).toEqual({ ok: true });
  });

  test('anything that is not a NEP-413 proof fails', async () => {
    const rpc = fakeRpcFor([maker]);
    const proof = signed();
    for (const bad of [null, {}, { ...proof, type: 'siwe' }, { ...proof, signature: 1 }]) {
      expect(await verifyNep413(bad as never, expect_, rpc)).toMatchObject({ ok: false });
    }
    expect(await verifyNep413({ ...proof, public_key: 'ed25519:xyz' }, expect_, rpc)).toMatchObject(
      { ok: false, reason: expect.stringMatching(/public key/) },
    );
    expect(rpc.calls).toHaveLength(0);
  });

  test('a base58 signature (some older wallets) is read too', async () => {
    const proof = signed();
    const b58 = { ...proof, signature: base58.encode(base64.decode(proof.signature)) };
    expect(await verifyNep413(b58, expect_, fakeRpcFor([maker]))).toEqual({ ok: true });
  });

  test('near-cli-rs’s form, ed25519: and base58, is read too', async () => {
    const proof = signed();
    const cli = {
      ...proof,
      signature: `ed25519:${base58.encode(base64.decode(proof.signature))}`,
    };
    expect(await verifyNep413(cli, expect_, fakeRpcFor([maker]))).toEqual({ ok: true });
  });

  test('a separate nonce store keeps its own nonces', async () => {
    const store = createNonceStore();
    const { nonce } = store.issue();
    const proof = maker.sign({ message, nonce, recipient });
    expect(await verifyNep413(proof, expect_, fakeRpcFor([maker]))).toMatchObject({ ok: false });
    expect(await verifyNep413(proof, expect_, fakeRpcFor([maker]), { nonces: store })).toEqual({
      ok: true,
    });
  });
});

// near-identity.md, item 2: a new person's implicit account doesn't exist until its first transfer,
// so it has no keys to look up. NEAR Auth's rule: accept an account id equal to the hex of the public
// key "only while the account doesn't exist".
describe('verifyNep413, implicit accounts', () => {
  const newcomer = implicitSigner('newcomer');

  test('an unfunded implicit account passes, after view_access_key and then view_account', async () => {
    const rpc = fakeRpc({});
    expect(await verifyNep413(signed(newcomer), expect_, rpc)).toEqual({ ok: true });
    expect(rpc.calls.map((c) => c.request_type)).toEqual(['view_access_key', 'view_account']);
    expect(rpc.calls[1]).toMatchObject({ finality: 'final', account_id: newcomer.accountId });
  });

  test('its nonce is spent like any other', async () => {
    const proof = signed(newcomer);
    const rpc = fakeRpc({});
    expect(await verifyNep413(proof, expect_, rpc)).toEqual({ ok: true });
    expect(await verifyNep413(proof, expect_, rpc)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/already used/),
    });
  });

  test('once the account exists, a rotated-away key no longer passes', async () => {
    const rpc = fakeRpc({ [newcomer.accountId]: { 'ed25519:someOtherKey': 'FullAccess' } });
    expect(await verifyNep413(signed(newcomer), expect_, rpc)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/not a key of/),
    });
    expect(rpc.calls.map((c) => c.request_type)).toEqual(['view_access_key', 'view_account']);
  });

  test('an account id that is the hex of another key gets no such pass', async () => {
    const pretender = testSigner(newcomer.accountId, 'pretender');
    const rpc = fakeRpc({});
    expect(await verifyNep413(signed(pretender), expect_, rpc)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/not a key of/),
    });
    expect(rpc.calls.map((c) => c.request_type)).toEqual(['view_access_key']);
  });

  test('a named account with a missing key is never looked up as implicit', async () => {
    const rpc = fakeRpc({});
    expect(await verifyNep413(signed(maker), expect_, rpc)).toMatchObject({ ok: false });
    expect(rpc.calls.map((c) => c.request_type)).toEqual(['view_access_key']);
  });

  test('a function-call key on its own existing implicit account is still refused', async () => {
    const rpc = fakeRpc({ [newcomer.accountId]: { [newcomer.publicKey]: functionCall() } });
    expect(await verifyNep413(signed(newcomer), expect_, rpc)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/full-access/),
    });
  });

  test('view_account that cannot answer: source_failed, and the nonce can be tried again', async () => {
    const proof = signed(newcomer);
    const missing = fakeRpc({});
    const down: Rpc = {
      async query<T>(params: RpcQuery): Promise<T> {
        if (params.request_type === 'view_account') throw new Error('fetch failed');
        return missing.query<T>(params);
      },
    };
    const err = await verifyNep413(proof, expect_, down).catch((e) => e);
    expect(err).toBeInstanceOf(NearError);
    expect(err).toMatchObject({ code: 'source_failed' });
    expect(await verifyNep413(proof, expect_, fakeRpc({}))).toEqual({ ok: true });
  });
});

describe('nearRpc', () => {
  test('builds an Rpc for a network or a URL without calling it', () => {
    expect(typeof nearRpc('testnet').query).toBe('function');
    expect(typeof nearRpc({ url: 'http://127.0.0.1:1' }).query).toBe('function');
  });
});

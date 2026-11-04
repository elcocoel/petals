import { ed25519 } from '@noble/curves/ed25519.js';
import { base58, base64 } from '@scure/base';
import { describe, expect, test } from 'vitest';
import type { AccessKeyView } from '../src/auth/index.ts';
import {
  fakeRpc,
  fakeRpcFor,
  functionCall,
  NEP413_TAG,
  nep413Hash,
  nep413Payload,
  signatureMatches,
  testSigner,
} from '../src/auth/testing.ts';

const nonce = new Uint8Array(32).fill(7);
const message = '{"petal":"publish/v1","entry_sha256":"' + 'a'.repeat(64) + '"}';
const recipient = 'petals.testnet';

describe('NEP-413 payload', () => {
  test('borsh layout: tag, message, 32-byte nonce, recipient, no callback', () => {
    const bytes = nep413Payload({ message: 'hi', nonce, recipient: 'r' });
    expect([...bytes.slice(0, 4)]).toEqual([0x9d, 0x01, 0x00, 0x80]); // 2^31 + 413, little-endian
    expect(NEP413_TAG).toBe(2 ** 31 + 413);
    expect([...bytes.slice(4, 10)]).toEqual([2, 0, 0, 0, 0x68, 0x69]); // "hi"
    expect([...bytes.slice(10, 42)]).toEqual([...nonce]);
    expect([...bytes.slice(42)]).toEqual([1, 0, 0, 0, 0x72, 0]); // "r", callbackUrl None
    const withCallback = nep413Payload({ message: 'hi', nonce, recipient: 'r', callbackUrl: 'u' });
    expect([...withCallback.slice(47)]).toEqual([1, 1, 0, 0, 0, 0x75]);
  });

  test('the nonce must be exactly 32 bytes (the docs’ 36-byte UUID fails)', () => {
    expect(() => nep413Payload({ message, nonce: new Uint8Array(36), recipient })).toThrow(
      /32 bytes/,
    );
  });
});

describe('testSigner', () => {
  test('signs like a wallet: a proof that ed25519 verifies over the NEP-413 hash', () => {
    const s = testSigner('maker.testnet');
    const proof = s.sign({ message, nonce, recipient });
    expect(proof).toMatchObject({
      type: 'nep413',
      account_id: 'maker.testnet',
      message,
      recipient,
    });
    expect(proof.public_key).toMatch(/^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/);
    expect(base64.decode(proof.nonce)).toEqual(nonce);
    const ok = ed25519.verify(
      base64.decode(proof.signature),
      nep413Hash({ message, nonce, recipient }),
      base58.decode(proof.public_key.slice(8)),
    );
    expect(ok).toBe(true);
  });

  test('is deterministic per seed, and different seeds give different keys', () => {
    expect(testSigner('a.testnet').publicKey).toBe(testSigner('a.testnet').publicKey);
    expect(testSigner('a.testnet', 'other').publicKey).not.toBe(testSigner('a.testnet').publicKey);
  });

  test('a tampered message, recipient or nonce no longer matches', () => {
    const proof = testSigner().sign({ message, nonce, recipient });
    expect(signatureMatches(proof, { message, recipient })).toBe(true);
    expect(signatureMatches(proof, { message: `${message} `, recipient })).toBe(false);
    expect(signatureMatches(proof, { message, recipient: 'evil.testnet' })).toBe(false);
    const otherNonce = { ...proof, nonce: base64.encode(new Uint8Array(32).fill(8)) };
    expect(signatureMatches(otherNonce, { message, recipient })).toBe(false);
  });
});

describe('fakeRpc', () => {
  const maker = testSigner('maker.testnet');
  const agent = testSigner('maker.testnet', 'agent-key');

  test('view_access_key answers full-access or function-call per key', async () => {
    const rpc = fakeRpcFor([maker, agent], [agent]);
    const q = (public_key: string) =>
      rpc.query<AccessKeyView>({
        request_type: 'view_access_key',
        finality: 'final',
        account_id: 'maker.testnet',
        public_key,
      });
    expect((await q(maker.publicKey)).permission).toBe('FullAccess');
    expect((await q(agent.publicKey)).permission).toEqual(functionCall());
    expect(rpc.calls).toHaveLength(2);
  });

  test('a key not on the account fails like NEAR RPC', async () => {
    const rpc = fakeRpc({});
    await expect(
      rpc.query({
        request_type: 'view_access_key',
        account_id: 'x.testnet',
        public_key: maker.publicKey,
      }),
    ).rejects.toMatchObject({ type: 'AccessKeyDoesNotExist' });
    await expect(
      rpc.query({ request_type: 'view_account', account_id: 'x.testnet' }),
    ).rejects.toThrow();
  });
});

// EVM and Solana wallets' proofs (12 Nov, wave 5): EIP-191 personal_sign recovered to its address, EIP-55
// checksums, Solana's ed25519 signMessage; on outside vectors where there are ones.
import { describe, expect, test } from 'vitest';
import { createNonceStore } from '../src/auth/nonce.ts';
import { evmTestSigner, solanaTestSigner } from '../src/auth/testing.ts';
import {
  checksumAddress,
  eip191Signer,
  siweMessage,
  solanaSigned,
  verifyWalletProof,
} from '../src/auth/wallets.ts';

describe('EVM', () => {
  test("personal_sign recovers its signer: web3.js's own example of eth.accounts.sign", () => {
    const signature =
      '0xb91467e570a6466aa9e9876cbcd013baba02900b8979d43fe208a4a4f339f5fd6007e74cd82e037b800186422fc2da167c747ef045e5d18a5f5d4300f8e1a0291c';
    expect(eip191Signer('Some data', signature)).toBe('0x2c7536e3605d9c16a7a3d7b1898e529396a65c23');
    expect(eip191Signer('Other data', signature)).not.toBe(
      '0x2c7536e3605d9c16a7a3d7b1898e529396a65c23',
    );
    expect(eip191Signer('Some data', '0x1234')).toBeNull();
  });

  test("EIP-55's own checksum vector", () => {
    expect(checksumAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed')).toBe(
      '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
    );
  });

  test('a SIWE sign-in checks the site, the address, expiry and the nonce, which serves once', async () => {
    const nonces = createNonceStore();
    const { nonce, expires_at } = nonces.issue();
    const evm = evmTestSigner('unit');
    const message = siweMessage({
      domain: 'petals.example',
      uri: 'https://petals.example',
      address: evm.address,
      chainId: 1,
      nonce,
      issuedAt: new Date().toISOString(),
      expiresAt: expires_at,
      statement: 'Sign in to Petals.',
    });
    const proof = {
      type: 'eip191' as const,
      address: evm.address,
      message,
      signature: evm.sign(message),
    };
    const at = { domain: 'petals.example', now: new Date() };
    expect(await verifyWalletProof(proof, at, nonces)).toEqual({ ok: true, address: evm.address });
    expect(await verifyWalletProof(proof, at, nonces)).toMatchObject({ ok: false });
    const late = { domain: 'petals.example', now: new Date(Date.parse(expires_at) + 1) };
    expect(await verifyWalletProof(proof, late, nonces)).toMatchObject({
      ok: false,
      reason: 'the message has expired',
    });
  });
});

describe('Solana', () => {
  test('signMessage verifies against its address, and only its own', () => {
    const sol = solanaTestSigner('unit');
    const other = solanaTestSigner('other');
    const signature = sol.sign('hello');
    expect(solanaSigned(sol.address, 'hello', signature)).toBe(true);
    expect(solanaSigned(other.address, 'hello', signature)).toBe(false);
    expect(solanaSigned(sol.address, 'hullo', signature)).toBe(false);
  });
});

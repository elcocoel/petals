// The test wallet's script, under Node's WebCrypto, with a stand-in for near-connect's sandbox. A real
// browser's sandbox was proved by hand: see journey-server.ts.
import { implicitSigner, signatureMatches } from '@petal/near/auth/testing';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { seedSnippet, walletScript } from './test-wallet.ts';

interface Account {
  accountId: string;
  publicKey: string;
  signedMessage: { accountId: string; publicKey: string; signature: string };
}
interface Wallet {
  getAccounts(): Promise<{ accountId: string }[]>;
  signInAndSignMessage(o: { network: string; messageParams: unknown }): Promise<Account[]>;
}

function load(name: string): Wallet {
  let wallet: Wallet | undefined;
  vi.stubGlobal('window', {
    selector: {
      ready(w: Wallet) {
        wallet = w;
      },
    },
  });
  new Function(walletScript(name))();
  if (!wallet) throw new Error('the script never called selector.ready');
  return wallet;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const ASK = { message: 'Sign in to Petals at localhost.', recipient: 'localhost' };
const nonce = new Uint8Array(32).fill(7);

describe('the test wallet', () => {
  test('signs NEP-413 exactly as implicitSigner does, as its implicit account', async () => {
    const signer = implicitSigner('alice');
    const [out] = await load('alice').signInAndSignMessage({
      network: 'mainnet',
      messageParams: { ...ASK, nonce },
    });
    expect(out?.accountId).toBe(signer.accountId);
    expect(out?.signedMessage.publicKey).toBe(signer.publicKey);
    expect(out?.signedMessage.signature).toBe(signer.sign({ ...ASK, nonce }).signature);
    const proof = {
      type: 'nep413' as const,
      account_id: signer.accountId,
      public_key: signer.publicKey,
      signature: out?.signedMessage.signature as string,
      nonce: Buffer.from(nonce).toString('base64'),
      ...ASK,
    };
    expect(signatureMatches(proof, ASK)).toBe(true);
  });

  test('the network it is given changes nothing', async () => {
    const wallet = load('alice');
    const [main] = await wallet.signInAndSignMessage({
      network: 'mainnet',
      messageParams: { ...ASK, nonce },
    });
    const [test] = await wallet.signInAndSignMessage({
      network: 'testnet',
      messageParams: { ...ASK, nonce },
    });
    expect(test).toEqual(main);
  });

  test('another name is another account; a name that could break the script is refused', async () => {
    const [alice] = await load('alice').getAccounts();
    const [bob] = await load('bob').getAccounts();
    expect(bob?.accountId).not.toBe(alice?.accountId);
    expect(() => walletScript('a";alert(1)//')).toThrow(/not a wallet name/);
  });

  test('the snippet is one line, and lists each name on testnet too', () => {
    const line = seedSnippet('http://127.0.0.1:3189', ['alice', 'bob']);
    expect(line).not.toContain('\n');
    expect(line).toContain("['alice','bob']");
    expect(line).toContain('testnet:true');
    expect(line).toContain('Test wallet: ');
  });
});

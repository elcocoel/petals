// T192: the network someone chooses is the network the wallet is asked about. near-connect keeps one
// remembered wallet with no network in it, and Meteor's signMessage signs with the last account it
// saw, whichever network that was. So the testnet button asked for mainnet.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Prepared } from '../lib/publish.ts';

type Listener = (e: unknown) => void;

const made: FakeConnector[] = [];

class FakeConnector {
  listeners = new Set<Listener>();
  connect = vi.fn(async () => {
    if (this.reply === 'cancel') throw new Error('User rejected');
    if (this.reply === 'signed') {
      for (const l of this.listeners) {
        l({
          accounts: [
            {
              accountId: `elco.${this.options.network}`,
              signedMessage: { accountId: '', publicKey: 'ed25519:new', signature: 'sig-new' },
            },
          ],
        });
      }
    }
  });
  // What Meteor does when it is already connected: the stale mainnet account, ignoring the network.
  signMessage = vi.fn(async () => ({
    accountId: 'petals.near',
    publicKey: 'ed25519:stale',
    signature: 'sig-stale',
  }));
  getConnectedWallet = vi.fn(async () => ({ wallet: { signMessage: this.signMessage } }));
  reply: 'signed' | 'cancel' | 'silent' = 'signed';
  options: { network: string; excludedWallets?: string[] };
  constructor(options: { network: string; excludedWallets?: string[] }) {
    this.options = options;
    made.push(this);
  }
  on(_: string, l: Listener) {
    this.listeners.add(l);
  }
  once(e: string, l: Listener) {
    this.on(e, l);
  }
  off(_: string, l: Listener) {
    this.listeners.delete(l);
  }
}

vi.mock('@hot-labs/near-connect', () => ({ NearConnector: FakeConnector }));

const prepared: Prepared = {
  entry_sha256: '',
  nonce: 'AAAA',
  message: 'Sign in to Petals at localhost.',
  recipient: 'localhost',
  expires_at: '2026-11-06T12:00:00.000Z',
};

async function load() {
  vi.resetModules();
  return import('../lib/wallet.ts');
}

describe('signPrepared', () => {
  beforeEach(() => {
    made.length = 0;
  });

  test('never signs with the remembered account, which may be on the other network', async () => {
    const { signPrepared } = await load();
    const s = await signPrepared(prepared, 'testnet');
    expect(s).toEqual({
      accountId: 'elco.testnet',
      publicKey: 'ed25519:new',
      signature: 'sig-new',
    });
    expect(made[0]?.signMessage).not.toHaveBeenCalled();
    expect(made[0]?.connect).toHaveBeenCalledTimes(1);
    expect(made[0]?.connect.mock.calls[0]).toEqual([
      {
        signMessageParams: expect.objectContaining({
          message: prepared.message,
          recipient: prepared.recipient,
        }),
      },
    ]);
  });

  test('asks on the network it was given, with one connector for each', async () => {
    const { signPrepared } = await load();
    await signPrepared(prepared, 'testnet');
    await signPrepared(prepared, 'mainnet');
    await signPrepared(prepared, 'testnet');
    expect(made.map((c) => c.options.network)).toEqual(['testnet', 'mainnet']);
    expect(made[0]?.connect).toHaveBeenCalledTimes(2);
  });

  test('leaves MyNearWallet out of the choice', async () => {
    const { signPrepared } = await load();
    await signPrepared(prepared, 'mainnet');
    expect(made[0]?.options.excludedWallets).toEqual(['mynearwallet']);
  });

  test('a cancelled prompt rejects and leaves no listener behind', async () => {
    const { signPrepared } = await load();
    await signPrepared(prepared, 'testnet');
    const connector = made[0] as FakeConnector;
    connector.reply = 'cancel';
    await expect(signPrepared(prepared, 'testnet')).rejects.toThrow('User rejected');
    expect(connector.listeners.size).toBe(0);
  });

  test('a wallet that signs in without a signed message is an error, not a blank signature', async () => {
    const { signPrepared } = await load();
    await signPrepared(prepared, 'testnet');
    (made[0] as FakeConnector).reply = 'silent';
    await expect(signPrepared(prepared, 'testnet')).rejects.toThrow('no signed message');
  });
});

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
  // What Meteor does when it is already connected: the account it last signed in, ignoring the network.
  signedAs = 'petals.near';
  signMessage = vi.fn(async (_: unknown) => ({
    accountId: this.signedAs,
    publicKey: 'ed25519:stale',
    signature: 'sig-stale',
  }));
  getConnectedWallet = vi.fn(async () => ({ wallet: { signMessage: this.signMessage } }));
  /** the accounts the connected wallet names; none means no wallet is connected on this page */
  accounts: string[] = [];
  wallet = vi.fn(async () => {
    if (this.accounts.length === 0) throw new Error('No accounts found');
    return {
      getAccounts: async () => this.accounts.map((accountId) => ({ accountId })),
      signMessage: this.signMessage,
    };
  });
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

describe('signAs', () => {
  beforeEach(() => {
    made.length = 0;
  });

  async function connected(network: 'testnet' | 'mainnet', accounts: string[]) {
    const w = await load();
    // the connector for the network is made on first use; make it, then say what it holds
    await w.signsInFirst(network, 'nobody');
    const c = made.find((m) => m.options.network === network) as FakeConnector;
    c.accounts = accounts;
    return { w, c };
  }

  test('the wallet connected as that account signs, with no new sign-in', async () => {
    const { w, c } = await connected('mainnet', ['petals.near']);
    const s = await w.signAs(prepared, 'mainnet', 'petals.near');
    expect(s).toEqual({
      accountId: 'petals.near',
      publicKey: 'ed25519:stale',
      signature: 'sig-stale',
    });
    expect(c.connect).not.toHaveBeenCalled();
    expect(c.signMessage.mock.calls[0]?.[0]).toEqual({
      message: prepared.message,
      recipient: prepared.recipient,
      nonce: expect.any(Uint8Array),
      network: 'mainnet',
      signerId: 'petals.near',
    });
  });

  test('with no wallet connected on this page, it signs in and signs together', async () => {
    const { w, c } = await connected('testnet', []);
    const s = await w.signAs(prepared, 'testnet', 'elco.testnet');
    expect(s.accountId).toBe('elco.testnet');
    expect(c.signMessage).not.toHaveBeenCalled();
    expect(c.connect).toHaveBeenCalledTimes(1);
  });

  test('a wallet connected as another account signs in again', async () => {
    const { w, c } = await connected('testnet', ['someone.testnet']);
    await w.signAs(prepared, 'testnet', 'elco.testnet');
    expect(c.signMessage).not.toHaveBeenCalled();
    expect(c.connect).toHaveBeenCalledTimes(1);
  });

  test('a wallet that signs as another account than asked falls back to signing in', async () => {
    const { w, c } = await connected('testnet', ['elco.testnet', 'petals.testnet']);
    c.signedAs = 'petals.testnet';
    const s = await w.signAs(prepared, 'testnet', 'elco.testnet');
    expect(c.signMessage).toHaveBeenCalledTimes(1);
    expect(c.connect).toHaveBeenCalledTimes(1);
    expect(s.accountId).toBe('elco.testnet');
  });

  test('signsInFirst says whether a sign-in comes before the signature', async () => {
    const { w, c } = await connected('mainnet', ['petals.near']);
    expect(await w.signsInFirst('mainnet', 'petals.near')).toBe(false);
    expect(await w.signsInFirst('mainnet', 'elcocoel.near')).toBe(true);
    c.accounts = [];
    expect(await w.signsInFirst('mainnet', 'petals.near')).toBe(true);
    expect(c.connect).not.toHaveBeenCalled();
    expect(c.signMessage).not.toHaveBeenCalled();
  });
});

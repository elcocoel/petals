// Connecting a wallet: the flow, over a fake server and a fake picker.
import { describe, expect, test } from 'vitest';
import type { Challenge, SessionClient } from '../lib/agent-client.ts';
import { doorWords } from '../lib/door-words.ts';
import { NO_EVM_WALLET } from '../lib/evm-wallet.ts';
import { signIn, signInEvm } from '../viewmodels/useSession.ts';

const challenge: Challenge = {
  nonce: 'n',
  message: 'm',
  recipient: 'r',
  expires_at: '2026-11-06T00:05:00Z',
};
const signed = { accountId: 'alice.near', publicKey: 'pk', signature: 'sig' };

function fake(client: Partial<SessionClient> = {}, sign = async () => signed) {
  const said: string[] = [];
  let arrived = 0;
  return {
    said,
    arrivedCount: () => arrived,
    deps: {
      client: {
        me: async () => null,
        challenge: async () => challenge,
        verify: async () => {},
        logout: async () => {},
        ...client,
      },
      sign: sign as never,
      arrived: () => {
        arrived++;
      },
      failed: (words: string) => said.push(words),
    },
  };
}

describe('connecting', () => {
  test('signs the server’s challenge, sends the proof on mainnet, and the page moves on', async () => {
    const sent: unknown[] = [];
    const f = fake({
      verify: async (network, proof) => {
        sent.push(network, proof);
      },
    });
    await signIn(f.deps);
    expect(sent).toEqual([
      'mainnet',
      {
        type: 'nep413',
        account_id: 'alice.near',
        public_key: 'pk',
        signature: 'sig',
        message: 'm',
        nonce: 'n',
        recipient: 'r',
      },
    ]);
    expect(f.arrivedCount()).toBe(1);
    expect(f.said).toEqual([]);
  });

  test('closing the picker is nothing at all', async () => {
    const f = fake({}, async () => {
      throw new Error('closed');
    });
    await signIn(f.deps);
    expect(f.arrivedCount()).toBe(0);
    expect(f.said).toEqual([]);
  });

  test('a signature the server refuses says so, and nothing moves on', async () => {
    const f = fake({
      verify: async () => {
        throw new Error('unauthorised');
      },
    });
    await signIn(f.deps);
    expect(f.arrivedCount()).toBe(0);
    expect(f.said).toEqual([doorWords.badSignature]);
  });
});

describe('an Ethereum wallet at the door', () => {
  test('a no in the wallet is said in its name, never a dead button', async () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const before = { dispatchEvent: g.dispatchEvent, ethereum: g.ethereum };
    g.dispatchEvent = () => true;
    g.ethereum = {
      isMetaMask: true,
      request: async () => {
        throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
      },
    };
    try {
      const said: string[] = [];
      let arrived = false;
      await signInEvm(
        () => {
          arrived = true;
        },
        (w) => said.push(w),
      );
      expect(arrived).toBe(false);
      expect(said).toEqual([doorWords.declined('MetaMask')]);
    } finally {
      g.dispatchEvent = before.dispatchEvent;
      g.ethereum = before.ethereum;
    }
  });

  test('with no wallet, it says so', async () => {
    const said: string[] = [];
    await signInEvm(
      () => {},
      (w) => said.push(w),
    );
    expect(said).toEqual([NO_EVM_WALLET]);
  });
});

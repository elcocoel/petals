// readTransfer and nearUsd: a NEAR transfer read back from the chain, and NEAR's price from NEAR
// Intents. Faked HTTP only; the journey server walks a real testnet transfer.
import { describe, expect, test } from 'vitest';
import { nearUsd, readTransfer, yoctoToNear } from '../src/pay/index.ts';

const HASH = '6zgh2u9DqHHiXzdy9ouTP7oGky2T4nugqzqt9wJZwNFm';

function rpc(answer: unknown) {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const fetch = (async (url: unknown, init?: RequestInit) => {
    sent.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(answer));
  }) as typeof globalThis.fetch;
  return { fetch, sent };
}

describe('readTransfer', () => {
  test('asks for the FINAL outcome, and sums the Transfer actions', async () => {
    const r = rpc({
      result: {
        status: { SuccessValue: '' },
        transaction: {
          hash: HASH,
          signer_id: 'alice.near',
          receiver_id: 'petals.near',
          actions: [
            { Transfer: { deposit: `2${'0'.repeat(24)}` } },
            'CreateAccount',
            { Transfer: { deposit: '5' } },
          ],
        },
      },
    });
    const t = await readTransfer('mainnet', HASH, 'alice.near', { fetch: r.fetch });
    expect(t).toEqual({
      tx_hash: HASH,
      signer_id: 'alice.near',
      receiver_id: 'petals.near',
      yocto: `2${'0'.repeat(23)}5`,
      succeeded: true,
      methods: [],
    });
    expect(r.sent[0]?.url).toBe('https://rpc.mainnet.fastnear.com');
    expect(r.sent[0]?.body).toMatchObject({
      method: 'tx',
      params: { tx_hash: HASH, sender_account_id: 'alice.near', wait_until: 'FINAL' },
    });
  });

  test('a function call’s NEAR counts too, with the method it named (the credit contract’s deposit)', async () => {
    const r = rpc({
      result: {
        status: { SuccessValue: '' },
        transaction: {
          hash: HASH,
          signer_id: 'alice.near',
          receiver_id: 'credit.petals.near',
          actions: [{ FunctionCall: { method_name: 'deposit', deposit: `3${'0'.repeat(23)}` } }],
        },
      },
    });
    const t = await readTransfer('mainnet', HASH, 'alice.near', { fetch: r.fetch });
    expect(t).toMatchObject({
      receiver_id: 'credit.petals.near',
      yocto: `3${'0'.repeat(23)}`,
      methods: ['deposit'],
    });
  });

  test('a failed transaction is read as not succeeded', async () => {
    const r = rpc({
      result: {
        status: { Failure: { ActionError: {} } },
        transaction: { hash: HASH, signer_id: 'a.near', receiver_id: 'petals.near', actions: [] },
      },
    });
    expect((await readTransfer('testnet', HASH, 'a.near', { fetch: r.fetch })).succeeded).toBe(
      false,
    );
    expect(r.sent[0]?.url).toBe('https://rpc.testnet.fastnear.com');
  });

  test('an unknown or never-seen transaction is not_found; a bad hash is bad_input', async () => {
    for (const name of ['UNKNOWN_TRANSACTION', 'TIMEOUT_ERROR']) {
      const r = rpc({ error: { name: 'HANDLER_ERROR', cause: { name } } });
      await expect(
        readTransfer('mainnet', HASH, 'a.near', { fetch: r.fetch }),
      ).rejects.toMatchObject({
        code: 'not_found',
      });
    }
    await expect(
      readTransfer('mainnet', 'nope', 'a.near', { fetch: rpc({}).fetch }),
    ).rejects.toMatchObject({
      code: 'bad_input',
    });
  });

  test('NEAR in yocto to NEAR', () => {
    expect(yoctoToNear(`1${'0'.repeat(24)}`)).toBe(1);
    expect(yoctoToNear(`25${'0'.repeat(22)}`)).toBe(0.25);
  });
});

describe('nearUsd', () => {
  const list = (price: unknown) =>
    (async () =>
      new Response(
        JSON.stringify([
          { assetId: 'nep141:usdc.near', price: 1 },
          { assetId: 'nep141:wrap.near', price },
        ]),
      )) as unknown as typeof fetch;

  test("wrapped NEAR's price from NEAR Intents' token list", async () => {
    expect(await nearUsd({ fetch: list(3.61) })).toBe(3.61);
  });

  test('null, with a warning, when there is no good price', async () => {
    const warned: string[] = [];
    expect(await nearUsd({ fetch: list(null), onWarning: (m) => warned.push(m) })).toBeNull();
    const down = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await nearUsd({ fetch: down, onWarning: (m) => warned.push(m) })).toBeNull();
    expect(warned).toHaveLength(2);
  });
});

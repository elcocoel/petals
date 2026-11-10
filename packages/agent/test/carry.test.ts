// Carry forward on the credit contract (Elco's choice, 10 Nov): the contract can only charge, so what lands on
// a person's credit between two chats (NEAR AI's correction, a base fee, a tip) rides on the next charge on
// chain: owed is charged with it, owed back takes from it. A stand-in chain; the real one is the testnet
// rehearsal.
import { join } from 'node:path';
import { openStore, type Store } from '@petal/store';
import { describe, expect, test } from 'vitest';
import { type CreditChain, chainChat, owedOf } from '../src/credit.ts';
import { personCredit } from '../src/invites.ts';
import { tmpRoot } from './helpers.ts';

const NEAR = 10n ** 24n;
const PRICE = 2; // dollars a NEAR, so 1 NEAR is $2
const ACCOUNT = 'alice.near';

function stand(start: bigint) {
  let balance = start;
  const charges: bigint[] = [];
  const chain: CreditChain = {
    contract: { network: 'mainnet', contract: 'credit.petals.near', chargerKeyFile: '/nowhere' },
    balanceOf: async () => balance,
    charge: async (_a, y) => {
      const charged = y < balance ? y : balance;
      balance -= charged;
      charges.push(y);
      return { charged, tx_hash: 'tx' };
    },
  };
  return { chain, charges, balance: () => balance };
}

const usdIn = (yocto: bigint) => (Number(yocto) / 1e24) * PRICE;
let n = 0;
const at = () => new Date(Date.UTC(2026, 10, 10, 20, 0, n++));

async function apply(store: Store, delta: number, reason: string) {
  await store.credit.apply({
    id: `e${n}`,
    account_key: 'person:prs_a',
    delta_usd: delta,
    reason,
    at: at().toISOString(),
  });
}

describe('carry forward on the contract', () => {
  test('a correction given back and a tip owed ride on the next charges, and nothing is lost', async () => {
    const store = openStore(join(tmpRoot(), 'private.db'));
    await store.person.create({ id: 'prs_a', created_at: '2026-11-10T00:00:00.000Z' });
    const s = stand(NEAR); // $2 in the contract
    // chat 1 costs $0.01: charged on chain at its end
    let chat = await chainChat(store, s.chain, 'prs_a', ACCOUNT, PRICE, at);
    expect(chat.credit.left_usd).toBeCloseTo(2, 9);
    await apply(store, -0.01, 'model call');
    await chat.settle(0.01);
    expect(usdIn(s.charges[0] as bigint)).toBeCloseTo(0.01, 9);
    // NEAR AI billed $0.006 less, and the person tips $0.001: both land between chats
    await apply(store, 0.006, "reconciled with NEAR AI's bill");
    await apply(store, -0.001, 'Tip to Petals (price abc)');
    // chat 2: they're owed back $0.005, so its $0.003 is taken from that and nothing is charged
    chat = await chainChat(store, s.chain, 'prs_a', ACCOUNT, PRICE, at);
    expect(await owedOf(store, 'prs_a')).toBeCloseTo(-0.005, 9);
    expect(chat.credit.left_usd).toBeCloseTo(1.99, 9);
    await apply(store, -0.003, 'model call');
    await chat.settle(0.003);
    expect(s.charges).toHaveLength(1);
    expect(await owedOf(store, 'prs_a')).toBeCloseTo(-0.002, 9);
    // chat 3 costs $0.01: $0.008 is charged, and nothing is owed after
    chat = await chainChat(store, s.chain, 'prs_a', ACCOUNT, PRICE, at);
    await apply(store, -0.01, 'model call');
    await chat.settle(0.01);
    expect(usdIn(s.charges[1] as bigint)).toBeCloseTo(0.008, 9);
    expect(await owedOf(store, 'prs_a')).toBeCloseTo(0, 9);
    // all told the chain took $0.018: $0.023 of calls, less the $0.006 back, plus the $0.001 tip
    expect(usdIn(NEAR - s.balance())).toBeCloseTo(0.018, 9);
    // and what they see is the contract's balance
    chat = await chainChat(store, s.chain, 'prs_a', ACCOUNT, PRICE, at);
    expect((await personCredit(store, 'prs_a'))?.left_usd).toBeCloseTo(2 - 0.018, 9);
    await store.close();
  });

  test('what they owe is held back from what they can spend, and charged with the next chat', async () => {
    const store = openStore(join(tmpRoot(), 'private.db'));
    await store.person.create({ id: 'prs_a', created_at: '2026-11-10T00:00:00.000Z' });
    const s = stand(NEAR);
    let chat = await chainChat(store, s.chain, 'prs_a', ACCOUNT, PRICE, at);
    await chat.settle(0);
    // a base fee lands between chats
    await apply(store, -0.004, 'Petals base fee (call, price abc)');
    chat = await chainChat(store, s.chain, 'prs_a', ACCOUNT, PRICE, at);
    expect(chat.credit.left_usd).toBeCloseTo(2 - 0.004, 9);
    await chat.settle(0.01);
    expect(usdIn(s.charges[0] as bigint)).toBeCloseTo(0.014, 9);
    expect(await owedOf(store, 'prs_a')).toBeCloseTo(0, 9);
    await store.close();
  });
});

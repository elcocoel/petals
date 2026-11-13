// The testnet rehearsal of the credit contract with usage records and carry forward. Real testnet calls: the
// person deposits, each chat is charged by the server's charge-only key, what NEAR AI bills differently and a
// tip ride on the next charge, and the person withdraws what's left. The model is a script and NEAR AI's billing a stand-in, so nothing is
// spent but testnet NEAR. Run from build/:
//   node scripts/rehearse-credit.ts --person-key /path/to/keys/petals-paytest.testnet.json \
//     --charger-key /path/to/keys/petals-charger.testnet.charge-only.json [--contract petals-credit.testnet]
import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chainChat, creditFrom, owedOf } from '@petal/agent';
import { callAsAccount, creditBalance, yoctoToUsd } from '@petal/near/pay';
import { openStore, type Store } from '@petal/store';

const NEAR = 10n ** 24n;
/** dollars a NEAR for the rehearsal: a round number, so every figure can be checked by hand */
const PRICE = 2;
const usd = (n: number) => Math.round(n * 1e9) / 1e9;

async function call(
  keyFile: string,
  contract: string,
  method: string,
  args: object,
  deposit: bigint,
) {
  return (await callAsAccount('testnet', contract, keyFile, method, args, deposit)).tx_hash;
}

let tick = 0;
const at = () => new Date(Date.now() + tick++ * 1000);

async function entry(store: Store, person: string, delta: number, reason: string) {
  await store.credit.apply({
    id: `rehearsal:${tick}`,
    account_key: `person:${person}`,
    delta_usd: delta,
    reason,
    at: at().toISOString(),
  });
}

export async function rehearse(args: string[]): Promise<string[]> {
  const { values } = parseArgs({
    args,
    options: {
      'person-key': { type: 'string' },
      'charger-key': { type: 'string' },
      contract: { type: 'string', default: 'petals-credit.testnet' },
    },
  });
  const contract = values.contract as string;
  if (!values['person-key'] || !values['charger-key']) {
    throw new Error(
      'usage: --person-key <file> --charger-key <file> [--contract <testnet contract>]',
    );
  }
  const chain = creditFrom(
    { PETAL_CREDIT_CONTRACT: contract, PETAL_CHARGER_KEY_FILE: values['charger-key'] },
    { public: false },
  );
  if (!chain || chain.contract.network !== 'testnet')
    throw new Error('the rehearsal runs on testnet only');
  const keyFile = values['person-key'];
  const who = {
    id: (JSON.parse(await readFile(keyFile, 'utf8')) as { account_id: string }).account_id,
  };
  const log: string[] = [];
  const say = (s: string) => {
    log.push(s);
    console.log(s);
  };
  const store = openStore(join(mkdtempSync(join(tmpdir(), 'petal-rehearsal-')), 'private.db'));
  const person = 'prs_rehearsal';
  await store.person.create({ id: person, created_at: new Date().toISOString() });
  const held = async () => creditBalance('testnet', contract, who.id);
  try {
    const before = await held();
    // 1. the person deposits 0.05 NEAR ($0.10 at the rehearsal's price)
    const dep = await call(keyFile, contract, 'deposit', {}, NEAR / 20n);
    const start = await held();
    say(
      `deposit 0.05 NEAR: tx ${dep}; held ${yoctoToUsd(before, PRICE)} → $${yoctoToUsd(start, PRICE)}`,
    );

    // 2. chat 1: two calls at $0.01 each, charged on chain at its end
    let chat = await chainChat(store, chain, person, who.id, PRICE, at);
    say(`chat 1 starts: credit $${usd(chat.credit.left_usd)}`);
    await entry(store, person, -0.01, 'model call');
    await entry(store, person, -0.01, 'model call');
    await chat.settle(0.02);
    const after1 = await held();
    say(`chat 1 charged on chain: $${usd(yoctoToUsd(start - after1, PRICE))} (expected $0.02)`);

    // 3. NEAR AI bills $0.004 for each call, so $0.012 goes back; and the person's tip, 10% of the bills
    await entry(store, person, 0.006, "reconciled with NEAR AI's bill");
    await entry(store, person, 0.006, "reconciled with NEAR AI's bill");
    await entry(store, person, -0.0008, 'Tip to Petals (rehearsal)');

    // 4. chat 2 costs $0.004: they're owed back $0.0112, so nothing is charged
    chat = await chainChat(store, chain, person, who.id, PRICE, at);
    say(
      `chat 2 starts: owed $${usd(await owedOf(store, person))} (expected -0.0112), credit $${usd(chat.credit.left_usd)}`,
    );
    await entry(store, person, -0.004, 'model call');
    await chat.settle(0.004);
    const after2 = await held();
    say(
      `chat 2 charged on chain: $${usd(yoctoToUsd(after1 - after2, PRICE))} (expected $0); owed $${usd(await owedOf(store, person))} (expected -0.0072)`,
    );

    // 5. chat 3 costs $0.02: $0.0128 is charged, and nothing is owed after
    chat = await chainChat(store, chain, person, who.id, PRICE, at);
    await entry(store, person, -0.02, 'model call');
    await chat.settle(0.02);
    const after3 = await held();
    say(
      `chat 3 charged on chain: $${usd(yoctoToUsd(after2 - after3, PRICE))} (expected $0.0128); owed $${usd(await owedOf(store, person))} (expected 0)`,
    );
    say(
      `all told the chain took $${usd(yoctoToUsd(start - after3, PRICE))}: $0.044 of calls, less $0.012 back, plus the $0.0008 tip = $0.0328 expected`,
    );

    // 6. the person withdraws what's left
    const wd = await call(keyFile, contract, 'withdraw', {}, 1n);
    say(`withdraw: tx ${wd}; held after $${yoctoToUsd(await held(), PRICE)} (expected $0)`);
  } finally {
    await store.close();
  }
  return log;
}

if (import.meta.main) {
  try {
    await rehearse(process.argv.slice(2));
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  }
}

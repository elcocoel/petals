// Sets up Petals' credit contract (9 Nov; specs/003-target/proposal-payment.md, section 6), for Elco to run.
//
//   node packages/near/scripts/credit-setup.ts
//       mainnet: opens a page on http://127.0.0.1:3189 where petals.near's own wallet approves two
//       transactions, then does the rest by itself
//   node packages/near/scripts/credit-setup.ts --network testnet --owner <account> --owner-key-file <file>
//       a rehearsal on testnet, signed with that account's key file instead of a wallet
//
// What it makes, under the owner (petals.near):
//   credit.<owner>   the contract (packages/near/contract), owner <owner>, charger charger.<owner>
//   charger.<owner>  Petals' server's account, with one key that can call `charge` and nothing else
//
// The owner's wallet key is the only full-access key either account keeps. The script makes a temporary key
// for each, uses it to deploy, set up and add the charge-only key, then deletes it. The charge-only key is
// the one thing it writes, to ../.secrets/charger.<owner>.charge-only.json, for the server. No key is printed.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Account, actions, JsonRpcProvider, KeyPair, KeyPairSigner } from 'near-api-js';
import { RPC_URLS } from '../src/network.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WASM = join(HERE, '..', 'contract', 'target', 'near', 'petals_credit.wasm');
/** The build that was walked on testnet (credit.petals-paytest.testnet). */
const WASM_SHA256 = 'f60842cc58b91d011c104a1c655be5861de0966f3a0f4d0c506bbf640ada3eb2';
const SECRETS = join(HERE, '..', '..', '..', '..', '.secrets');
const PORT = 3189;
const NEAR = 10n ** 24n;
/**
 * The contract's account: about 1.213 NEAR of storage, more while it holds the temporary key, plus what
 * deploying and `new` burn. 1.25 fell short by 0.0003 in the testnet rehearsal.
 */
const CREDIT_NEAR = (13n * NEAR) / 10n;
/** The server's account: a little storage, and gas for about 1,400 charges at 0.00018 NEAR each. */
const CHARGER_NEAR = (3n * NEAR) / 10n;
const ALLOWANCE = (25n * NEAR) / 100n;
/** Both, plus the fees of the owner's two transactions. */
const NEEDED = CREDIT_NEAR + CHARGER_NEAR + NEAR / 100n;

const { values } = parseArgs({
  options: {
    network: { type: 'string', default: 'mainnet' },
    owner: { type: 'string' },
    'owner-key-file': { type: 'string' },
  },
});
const network = values.network === 'testnet' ? 'testnet' : 'mainnet';
const owner = values.owner ?? (network === 'mainnet' ? 'petals.near' : '');
if (!owner) throw new Error('--owner is needed on testnet');
const CREDIT = `credit.${owner}`;
const CHARGER = `charger.${owner}`;
const keyOut = join(SECRETS, `charger.${owner}.charge-only.json`);
const provider = new JsonRpcProvider({ url: RPC_URLS[network] });
const nearOf = (y: bigint) => (Number(y / 10n ** 18n) / 1e6).toString();

async function balanceOf(account: string): Promise<bigint | null> {
  try {
    const r = (await provider.query({
      request_type: 'view_account',
      finality: 'final',
      account_id: account,
    })) as unknown as { amount: string };
    return BigInt(r.amount);
  } catch {
    return null;
  }
}
async function keysOf(account: string) {
  const r = (await provider.query({
    request_type: 'view_access_key_list',
    finality: 'final',
    account_id: account,
  })) as unknown as { keys: { public_key: string; access_key: { permission: unknown } }[] };
  return r.keys;
}
const fail = (m: string): never => {
  console.error(`credit-setup: ${m}`);
  process.exit(1);
};

// -- before anything moves
if (!existsSync(WASM)) {
  fail(
    `no contract build at ${WASM}. Build it first: cd packages/near/contract && cargo near build non-reproducible-wasm --locked`,
  );
}
const wasm = readFileSync(WASM);
const sha = createHash('sha256').update(wasm).digest('hex');
if (sha !== WASM_SHA256)
  fail(`the build's sha256 is ${sha}, not the one walked on testnet (${WASM_SHA256}).`);
if ((await balanceOf(CREDIT)) !== null) fail(`${CREDIT} exists already.`);
if ((await balanceOf(CHARGER)) !== null) fail(`${CHARGER} exists already.`);
if (existsSync(keyOut)) fail(`${keyOut} exists already.`);
const has = await balanceOf(owner);
if (has === null) fail(`${owner} doesn't exist on ${network}.`);
if ((has as bigint) < NEEDED) {
  fail(
    `${owner} holds ${nearOf(has as bigint)} NEAR; this needs ${nearOf(NEEDED)} (${nearOf(CREDIT_NEAR)} to ${CREDIT}, ${nearOf(CHARGER_NEAR)} to ${CHARGER}, and fees).`,
  );
}

const tempCredit = KeyPair.fromRandom('ed25519');
const tempCharger = KeyPair.fromRandom('ed25519');
const chargeOnly = KeyPair.fromRandom('ed25519');

/** The owner's two transactions: each makes an account with the owner's key and a temporary one. */
function creations(ownerKey: string) {
  const make = (account: string, near: bigint, temp: KeyPair) => ({
    receiverId: account,
    actions: [
      { type: 'CreateAccount' },
      { type: 'Transfer', params: { deposit: near.toString() } },
      { type: 'AddKey', params: { publicKey: ownerKey, accessKey: { permission: 'FullAccess' } } },
      {
        type: 'AddKey',
        params: {
          publicKey: temp.getPublicKey().toString(),
          accessKey: { permission: 'FullAccess' },
        },
      },
    ],
  });
  return [make(CREDIT, CREDIT_NEAR, tempCredit), make(CHARGER, CHARGER_NEAR, tempCharger)];
}

/** Everything after the two accounts exist, with the temporary keys, which it deletes at the end. */
async function finish(ownerKey: string): Promise<string> {
  for (const [account, temp] of [
    [CREDIT, tempCredit],
    [CHARGER, tempCharger],
  ] as const) {
    const keys = (await keysOf(account)).map((k) => k.public_key);
    if (!keys.includes(ownerKey) || !keys.includes(temp.getPublicKey().toString())) {
      fail(`${account} doesn't hold the keys it should: ${keys.join(', ')}`);
    }
  }
  const as = (account: string, k: KeyPair) => new Account(account, provider, new KeyPairSigner(k));
  const send = async (
    who: Account,
    receiverId: string,
    list: ReturnType<typeof actions.transfer>[],
  ) => {
    const out = (await who.signAndSendTransaction({
      receiverId,
      actions: list,
      waitUntil: 'FINAL',
      throwOnFailure: false,
    })) as unknown as { transaction: { hash: string }; status: unknown };
    if (!(out.status && typeof out.status === 'object' && 'SuccessValue' in out.status)) {
      fail(
        `a transaction to ${receiverId} failed (${out.transaction.hash}): ${JSON.stringify(out.status)}`,
      );
    }
    return out.transaction.hash;
  };
  const credit = as(CREDIT, tempCredit);
  console.log(`credit-setup: deploying the contract to ${CREDIT}`);
  await send(credit, CREDIT, [
    actions.deployContract(new Uint8Array(wasm)),
    actions.functionCall('new', { owner, charger: CHARGER }, 30_000_000_000_000n, 0n),
  ]);
  const charger = as(CHARGER, tempCharger);
  console.log(`credit-setup: giving ${CHARGER} its charge-only key`);
  writeFileSync(
    keyOut,
    JSON.stringify({
      account_id: CHARGER,
      public_key: chargeOnly.getPublicKey().toString(),
      private_key: chargeOnly.toString(),
    }),
    { mode: 0o600 },
  );
  await send(charger, CHARGER, [
    actions.addFunctionCallAccessKey(chargeOnly.getPublicKey(), CREDIT, ['charge'], ALLOWANCE),
  ]);
  console.log('credit-setup: deleting the temporary keys');
  await send(credit, CREDIT, [actions.deleteKey(tempCredit.getPublicKey())]);
  await send(charger, CHARGER, [actions.deleteKey(tempCharger.getPublicKey())]);

  // what is there now
  const config = await provider.callFunction({ contractId: CREDIT, method: 'config', args: {} });
  const creditKeys = (await keysOf(CREDIT)).map((k) => k.public_key);
  const chargerKeys = await keysOf(CHARGER);
  const onlyOwner = creditKeys.length === 1 && creditKeys[0] === ownerKey;
  const chargeKey = chargerKeys.find((k) => k.public_key === chargeOnly.getPublicKey().toString());
  const lines = [
    `Done on ${network}.`,
    `${CREDIT}: the contract (sha256 ${sha}), config ${JSON.stringify(config)}; its one key is ${owner}'s: ${onlyOwner ? 'yes' : `NO: ${creditKeys.join(', ')}`}`,
    `${CHARGER}: ${chargerKeys.length} keys, ${owner}'s and one that ${chargeKey ? `can only call ${JSON.stringify(chargeKey.access_key.permission)}` : 'IS MISSING'}`,
    `For the server: PETAL_CREDIT_CONTRACT=${CREDIT} PETAL_CHARGER_KEY_FILE=${keyOut}`,
  ];
  return lines.join('\n');
}

// -- a rehearsal: the owner's key file signs
if (values['owner-key-file']) {
  const k = JSON.parse(readFileSync(values['owner-key-file'], 'utf8')) as {
    account_id: string;
    private_key: string;
  };
  if (k.account_id !== owner)
    fail(`${values['owner-key-file']} is ${k.account_id}'s key, not ${owner}'s`);
  const kp = KeyPair.fromString(k.private_key as `ed25519:${string}`);
  const ownerKey = kp.getPublicKey().toString();
  const me = new Account(owner, provider, new KeyPairSigner(kp));
  for (const [account, near, temp] of [
    [CREDIT, CREDIT_NEAR, tempCredit],
    [CHARGER, CHARGER_NEAR, tempCharger],
  ] as const) {
    console.log(`credit-setup: creating ${account}`);
    await me.signAndSendTransaction({
      receiverId: account,
      actions: [
        actions.createAccount(),
        actions.transfer(near),
        actions.addFullAccessKey(kp.getPublicKey()),
        actions.addFullAccessKey(temp.getPublicKey()),
      ],
      waitUntil: 'FINAL',
    });
  }
  console.log(await finish(ownerKey));
  process.exit(0);
}

// -- mainnet: the owner's own wallet signs, in a page on this machine
const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Petals credit setup</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;background:#fff;color:#111}
button{font:inherit;padding:8px 16px}pre{white-space:pre-wrap;background:#f4f4f4;padding:12px}</style></head>
<body><h1>Petals' credit contract</h1>
<p>Connect <b>${owner}</b>'s wallet. It asks you to approve two transactions: one makes <b>${CREDIT}</b> with ${nearOf(CREDIT_NEAR)} NEAR, the other <b>${CHARGER}</b> with ${nearOf(CHARGER_NEAR)} NEAR. Your wallet's key is the only key either keeps. The script in your terminal does the rest.</p>
<button id="go">Connect ${owner}</button>
<pre id="log"></pre>
<script type="module">
import { NearConnector } from 'https://esm.sh/@hot-labs/near-connect@0.12.0';
const log = (m) => { document.getElementById('log').textContent += m + '\\n'; };
const post = async (path, body) => {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const out = await r.json();
  if (!r.ok) throw new Error(out.error);
  return out;
};
document.getElementById('go').onclick = async () => {
  try {
    const connector = new NearConnector({ network: ${JSON.stringify(network)} });
    await connector.connect();
    const wallet = await connector.wallet();
    const [account] = await wallet.getAccounts();
    if (account?.accountId !== ${JSON.stringify(owner)}) throw new Error('signed in as ' + account?.accountId + ', not ${owner}');
    let publicKey = account.publicKey;
    if (!publicKey) {
      const signed = await wallet.signMessage({ message: 'Petals credit setup: which key is yours', recipient: '127.0.0.1', nonce: crypto.getRandomValues(new Uint8Array(32)) });
      publicKey = signed.publicKey;
    }
    const { transactions } = await post('/transactions', { publicKey });
    const hashes = [];
    for (const t of transactions) {
      log('Approve: ' + t.receiverId);
      const out = await wallet.signAndSendTransaction({ ...t, network: ${JSON.stringify(network)} });
      hashes.push(out.transaction.hash);
      log('Made ' + t.receiverId + ': ' + out.transaction.hash);
    }
    log('The script is deploying and setting up now.');
    log((await post('/created', { publicKey, hashes })).message);
  } catch (e) {
    log('Stopped: ' + (e && e.message ? e.message : e));
  }
};
</script></body></html>`;

let ownerKey: string | null = null;
const server = createServer((req, res) => {
  const answer = (status: number, body: unknown, type = 'application/json') => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  if (req.method === 'GET' && req.url === '/') return answer(200, PAGE, 'text/html; charset=utf-8');
  let raw = '';
  req.on('data', (c) => {
    raw += c;
  });
  req.on('end', async () => {
    try {
      const body = JSON.parse(raw || '{}') as { publicKey?: string };
      if (req.method === 'POST' && req.url === '/transactions') {
        if (!body.publicKey?.startsWith('ed25519:'))
          return answer(400, { error: 'no ed25519 key from the wallet' });
        ownerKey = body.publicKey;
        return answer(200, { transactions: creations(ownerKey) });
      }
      if (
        req.method === 'POST' &&
        req.url === '/created' &&
        ownerKey &&
        body.publicKey === ownerKey
      ) {
        const message = await finish(ownerKey);
        console.log(message);
        answer(200, { message });
        server.close();
        return;
      }
      answer(404, { error: 'not here' });
    } catch (e) {
      answer(500, { error: (e as Error).message });
    }
  });
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(
    `credit-setup: ${owner} holds ${nearOf(has as bigint)} NEAR; this uses about ${nearOf(NEEDED)}.`,
  );
  console.log(
    `credit-setup: open http://127.0.0.1:${PORT} in the browser that holds ${owner}'s wallet.`,
  );
});

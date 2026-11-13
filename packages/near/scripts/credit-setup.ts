// Sets up Petals' credit contract (specs/003-target/proposal-payment.md, section 6), for the operator to run.
//
//   node packages/near/scripts/credit-setup.ts [--network testnet]
//       opens a page on http://127.0.0.1:3189 where the owner's own wallet approves one plain transfer,
//       then does the rest by itself
//   node packages/near/scripts/credit-setup.ts --network testnet --owner <account> --owner-key-file <file>
//       --credit <name> --charger <name>
//       a rehearsal, with that account's key file making the transfer instead of a wallet
//
// The wallet is asked for one thing only: a plain NEAR transfer to a new account this script made on this
// machine. Wallets refuse to give a site a full-access key (Meteor does), and nobody has checked whether
// they sign a contract deploy for one, so the deploy happens here. From that account the script:
//   1. makes the contract's account and the charger's, through NEAR's own name registrar;
//   2. deploys the contract (packages/near/contract), sets it up (owner, charger), and deletes its last
//      key: nobody can change it after, and people can always withdraw;
//   3. gives the charger one key that can call `charge` and nothing else (written to the .secrets folder, never
//      printed), and the owner's own wallet key, then deletes its own;
//   4. deletes the account it was paid into, so what's left goes back to the owner.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Account, actions, JsonRpcProvider, KeyPair, KeyPairSigner, PublicKey } from 'near-api-js';
import { RPC_URLS } from '../src/network.ts';
import { readTransfer } from '../src/pay/transfer.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WASM = join(HERE, '..', 'contract', 'target', 'near', 'petals_credit.wasm');
/** The build that was walked on testnet (credit.petals-paytest.testnet). */
const WASM_SHA256 = 'f60842cc58b91d011c104a1c655be5861de0966f3a0f4d0c506bbf640ada3eb2';
const SECRETS = join(HERE, '..', '..', '..', '..', '.secrets');
const PORT = 3189;
const NEAR = 10n ** 24n;
/** The contract's account: about 1.211 NEAR of storage for its code and state, plus deploy and set-up gas. */
const CREDIT_NEAR = (13n * NEAR) / 10n;
/** The charger's account: a little storage, and gas for about 1,400 charges at 0.00018 NEAR each. */
const CHARGER_NEAR = (3n * NEAR) / 10n;
const ALLOWANCE = (25n * NEAR) / 100n;
/**
 * Both, plus the gas the script's transactions hold up front (0.03 NEAR each at testnet's price, most of it
 * refunded); what's left comes back. 0.02 fell short in the first testnet rehearsal.
 */
const SENT = CREDIT_NEAR + CHARGER_NEAR + NEAR / 10n;
const GAS = 30_000_000_000_000n;

const { values } = parseArgs({
  options: {
    network: { type: 'string', default: 'mainnet' },
    owner: { type: 'string' },
    'owner-key-file': { type: 'string' },
    credit: { type: 'string' },
    charger: { type: 'string' },
  },
});
const network = values.network === 'testnet' ? 'testnet' : 'mainnet';
/** NEAR's name registrar: it makes `<name>.near` (or `.testnet`) for whoever pays its storage. */
const REGISTRAR = network === 'mainnet' ? 'near' : 'testnet';
const owner = values.owner ?? (network === 'mainnet' ? 'petals.near' : 'petals.testnet');
const CREDIT = values.credit ?? `petals-credit.${REGISTRAR}`;
const CHARGER = values.charger ?? `petals-charger.${REGISTRAR}`;
for (const name of [CREDIT, CHARGER]) {
  if (!name.endsWith(`.${REGISTRAR}`) || name.slice(0, -REGISTRAR.length - 1).includes('.')) {
    throw new Error(`${name} must be a name the registrar makes: <name>.${REGISTRAR}`);
  }
}
const keyOut = join(SECRETS, `${CHARGER}.charge-only.json`);
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
/**
 * The keys this run makes, kept in the .secrets folder until it ends, so a run that stops halfway (a network
 * failure, a closed terminal) picks up where it stopped instead of stranding the NEAR it was sent. Deleted
 * once everything is done.
 */
const STATE = join(SECRETS, `credit-setup.${network}.${CREDIT}.json`);
interface State {
  funder: string;
  tempCredit: string;
  tempCharger: string;
  chargeOnly: string;
  /** the owner's wallet key, once the transfer is made */
  ownerKey?: string;
}
const resuming = existsSync(STATE);
const state: State = resuming
  ? (JSON.parse(readFileSync(STATE, 'utf8')) as State)
  : {
      funder: KeyPair.fromRandom('ed25519').toString(),
      tempCredit: KeyPair.fromRandom('ed25519').toString(),
      tempCharger: KeyPair.fromRandom('ed25519').toString(),
      chargeOnly: KeyPair.fromRandom('ed25519').toString(),
    };
const save = () => writeFileSync(STATE, JSON.stringify(state), { mode: 0o600 });
const pair = (k: string) => KeyPair.fromString(k as `ed25519:${string}`);
const funder = pair(state.funder);
const FUNDER = Buffer.from(funder.getPublicKey().data).toString('hex');
const tempCredit = pair(state.tempCredit);
const tempCharger = pair(state.tempCharger);
const chargeOnly = pair(state.chargeOnly);

const has = await balanceOf(owner);
if (has === null) fail(`${owner} doesn't exist on ${network}.`);
if (resuming) {
  console.log(`credit-setup: picking up the run that stopped (${STATE}).`);
} else {
  if ((await balanceOf(CREDIT)) !== null) fail(`${CREDIT} exists already.`);
  if ((await balanceOf(CHARGER)) !== null) fail(`${CHARGER} exists already.`);
  if (existsSync(keyOut)) fail(`${keyOut} exists already.`);
  if ((has as bigint) < SENT) {
    fail(
      `${owner} holds ${nearOf(has as bigint)} NEAR; this sends ${nearOf(SENT)} and gives back what's left.`,
    );
  }
  save();
}

const as = (account: string, k: KeyPair) => new Account(account, provider, new KeyPairSigner(k));
async function send(
  who: Account,
  receiverId: string,
  list: ReturnType<typeof actions.transfer>[],
  o: { gone?: string } = {},
) {
  const out = (await who.signAndSendTransaction({
    receiverId,
    actions: list,
    waitUntil: 'FINAL',
    throwOnFailure: false,
  })) as unknown as {
    transaction: { hash: string };
    status: unknown;
    receipts_outcome?: { outcome: { status: unknown } }[];
  };
  const failed = (out.receipts_outcome ?? []).find(
    (r) =>
      r.outcome.status && typeof r.outcome.status === 'object' && 'Failure' in r.outcome.status,
  );
  const ok = out.status && typeof out.status === 'object' && 'SuccessValue' in out.status;
  // Deleting an account: NEAR then sends its gas refund to the account that's just gone, and that receipt
  // fails with AccountDoesNotExist. That's how a delete ends, not a failure: gone is done (seen on a testnet run).
  if (o.gone && (await balanceOf(o.gone)) === null) return out.transaction.hash;
  if (!ok || failed) {
    fail(
      `a transaction to ${receiverId} failed (${out.transaction.hash}): ${JSON.stringify(failed?.outcome.status ?? out.status)}`,
    );
  }
  return out.transaction.hash;
}

const hasKey = async (account: string, k: KeyPair) =>
  (await keysOf(account)).some((x) => x.public_key === k.getPublicKey().toString());
async function hasCode(account: string): Promise<boolean> {
  try {
    await provider.query({ request_type: 'view_code', finality: 'final', account_id: account });
    return true;
  } catch {
    return false;
  }
}

/** Everything after the owner's one transfer to FUNDER has landed. Each step is skipped once done. */
async function finish(ownerKey: string): Promise<string> {
  state.ownerKey = ownerKey;
  save();
  const f = as(FUNDER, funder);
  for (const [account, near, temp] of [
    [CREDIT, CREDIT_NEAR, tempCredit],
    [CHARGER, CHARGER_NEAR, tempCharger],
  ] as const) {
    if ((await balanceOf(account)) !== null) continue;
    const paid = await balanceOf(FUNDER);
    if (paid === null || paid < near)
      fail(`${FUNDER} holds ${paid ?? 0} yoctoNEAR, too little to make ${account}.`);
    console.log(`credit-setup: making ${account}`);
    await send(f, REGISTRAR, [
      actions.functionCall(
        'create_account',
        { new_account_id: account, new_public_key: temp.getPublicKey().toString() },
        GAS,
        near,
      ),
    ]);
    if ((await balanceOf(account)) === null) {
      fail(`the registrar didn't make ${account}; what was sent for it came back to ${FUNDER}.`);
    }
  }
  if (!(await hasCode(CREDIT))) {
    console.log(`credit-setup: deploying the contract to ${CREDIT} and locking it`);
    await send(as(CREDIT, tempCredit), CREDIT, [
      actions.deployContract(new Uint8Array(wasm)),
      actions.functionCall('new', { owner, charger: CHARGER }, 30_000_000_000_000n, 0n),
      actions.deleteKey(tempCredit.getPublicKey()),
    ]);
  } else if (await hasKey(CREDIT, tempCredit)) {
    await send(as(CREDIT, tempCredit), CREDIT, [actions.deleteKey(tempCredit.getPublicKey())]);
  }
  if (!existsSync(keyOut)) {
    writeFileSync(
      keyOut,
      JSON.stringify({
        account_id: CHARGER,
        public_key: chargeOnly.getPublicKey().toString(),
        private_key: chargeOnly.toString(),
      }),
      { mode: 0o600 },
    );
  }
  if (await hasKey(CHARGER, tempCharger)) {
    console.log(`credit-setup: giving ${CHARGER} its charge-only key and ${owner}'s wallet key`);
    const list = [actions.deleteKey(tempCharger.getPublicKey())];
    if (!(await hasKey(CHARGER, chargeOnly))) {
      list.unshift(
        actions.addFunctionCallAccessKey(chargeOnly.getPublicKey(), CREDIT, ['charge'], ALLOWANCE),
        actions.addFullAccessKey(PublicKey.fromString(ownerKey)),
      );
    }
    await send(as(CHARGER, tempCharger), CHARGER, list);
  }
  if ((await balanceOf(FUNDER)) !== null) {
    console.log(`credit-setup: giving back to ${owner} what's left`);
    await send(f, FUNDER, [actions.deleteAccount(owner)], { gone: FUNDER });
  }

  const config = await provider.callFunction({ contractId: CREDIT, method: 'config', args: {} });
  const creditKeys = await keysOf(CREDIT);
  const chargerKeys = await keysOf(CHARGER);
  const chargeKey = chargerKeys.find((k) => k.public_key === chargeOnly.getPublicKey().toString());
  const ownerHolds = chargerKeys.some(
    (k) => k.public_key === ownerKey && k.access_key.permission === 'FullAccess',
  );
  return [
    `Done on ${network}.`,
    `${CREDIT}: the contract (sha256 ${sha}), config ${JSON.stringify(config)}, keys: ${creditKeys.length === 0 ? 'none (locked)' : creditKeys.map((k) => k.public_key).join(', ')}`,
    `${CHARGER}: ${chargerKeys.length} keys: ${ownerHolds ? `${owner}'s wallet key` : `NOT ${owner}'s`}, and one that ${chargeKey ? `can only call ${JSON.stringify(chargeKey.access_key.permission)}` : 'IS MISSING'}`,
    `${FUNDER}: ${(await balanceOf(FUNDER)) === null ? `deleted, what was left back to ${owner}` : 'STILL THERE'}`,
    `For the server: PETAL_CREDIT_CONTRACT=${CREDIT} PETAL_CHARGER_KEY_FILE=${keyOut}`,
  ].join('\n');
}

// -- a run that stopped after the transfer: no wallet needed again
if (
  resuming &&
  state.ownerKey &&
  ((await balanceOf(CREDIT)) !== null || (await balanceOf(FUNDER)) !== null)
) {
  const message = await finish(state.ownerKey);
  unlinkSync(STATE);
  console.log(message);
  process.exit(0);
}

// -- a rehearsal: the owner's key file makes the one transfer
if (values['owner-key-file']) {
  const k = JSON.parse(readFileSync(values['owner-key-file'], 'utf8')) as {
    account_id: string;
    private_key: string;
  };
  if (k.account_id !== owner)
    fail(`${values['owner-key-file']} is ${k.account_id}'s key, not ${owner}'s`);
  const kp = KeyPair.fromString(k.private_key as `ed25519:${string}`);
  if ((await balanceOf(FUNDER)) === null) {
    console.log(`credit-setup: ${owner} sends ${nearOf(SENT)} NEAR to ${FUNDER}`);
    await send(as(owner, kp), FUNDER, [actions.transfer(SENT)]);
  }
  const message = await finish(kp.getPublicKey().toString());
  unlinkSync(STATE);
  console.log(message);
  process.exit(0);
}

// -- the owner's own wallet makes the one transfer, in a page on this machine
const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Petals credit setup</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;background:#fff;color:#111}
button{font:inherit;padding:8px 16px}pre{white-space:pre-wrap;background:#f4f4f4;padding:12px}</style></head>
<body><h1>Petals' credit contract</h1>
<p>Connect <b>${owner}</b>'s wallet. It asks you to approve one plain transfer: <b>${nearOf(SENT)} NEAR</b> to <code>${FUNDER.slice(0, 6)}…${FUNDER.slice(-4)}</code>, a new account this setup made on your computer. Nothing else is asked of your wallet.</p>
<p>From that account, the script in your terminal makes <b>${CREDIT}</b> (the contract, with no key, so nobody can change it) and <b>${CHARGER}</b> (Petals' server's account, with your wallet's key and one key that can only charge). Then it deletes that account, and what's left comes back to ${owner}.</p>
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
    log('Approve the transfer in your wallet.');
    const out = await wallet.signAndSendTransaction({
      network: ${JSON.stringify(network)},
      receiverId: ${JSON.stringify(FUNDER)},
      actions: [{ type: 'Transfer', params: { deposit: ${JSON.stringify(SENT.toString())} } }],
    });
    log('Sent: ' + out.transaction.hash + '. The script is setting up now; this takes about a minute.');
    log((await post('/funded', { publicKey, hash: out.transaction.hash })).message);
  } catch (e) {
    log('Stopped: ' + (e && e.message ? e.message : e));
  }
};
</script></body></html>`;

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
      const body = JSON.parse(raw || '{}') as { publicKey?: string; hash?: string };
      if (req.method !== 'POST' || req.url !== '/funded') return answer(404, { error: 'not here' });
      if (!body.publicKey?.startsWith('ed25519:') || !body.hash)
        return answer(400, { error: 'no wallet key or transaction' });
      // the transfer as the chain shows it, once final
      const t = await readTransfer(network, body.hash, owner);
      if (!t.succeeded || t.receiver_id !== FUNDER || BigInt(t.yocto) < SENT) {
        return answer(400, {
          error: `that transaction isn't the ${nearOf(SENT)} NEAR transfer to ${FUNDER}`,
        });
      }
      const message = await finish(body.publicKey);
      unlinkSync(STATE);
      console.log(message);
      answer(200, { message });
      server.close();
    } catch (e) {
      answer(500, { error: (e as Error).message });
    }
  });
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(
    `credit-setup: ${owner} holds ${nearOf(has as bigint)} NEAR; this sends ${nearOf(SENT)} and gives back what's left.`,
  );
  console.log(
    `credit-setup: open http://127.0.0.1:${PORT} in the browser that holds ${owner}'s wallet.`,
  );
});

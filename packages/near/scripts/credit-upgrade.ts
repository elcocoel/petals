// Upgrades Petals' credit contract to version 2 (NEAR only: NEAR Intents top-ups land in it as NEAR, on the payer's
// own account), for the operator to run. It holds no key and writes nothing: the owner's own wallet signs one
// transaction as the contract's account, whose only key is the owner's:
//   node packages/near/scripts/credit-upgrade.ts [--network mainnet] [--credit petals-credit.near]
//       opens a page on http://127.0.0.1:3189 where the wallet, connected as the contract's account, approves one
//       transaction: deploy version 2, then its migrate, which reads version 1's state with every balance kept and
//       registers the contract with wNEAR. A build whose migrate can't read the state fails, and nothing changes.
// Before it: the contract's account needs room for the larger build (it says how much is missing). After it,
// upgrades are a plain call the owner signs (`upgrade`, 1 yoctoNEAR).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { JsonRpcProvider } from 'near-api-js';
import { RPC_URLS } from '../src/network.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WASM = join(HERE, '..', 'contract', 'target', 'near', 'petals_credit.wasm');
/** Version 2's build, as walked on testnet. */
const V2_SHA256 = '3301589c374538587a34a9ce5cca1cd1e946b181ead26a32a7498bdd4b2f92ed';
/** Version 1's, deployed by credit-setup.ts. */
const V1_SHA256 = 'f60842cc58b91d011c104a1c655be5861de0966f3a0f4d0c506bbf640ada3eb2';
const PORT = 3189;
const NEAR = 10n ** 24n;
const BYTE = 10n ** 19n;
/** wNEAR's registration, paid by migrate, and room for the transaction's gas. */
const AROUND = 1_250_000_000_000_000_000_000n + NEAR / 20n;

const { values } = parseArgs({
  options: {
    network: { type: 'string', default: 'mainnet' },
    credit: { type: 'string', default: 'petals-credit.near' },
  },
});
const network = values.network as 'mainnet' | 'testnet';
const CREDIT = values.credit as string;
const provider = new JsonRpcProvider({ url: RPC_URLS[network] });
const wasm = readFileSync(WASM);
const sha = createHash('sha256').update(wasm).digest('hex');
if (sha !== V2_SHA256) {
  console.error(`credit-upgrade: ${WASM} is ${sha}, not version 2's build (${V2_SHA256}).`);
  process.exit(1);
}
const base58 = (hex: string) => {
  const a = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = BigInt(`0x${hex}`);
  let out = '';
  while (n > 0n) {
    out = a[Number(n % 58n)] + out;
    n /= 58n;
  }
  return out;
};
const near = (y: bigint) => (Number(y) / 1e24).toFixed(4);

async function state() {
  const a = await provider.viewAccount({ accountId: CREDIT });
  return { code: a.code_hash, amount: BigInt(a.amount), storage: BigInt(a.storage_usage) };
}

const before = await state();
if (before.code === base58(V2_SHA256)) {
  console.log(`credit-upgrade: ${CREDIT} already runs version 2.`);
  process.exit(0);
}
if (before.code !== base58(V1_SHA256)) {
  console.error(`credit-upgrade: ${CREDIT} runs ${before.code}, not version 1's build: stopping.`);
  process.exit(1);
}
// what it will hold after: its state as now, with version 2's code in place of version 1's
const v1Code = 120_720n;
const needed = (before.storage - v1Code + BigInt(wasm.length)) * BYTE + AROUND;
if (before.amount < needed) {
  console.error(
    `credit-upgrade: ${CREDIT} holds ${near(before.amount)} NEAR; version 2 needs about ${near(needed)}. Send it ${near(needed - before.amount)} NEAR or more first (a plain transfer), then run this again.`,
  );
  process.exit(1);
}

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Petals credit upgrade</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;background:#fff;color:#111}
button{font:inherit;padding:8px 16px}pre{white-space:pre-wrap;background:#f4f4f4;padding:12px}</style></head>
<body><h1>Upgrade Petals' credit contract</h1>
<p>Connect <b>${CREDIT}</b> in your wallet (the contract's own account: its only key is yours). It asks you to approve one transaction: deploy version 2 of the contract, then its migrate, which keeps every balance as it is. Nothing is sent anywhere.</p>
<p>Version 2 takes NEAR Intents top-ups as NEAR on the payer's own account, withdrawn as NEAR. Its build: <code>${V2_SHA256.slice(0, 16)}…</code>.</p>
<button id="go">Connect ${CREDIT}</button>
<pre id="log"></pre>
<script type="module">
import { NearConnector } from 'https://esm.sh/@hot-labs/near-connect@0.12.0';
const log = (m) => { document.getElementById('log').textContent += m + '\\n'; };
document.getElementById('go').onclick = async () => {
  try {
    const code = new Uint8Array(await (await fetch('/v2.wasm')).arrayBuffer());
    const connector = new NearConnector({ network: ${JSON.stringify(network)} });
    // a remembered connection (petals.near shares the key) would pick the wrong account: start fresh
    try { await connector.disconnect(); } catch {}
    await connector.connect();
    const wallet = await connector.wallet();
    const accounts = await wallet.getAccounts();
    log('The wallet gave: ' + accounts.map((a) => a.accountId).join(', ') + '. Signing as ${CREDIT}; the chain refuses any other.');
    log('Approve the upgrade in your wallet.');
    const out = await wallet.signAndSendTransaction({
      network: ${JSON.stringify(network)},
      signerId: ${JSON.stringify(CREDIT)},
      receiverId: ${JSON.stringify(CREDIT)},
      actions: [
        { type: 'DeployContract', params: { code } },
        { type: 'FunctionCall', params: { methodName: 'migrate', args: {}, gas: '100000000000000', deposit: '0' } },
      ],
    });
    log('Sent: ' + out.transaction.hash + '. Checking it on chain…');
    const r = await fetch('/done', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hash: out.transaction.hash }) });
    log((await r.json()).message);
  } catch (e) {
    log('Stopped: ' + (e && e.message ? e.message : e));
  }
};
</script></body></html>`;

const server = createServer((req, res) => {
  const answer = (status: number, body: unknown, type = 'application/json') => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  if (req.method === 'GET' && req.url === '/') return answer(200, PAGE, 'text/html; charset=utf-8');
  if (req.method === 'GET' && req.url === '/v2.wasm') return answer(200, wasm, 'application/wasm');
  if (req.method !== 'POST' || req.url !== '/done') return answer(404, { error: 'not here' });
  req.resume();
  req.on('end', async () => {
    const after = await state().catch(() => null);
    const config = await provider
      .callFunction({ contractId: CREDIT, method: 'config', args: {} })
      .catch(() => null);
    const ok = after?.code === base58(V2_SHA256);
    const message = ok
      ? `Done: ${CREDIT} runs version 2 (${after?.code}), config ${JSON.stringify(config)}.`
      : `Not upgraded: ${CREDIT} still runs ${after?.code}. Nothing changed; see the transaction in your wallet.`;
    console.log(`credit-upgrade: ${message}`);
    answer(ok ? 200 : 409, { message });
    if (ok) server.close();
  });
});
server.listen(PORT, '127.0.0.1', () =>
  console.log(
    `credit-upgrade: ${CREDIT} holds ${near(before.amount)} NEAR (enough). Open http://127.0.0.1:${PORT} in the browser that holds ${CREDIT}'s wallet.`,
  ),
);

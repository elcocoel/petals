// pnpm verify:live: read-only checks of what Petals runs on NEAR mainnet, with no keys, no wallet and no install
// beyond this repo. Each line says PASS or FAIL with a link to look for yourself; any FAIL exits 1.
//   - petals-credit.near runs the credit contract v3 (its code hash) with its configuration;
//   - the landing's flower is on FastData, written by petals-writer.near to petals.near in one transaction;
//   - that flower's entry hash and its maker's NEP-413 signature check out, by the same code the site uses,
//     and the key that signed it is a full-access key of petals.near;
//   - the site serves that flower.

import type { Entry } from '@petal/core/types';
import { verifyEntry } from '@petal/tools';

const RPC = 'https://archival-rpc.mainnet.fastnear.com';
const KV = 'https://kv.main.fastnear.com/v0/latest';
const SITE = 'https://petals.elementarycomplexity.com';
const EXPLORER = 'https://nearblocks.io';

const CREDIT = 'petals-credit.near';
const CODE_HASH = 'Dy3xxsZTPsviKF6G4gFsAPnwHw5rJ4eGHNADZNdPshNx';
const CONFIG = { owner: 'petals.near', charger: 'petals-charger.near', wnear: 'wrap.near' };
const RECEIVER = 'petals.near';
const WRITER = 'petals-writer.near';
const FLOWER = '62eaaefb9f5852c72d37a63c';
const FLOWER_TX = '65guEPJJQCFwmKTSzMBSLEYpFU15mvZvZbaspEWt4qbm';

async function rpc<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: T; error?: unknown };
  if (!body.result) throw new Error(`${method}: ${JSON.stringify(body.error ?? res.status)}`);
  return body.result;
}

const view = <T>(params: Record<string, unknown>) =>
  rpc<T>('query', { finality: 'final', ...params });

let failed = 0;
async function check(what: string, link: string, run: () => Promise<string | true>) {
  let out: string | true;
  try {
    out = await run();
  } catch (e) {
    out = (e as Error).message;
  }
  if (out !== true) failed++;
  console.log(
    `${out === true ? 'PASS' : 'FAIL'}  ${what}\n      ${link}${out === true ? '' : `\n      ${out}`}`,
  );
}

await check(`${CREDIT} runs code ${CODE_HASH}`, `${EXPLORER}/address/${CREDIT}`, async () => {
  const a = await view<{ code_hash: string }>({ request_type: 'view_account', account_id: CREDIT });
  return a.code_hash === CODE_HASH || `its code hash is ${a.code_hash}`;
});

await check(
  `${CREDIT} config() is ${JSON.stringify(CONFIG)}`,
  `${EXPLORER}/address/${CREDIT}`,
  async () => {
    const r = await view<{ result: number[] }>({
      request_type: 'call_function',
      account_id: CREDIT,
      method_name: 'config',
      args_base64: btoa('{}'),
    });
    const got = JSON.parse(new TextDecoder().decode(new Uint8Array(r.result)));
    return JSON.stringify(got) === JSON.stringify(CONFIG) || `it is ${JSON.stringify(got)}`;
  },
);

const key = `petal/v1/spec/${FLOWER}`;
let entry: (Entry & { id: string }) | null = null;
await check(
  `FastData holds ${key}, written by ${WRITER} to ${RECEIVER}`,
  `${KV}/${RECEIVER}/${WRITER} (POST {"key":"${key}"})`,
  async () => {
    const res = await fetch(`${KV}/${RECEIVER}/${WRITER}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    const rows =
      (
        (await res.json()) as {
          entries?: { predecessor_id: string; current_account_id: string; value: unknown }[];
        }
      ).entries ?? [];
    const row = rows.find((r) => r.predecessor_id === WRITER && r.current_account_id === RECEIVER);
    if (!row) return `no such entry (HTTP ${res.status})`;
    entry = row.value as Entry & { id: string };
    return true;
  },
);

await check(
  `the transaction that wrote it: ${WRITER} called __fastdata_kv on ${RECEIVER}`,
  `${EXPLORER}/txns/${FLOWER_TX}`,
  async () => {
    const r = await rpc<{
      transaction: {
        signer_id: string;
        receiver_id: string;
        actions: { FunctionCall?: { method_name: string; args: string } }[];
      };
      final_execution_status?: string;
    }>('tx', [FLOWER_TX, WRITER]);
    const call = r.transaction.actions[0]?.FunctionCall;
    if (r.transaction.signer_id !== WRITER || r.transaction.receiver_id !== RECEIVER)
      return 'other accounts';
    if (call?.method_name !== '__fastdata_kv') return `it called ${call?.method_name}`;
    return atob(call.args).includes(key) || `its arguments don't hold ${key}`;
  },
);

await check(
  `the flower's entry hash and its maker's NEP-413 signature (verifyEntry, as the site checks)`,
  `${SITE}/f/${FLOWER}`,
  async () => {
    if (!entry) return 'no entry to check';
    const v = verifyEntry(entry, { id: FLOWER });
    if (!v.entry_hash) return "the id or spec hash doesn't match the entry";
    if (!v.maker_signature) return "the maker's signature doesn't verify";
    return (
      entry.provenance.maker?.account_id === RECEIVER ||
      `the maker is ${entry.provenance.maker?.account_id}`
    );
  },
);

await check(
  `the key that signed it is a full-access key of ${RECEIVER}`,
  `${EXPLORER}/address/${RECEIVER}`,
  async () => {
    const public_key = (entry as Entry | null)?.provenance.maker?.public_key;
    if (!public_key) return 'no maker key';
    const k = await view<{ permission: unknown }>({
      request_type: 'view_access_key',
      account_id: RECEIVER,
      public_key,
    });
    return k.permission === 'FullAccess' || `it is ${JSON.stringify(k.permission)}`;
  },
);

await check(`the site serves the flower`, `${SITE}/f/${FLOWER}`, async () => {
  const res = await fetch(`${SITE}/f/${FLOWER}`);
  return res.ok || `HTTP ${res.status}`;
});

console.log(failed ? `\nverify:live: ${failed} failed` : '\nverify:live: all passed');
process.exitCode = failed ? 1 : 0;

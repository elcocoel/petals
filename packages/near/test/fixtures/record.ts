// Records the keyless responses the near tests replay offline (T038, T042). Run by hand, rarely:
//   node packages/near/test/fixtures/record.ts
// Eight public calls: FastData KV reads (testnet and mainnet) and one 1Click DRY quote. No key,
// no signature, no transaction, no deposit address. Mainnet reads use near.social's public
// profile of mob.near (the near.social author) for row shapes, paging and metadata, because
// petals.testnet holds nothing until Elco creates it (T043).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { oneClickQuoteBody } from '../../src/pay/one-click.ts';

const here = dirname(fileURLToPath(import.meta.url));
const TEST_KV = 'https://kv.test.fastnear.com';
const MAIN_KV = 'https://kv.main.fastnear.com';
const today = new Date().toISOString().slice(0, 10);
const KEEP_HEADERS = /^(content-type|x-ratelimit-.*|ratelimit.*|retry-after)$/i;

interface Call {
  file: string;
  note: string;
  method: 'GET' | 'POST';
  url: string;
  body?: unknown;
}

async function record(c: Call): Promise<unknown> {
  if (c.url.includes('1click') && (c.body as { dry?: unknown }).dry !== true) {
    throw new Error('record: refusing a non-dry 1Click quote');
  }
  const t0 = Date.now();
  const res = await fetch(c.url, {
    method: c.method,
    headers: c.body === undefined ? {} : { 'content-type': 'application/json' },
    body: c.body === undefined ? undefined : JSON.stringify(c.body),
  });
  const text = await res.text();
  const ms = Date.now() - t0;
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {}
  const headers = Object.fromEntries([...res.headers].filter(([k]) => KEEP_HEADERS.test(k)));
  const out = {
    petal: 'recorded-http/v1',
    recorded_on: today,
    note: c.note,
    request: { method: c.method, url: c.url, ...(c.body === undefined ? {} : { body: c.body }) },
    response: { status: res.status, headers, body },
  };
  const path = join(here, c.file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`${c.method} ${c.url} -> ${res.status} in ${ms} ms, ${text.length} B -> ${c.file}`);
  return body;
}

const enc = encodeURIComponent;

await record({
  file: 'fastdata/test-latest-petals-empty.json',
  note: "The gallery read on Petal's own testnet map before anything is written: one call per trusted writer.",
  method: 'POST',
  url: `${TEST_KV}/v0/latest/petals.testnet/writer.petals.testnet`,
  body: { key_prefix: 'petal/v1/spec/', limit: 200, include_metadata: true },
});

const page1 = (await record({
  file: 'fastdata/main-latest-prefix-page1.json',
  note: 'A prefix read for one writer, two rows per page, with metadata: row shape and page_token.',
  method: 'POST',
  url: `${MAIN_KV}/v0/latest/social/mob.near`,
  body: { key_prefix: 'profile/', limit: 2, include_metadata: true },
})) as { page_token?: string };

if (page1.page_token) {
  await record({
    file: 'fastdata/main-latest-prefix-page2.json',
    note: 'The next page of the read above, following page_token.',
    method: 'POST',
    url: `${MAIN_KV}/v0/latest/social/mob.near`,
    body: {
      key_prefix: 'profile/',
      limit: 2,
      include_metadata: true,
      page_token: page1.page_token,
    },
  });
}

await record({
  file: 'fastdata/main-latest-key.json',
  note: 'One exact key by one writer, with metadata (how get() reads a row).',
  method: 'POST',
  url: `${MAIN_KV}/v0/latest/social/mob.near`,
  body: { key: 'profile/name', include_metadata: true },
});

await record({
  file: 'fastdata/main-latest-key-get.json',
  note: 'The GET form of the same read (no metadata).',
  method: 'GET',
  url: `${MAIN_KV}/v0/latest/social/mob.near/${enc('profile/name')}`,
});

await record({
  file: 'fastdata/main-latest-key-missing.json',
  note: 'An exact key that was never written.',
  method: 'POST',
  url: `${MAIN_KV}/v0/latest/social/mob.near`,
  body: { key: 'petal/v1/spec/000000000000000000000000', include_metadata: true },
});

await record({
  file: 'fastdata/main-history-key.json',
  note: 'History of one key, newest first, with metadata: how the writer confirms its own tx_hash.',
  method: 'POST',
  url: `${MAIN_KV}/v0/history/social/mob.near`,
  body: { key: 'profile/name', include_metadata: true, limit: 3 },
});

await record({
  file: '1click/dry-quote.json',
  note: 'The exact request quote1Click sends for { purpose: "sponsor_refresh", amount_usd: 1 }: DRY, so no deposit address and no money.',
  method: 'POST',
  url: 'https://1click.chaindefuser.com/v0/quote',
  body: oneClickQuoteBody(
    { purpose: 'sponsor_refresh', amount_usd: 1 },
    { recipient: 'petal-demo.near', now: new Date() },
  ),
});

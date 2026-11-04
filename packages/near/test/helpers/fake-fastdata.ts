// An in-memory FastData KV server behind a fetch function, answering in the shapes recorded on
// 2026-11-04 (test/fixtures/fastdata/): { entries, page_token? }, rows with predecessor_id,
// current_account_id, block_height, block_timestamp (ns), key, value, and with include_metadata
// receipt_id, action_index, tx_hash, signer_id. Latest reads are key-ascending with an opaque
// page_token; history is newest first. Tombstones are returned as rows with value null (the worst
// case for a reader).
import type { KvRow } from '../../src/map/fastdata-kv.ts';

export interface IndexedWrite {
  receiver: string;
  writer: string;
  signer: string;
  tx_hash: string;
  receipt_id: string;
  block_height: number;
  /** nanoseconds */
  block_timestamp: number;
  entries: Record<string, unknown>;
}

export interface FakeFastData {
  fetch: typeof fetch;
  index(w: IndexedWrite): void;
  /** every request, parsed */
  requests: { method: string; path: string; body: Record<string, unknown>; headers: Headers }[];
  /** answer the next n requests with this status */
  failNext(n: number, status: number): void;
}

const META = ['receipt_id', 'action_index', 'tx_hash', 'signer_id'] as const;

const token = (k: string) => Buffer.from(JSON.stringify({ k })).toString('base64url');
const untoken = (t: string) =>
  (JSON.parse(Buffer.from(t, 'base64url').toString()) as { k: string }).k;

export function fakeFastData(base = 'https://kv.test.fastnear.com'): FakeFastData {
  const history: KvRow[] = []; // append order = chain order
  const requests: FakeFastData['requests'] = [];
  let failures = 0;
  let failStatus = 500;

  const show = (r: KvRow, meta: boolean): KvRow => {
    if (meta) return { ...r };
    const out = { ...r };
    for (const m of META) delete out[m];
    return out;
  };

  function latestRows(receiver: string, writer?: string): KvRow[] {
    const last = new Map<string, KvRow>();
    for (const r of history) {
      if (r.current_account_id !== receiver) continue;
      if (writer && r.predecessor_id !== writer) continue;
      last.set(`${r.predecessor_id}\n${r.key}`, r);
    }
    return [...last.values()].sort((a, b) =>
      a.key === b.key ? (a.predecessor_id < b.predecessor_id ? -1 : 1) : a.key < b.key ? -1 : 1,
    );
  }

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  const handler = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    if (!url.href.startsWith(base)) return json(404, { error: 'not this fake' });
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    requests.push({ method, path: url.pathname, body, headers: new Headers(init?.headers) });
    if (failures > 0) {
      failures--;
      return new Response('down', { status: failStatus });
    }
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const [v0, kind, receiver, writer, ...rest] = parts;
    if (v0 !== 'v0' || !receiver) return json(404, {});
    if ('key' in body && 'key_prefix' in body) return json(400, { error: 'key and key_prefix' });
    const limit = Math.min(200, Math.max(1, Number(body.limit ?? 50)));
    const meta = body.include_metadata === true;

    if (kind === 'latest' && method === 'GET' && writer && rest.length) {
      const key = rest.join('/');
      const rows = latestRows(receiver, writer).filter((r) => r.key === key);
      return json(200, { entries: rows.map((r) => show(r, false)) });
    }
    if (kind === 'latest' && method === 'POST') {
      let rows = latestRows(receiver, writer);
      if (typeof body.key === 'string') rows = rows.filter((r) => r.key === body.key);
      else if (typeof body.key_prefix === 'string') {
        const p = body.key_prefix;
        rows = rows.filter((r) => r.key.startsWith(p));
      }
      if (typeof body.page_token === 'string') {
        const after = untoken(body.page_token);
        rows = rows.filter((r) => r.key > after);
      }
      const page = rows.slice(0, limit);
      const more = rows.length > limit;
      const last = page.at(-1);
      return json(200, {
        entries: page.map((r) => show(r, meta)),
        ...(more && last ? { page_token: token(last.key) } : {}),
      });
    }
    if (kind === 'history' && method === 'POST' && writer) {
      const rows = history
        .filter(
          (r) =>
            r.current_account_id === receiver &&
            r.predecessor_id === writer &&
            (typeof body.key !== 'string' || r.key === body.key),
        )
        .reverse()
        .slice(0, limit);
      return json(200, { entries: rows.map((r) => show(r, meta)) });
    }
    return json(404, {});
  };

  return {
    fetch: handler as typeof fetch,
    requests,
    failNext(n, status) {
      failures = n;
      failStatus = status;
    },
    index(w) {
      let i = 0;
      for (const [key, value] of Object.entries(w.entries)) {
        history.push({
          receipt_id: w.receipt_id,
          action_index: 0,
          tx_hash: w.tx_hash,
          signer_id: w.signer,
          predecessor_id: w.writer,
          current_account_id: w.receiver,
          block_height: w.block_height,
          block_timestamp: w.block_timestamp + i++,
          key,
          value,
        });
      }
    },
  };
}

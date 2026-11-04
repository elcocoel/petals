// Replays recorded HTTP exchanges (recorded-http/v1, written by test/fixtures/record.ts). A request
// must match a recording exactly (method, URL, canonical body) or the fetch throws, so a test also
// proves the client sends what was recorded.
import { readFileSync } from 'node:fs';
import { canonicalJson } from '@petal/core';

export interface Recording {
  petal: 'recorded-http/v1';
  recorded_on: string;
  note: string;
  request: { method: string; url: string; body?: unknown };
  response: { status: number; headers: Record<string, string>; body: unknown };
}

const FIXTURES = new URL('../fixtures/', import.meta.url);

export function recording(name: string): Recording {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8')) as Recording;
}

const sameBody = (a: unknown, b: unknown, ignore: string[]) => {
  if (a === undefined || b === undefined) return a === b;
  const strip = (x: unknown) =>
    Object.fromEntries(Object.entries(x as object).filter(([k]) => !ignore.includes(k)));
  return canonicalJson(strip(a)) === canonicalJson(strip(b));
};

/** A fetch that answers only the recorded requests; `ignore` lists body fields not compared. */
export function replay(names: string[], opts: { ignore?: string[] } = {}) {
  const recs = names.map(recording);
  const calls: { url: string; body: unknown; headers: Headers }[] = [];
  const f = async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
    calls.push({ url, body, headers: new Headers(init?.headers) });
    const rec = recs.find(
      (r) =>
        r.request.method === method &&
        r.request.url === url &&
        sameBody(r.request.body, body, opts.ignore ?? []),
    );
    if (!rec) throw new Error(`replay: no recording for ${method} ${url} ${JSON.stringify(body)}`);
    return new Response(JSON.stringify(rec.response.body), {
      status: rec.response.status,
      headers: rec.response.headers,
    });
  };
  return Object.assign(f as typeof fetch, { calls });
}

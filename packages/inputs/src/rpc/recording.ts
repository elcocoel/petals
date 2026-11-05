// Recorded RPC answers (`rpc-recording/v1`), so tests run offline on real responses.
// A recording maps each JSON-RPC request (method and params) to the answer one endpoint gave.
// call_function results are kept as text (`result_text`) instead of a byte array, which keeps
// the file small and readable; replay turns them back into bytes.
import { canonicalJson } from '@petal/core';

export const RECORDING_FORMAT = 'rpc-recording/v1';

export interface RecordedCall {
  endpoint: string;
  request: { method: string; params: unknown };
  response: unknown;
}

export interface Recording {
  petal: typeof RECORDING_FORMAT;
  note: string;
  recorded_at: string;
  calls: RecordedCall[];
  [extra: string]: unknown;
}

const keyOf = (method: string, params: unknown) => canonicalJson({ method, params });

type Answer = { result?: { result?: unknown; result_text?: string } & Record<string, unknown> };

function compact(response: unknown): unknown {
  const r = (response as Answer).result;
  if (r && Array.isArray(r.result)) {
    const { result, ...rest } = r;
    return {
      ...(response as object),
      result: { ...rest, result_text: Buffer.from(result as number[]).toString('utf8') },
    };
  }
  return response;
}

function expand(response: unknown): unknown {
  const r = (response as Answer).result;
  if (r && typeof r.result_text === 'string') {
    const { result_text, ...rest } = r;
    return {
      ...(response as object),
      result: { ...rest, result: [...Buffer.from(result_text, 'utf8')] },
    };
  }
  return response;
}

/**
 * Wraps a fetch and keeps every JSON-RPC answer it sees (successful HTTP only). `skip` leaves
 * requests out, so a walk over hundreds of MB of logs is not held in memory to be thrown away.
 */
export function recordingFetch(
  inner: typeof fetch = globalThis.fetch,
  skip: (request: { method: string; params: unknown }) => boolean = () => false,
): {
  fetch: typeof fetch;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const wrapped: typeof fetch = async (input, init) => {
    const res = await inner(input, init);
    if (!res.ok) return res;
    const req = JSON.parse(String(init?.body)) as { method: string; params: unknown };
    if (skip(req)) return res;
    const text = await res.text();
    try {
      calls.push({
        endpoint: String(input),
        request: { method: req.method, params: req.params },
        response: compact(JSON.parse(text)),
      });
    } catch {}
    return new Response(text, { status: res.status, headers: res.headers });
  };
  return { fetch: wrapped, calls };
}

/**
 * A fetch that answers from a recording. Unknown requests get HTTP 404 and are listed in
 * `missing`, so a test can say exactly which call was not recorded.
 */
export function replayFetch(
  rec: Pick<Recording, 'calls'>,
  overrides: Record<string, unknown> = {},
): { fetch: typeof fetch; seen: string[]; missing: string[] } {
  const answers = new Map<string, unknown>();
  for (const c of rec.calls) answers.set(keyOf(c.request.method, c.request.params), c.response);
  for (const [k, v] of Object.entries(overrides)) answers.set(k, v);
  const seen: string[] = [];
  const missing: string[] = [];
  const replay: typeof fetch = async (_input, init) => {
    const req = JSON.parse(String(init?.body)) as { id: unknown; method: string; params: unknown };
    const k = keyOf(req.method, req.params);
    seen.push(k);
    const answer = answers.get(k);
    if (answer === undefined) {
      missing.push(k);
      return new Response('not recorded', { status: 404 });
    }
    return new Response(JSON.stringify({ ...(expand(answer) as object), id: req.id }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetch: replay, seen, missing };
}

/** The key replayFetch uses for a request, for overrides. */
export const recordingKey = keyOf;

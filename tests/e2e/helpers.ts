// Shared by the end-to-end tests (T071, T072): the repo root, the recorded House of Stake answers
// behind a real RPC pool, an SSE reader that times every event, the number check of quickstart
// step 2.5, and the entry a maker publishes from a finished run (what the web's publish page
// builds, apps/web/lib/entry.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { canonicalJson, TOOLS_VERSION } from '@petal/core';
import type { Entry, FlowerResult, ModelSignature } from '@petal/core/types';
import { DEFAULT_ENDPOINTS, type InputModule, nearHouseOfStake, rpcPool } from '@petal/inputs';

export const REPO = fileURLToPath(new URL('../../', import.meta.url));

// ---------------------------------------------------------------------------------------------
// Recorded House of Stake

/** W2's recording of one House of Stake read (rpc-recording/v1, 22 keyless calls). */
export const HOS_RECORDING = join(REPO, 'packages/inputs/test/fixtures/hos/recording.json.gz');

interface RecordedCall {
  request: { method: string; params: unknown };
  response: { result?: Record<string, unknown> } & Record<string, unknown>;
}

const keyOf = (method: string, params: unknown) => canonicalJson({ method, params });

/** A recorded answer as the endpoint sent it: call_function text goes back to a byte array. */
function expand(response: RecordedCall['response']): unknown {
  const r = response.result;
  if (r && typeof r.result_text === 'string') {
    const { result_text, ...rest } = r;
    return { ...response, result: { ...rest, result: [...Buffer.from(result_text, 'utf8')] } };
  }
  return response;
}

/**
 * The real near-house-of-stake module over a real RPC pool whose fetch answers from the
 * recording, unpaced. A request that was not recorded gets HTTP 404 and is listed in `missing`.
 */
export function recordedHouseOfStake(): {
  module: InputModule;
  calls: () => number;
  missing: string[];
  block_height: number;
} {
  const rec = JSON.parse(gunzipSync(readFileSync(HOS_RECORDING)).toString('utf8')) as {
    block_height: number;
    calls: RecordedCall[];
  };
  const answers = new Map<string, RecordedCall['response']>();
  for (const c of rec.calls) answers.set(keyOf(c.request.method, c.request.params), c.response);
  // the recorded head also answers `block` by its height
  const head = rec.calls.find((c) => c.request.method === 'block')?.response;
  if (head) answers.set(keyOf('block', { block_id: rec.block_height }), head);

  let n = 0;
  const missing: string[] = [];
  const replay: typeof fetch = async (_input, init) => {
    n++;
    const req = JSON.parse(String(init?.body)) as { id: unknown; method: string; params: unknown };
    const answer = answers.get(keyOf(req.method, req.params));
    if (!answer) {
      missing.push(keyOf(req.method, req.params));
      return new Response('not recorded', { status: 404 });
    }
    return new Response(JSON.stringify({ ...(expand(answer) as object), id: req.id }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const rpc = rpcPool({
    fetch: replay,
    endpoints: DEFAULT_ENDPOINTS.map((e) => ({ ...e, intervalMs: 0 })),
    rounds: 1,
    sleep: async () => {},
  });
  return {
    module: nearHouseOfStake({ rpc }),
    calls: () => n,
    missing,
    block_height: rec.block_height,
  };
}

// ---------------------------------------------------------------------------------------------
// SSE

export interface TimedEvent {
  event: string;
  data: unknown;
  /** ms since the request was sent */
  at: number;
}

/** Reads an SSE response as it streams, stamping each event with its arrival time. */
export async function readSse(res: Response, sentAt: number): Promise<TimedEvent[]> {
  if (!res.body) throw new Error('readSse: the response has no body');
  const out: TimedEvent[] = [];
  const decoder = new TextDecoder();
  let buf = '';
  const flush = (block: string, at: number) => {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (!data.length) return;
    const text = data.join('\n');
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {}
    out.push({ event, data: parsed, at });
  };
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    const at = Date.now() - sentAt;
    buf += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n');
    let i = buf.indexOf('\n\n');
    while (i >= 0) {
      flush(buf.slice(0, i), at);
      buf = buf.slice(i + 2);
      i = buf.indexOf('\n\n');
    }
  }
  if (buf.trim()) flush(buf, Date.now() - sentAt);
  return out;
}

/** The longest wait between the request and the first event, or between two events. */
export function longestGap(events: TimedEvent[]): number {
  let prev = 0;
  let max = 0;
  for (const e of events) {
    max = Math.max(max, e.at - prev);
    prev = e.at;
  }
  return max;
}

/** True when `want` appears in `names` in this order (other names may come between). */
export function inOrder(names: string[], want: string[]): boolean {
  let i = 0;
  for (const n of names) if (n === want[i]) i++;
  return i === want.length;
}

// ---------------------------------------------------------------------------------------------
// Numbers (quickstart step 2.5: every number in the answer appears in compute_figures)

export interface Quoted {
  text: string;
  value: number;
  /** half a unit of the last digit quoted, in the value's units: the rounding allowed */
  tolerance: number;
}

/** Links carry digits that are not figures (base64 specs, hashes): they are left out. */
const LINK = /(?:https?:\/\/|\/)[^\s)]*\?[^\s)]*|https?:\/\/[^\s)]+/g;
const NUMBER = /(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(\s?%|\s?[kKmMbB](?![a-zA-Z]))?/g;
const SCALE: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };

/** Every number written in `text`, with its unit (%, k, M, B) applied. */
export function numbersIn(text: string): Quoted[] {
  const out: Quoted[] = [];
  for (const m of text.replace(LINK, ' ').matchAll(NUMBER)) {
    const [whole, int = '', frac = '', unit = ''] = m;
    const u = unit.trim().toLowerCase();
    const scale = u === '%' ? 0.01 : (SCALE[u] ?? 1);
    const value = Number(`${int.replace(/,/g, '')}${frac ? `.${frac}` : ''}`) * scale;
    const tolerance = frac ? 0.5 * 10 ** -frac.length * scale : u ? 0.5 * scale : 0;
    out.push({ text: whole.trim(), value, tolerance });
  }
  return out;
}

/** Every number in a tool output: numeric values, numeric strings and numeric keys. */
export function numbersOf(x: unknown, out: number[] = []): number[] {
  if (typeof x === 'number') out.push(x);
  else if (typeof x === 'string') {
    if (/^-?\d+(\.\d+)?$/.test(x)) out.push(Number(x));
  } else if (Array.isArray(x)) for (const v of x) numbersOf(v, out);
  else if (x && typeof x === 'object')
    for (const [k, v] of Object.entries(x)) {
      if (/^\d+$/.test(k)) out.push(Number(k));
      numbersOf(v, out);
    }
  return out;
}

/** The quoted numbers that match no figure (empty when the answer is clean). */
export function unbacked(text: string, figures: unknown): Quoted[] {
  const known = numbersOf(figures);
  return numbersIn(text).filter(
    (q) => !known.some((f) => Math.abs(f - q.value) <= q.tolerance + 1e-12),
  );
}

// ---------------------------------------------------------------------------------------------
// Entries

/** What prepare_publish takes: an entry without `id` and `provenance.maker`. */
export type EntryDraft = Omit<Entry, 'id' | 'provenance'> & {
  provenance: Omit<Entry['provenance'], 'maker'>;
};

/** The entry the publish page builds from a finished run of Petal's agent. */
export function entryDraft(
  flower: FlowerResult,
  o: { title: string; model: string; signature: ModelSignature | null; created_at: string },
): EntryDraft {
  const sha = flower.spec.snapshot.sha256;
  return {
    petal: 'flower/v1',
    title: o.title,
    spec: flower.spec,
    spec_sha256: flower.spec_sha256,
    interpretation: flower.interpretation,
    snapshot: { sha256: sha, urls: [`/api/v1/snapshots/${sha}`] },
    render_sha256: flower.render_sha256,
    provenance: {
      agent: { kind: 'petal-agent', model: o.model, signature: o.signature },
      tools_version: TOOLS_VERSION,
      created_at: o.created_at,
    },
  };
}

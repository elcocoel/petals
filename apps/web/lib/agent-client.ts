// The adapter: the one place the browser talks to Petal's API (design/frontend-foundation.md, MVVM+).
// Everything else gets plain values and agent events, so views and ViewModels hold no URLs, no status
// codes and no `fetch`. layers.test.ts names this file as the only one in lib/ allowed to call it.
import type {
  AgentEvent,
  ChatMessage,
  LegendItem,
  Nep413Proof,
  PetalDetail,
  QuoteResult,
  Run,
} from '@petal/core/types';
import type { EntryDraft, Prepared, Published } from './publish.ts';
import { readSse } from './sse.ts';

export interface ChatRequest {
  messages: ChatMessage[];
  run_id?: string;
}

export type RunRead = { ok: true; run: Run } | { ok: false; code: string; message: string };

/** What the chat needs from the server. A ViewModel takes this, so a test can hand it a fake. */
export interface AgentClient {
  /** Throws when the server refuses or can't be reached; the events end when the stream does. */
  chat(request: ChatRequest): AsyncIterable<AgentEvent>;
  readRun(runId: string): Promise<RunRead>;
  /** The run's events after the first `skip`, as they happen, until it ends. */
  followRun(runId: string, skip: number): AsyncIterable<AgentEvent>;
}

const runUrl = (runId: string) => `/api/v1/agent/runs/${encodeURIComponent(runId)}`;

/** Heartbeats keep the connection open and say nothing, so they stop here. */
async function* eventsOf(body: ReadableStream<Uint8Array>, skip = 0): AsyncGenerator<AgentEvent> {
  let left = skip;
  for await (const m of readSse(body)) {
    if (m.event === 'heartbeat' || left-- > 0) continue;
    yield { event: m.event, data: JSON.parse(m.data) } as AgentEvent;
  }
}

export const agentClient: AgentClient = {
  async *chat(request) {
    const res = await fetch('/api/v1/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(request),
    });
    if (!res.ok || !res.body) {
      const json = (await res.json().catch(() => ({}))) as {
        error?: { code: string; message: string };
      };
      throw new Error(
        json.error ? `${json.error.code}: ${json.error.message}` : `HTTP ${res.status}`,
      );
    }
    yield* eventsOf(res.body);
  },

  async readRun(runId) {
    const res = await fetch(runUrl(runId));
    const json = (await res.json()) as Run & { error?: { code: string; message: string } };
    if (!res.ok || json.error) {
      return {
        ok: false,
        code: json.error?.code ?? 'not_found',
        message: json.error?.message ?? `HTTP ${res.status}`,
      };
    }
    return { ok: true, run: json };
  },

  async *followRun(runId, skip) {
    // the stream replays what was stored, then follows it to the end
    const res = await fetch(runUrl(runId), { headers: { accept: 'text/event-stream' } });
    if (res.body) yield* eventsOf(res.body, skip);
  },
};

export interface Drawn {
  svg: string;
  petals: PetalDetail[];
  legend: LegendItem[];
}

/** The flower's SVG for a spec, given as JSON text. Throws with the reason when it can't be drawn. */
export async function drawFlower(specJson: string): Promise<Drawn> {
  const res = await fetch('/api/v1/render', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: `{"spec":${specJson},"include_svg":true}`,
  });
  const json = (await res.json()) as Partial<Drawn> & { error?: { message: string } };
  if (res.ok && json.svg) {
    return { svg: json.svg, petals: json.petals ?? [], legend: json.legend ?? [] };
  }
  throw new Error(json.error?.message ?? `HTTP ${res.status}`);
}

export interface QuoteRequest {
  purpose: 'sponsor_refresh' | 'sponsor_coverage';
  amount_usd: number;
  network?: string;
}

/** A dry quote. Throws with the reason when there is none. */
export async function askQuote(request: QuoteRequest): Promise<QuoteResult> {
  const res = await fetch('/api/v1/quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  const json = (await res.json()) as QuoteResult & { error?: { message: string } };
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  return json;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: { code: string; message: string; hint?: string };
  };
  if (!res.ok || json.error) {
    const e = json.error;
    throw new Error(
      e ? `${e.code}: ${e.message}${e.hint ? ` (${e.hint})` : ''}` : `HTTP ${res.status}`,
    );
  }
  return json;
}

export const preparePublish = (entry: EntryDraft) =>
  postJson<Prepared>('/api/v1/publish/prepare', { entry });

export const publishEntry = (entrySha256: string, proof: Nep413Proof) =>
  postJson<Published>('/api/v1/publish', { entry_sha256: entrySha256, proof });

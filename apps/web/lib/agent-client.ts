// The adapter: the one place the browser talks to Petal's API (design/frontend-foundation.md, MVVM+).
// Everything else gets plain values and agent events, so views and ViewModels hold no URLs, no status
// codes and no `fetch`. layers.test.ts names this file as the only one in lib/ allowed to call it.
import type {
  AgentEvent,
  ChatMessage,
  Entry,
  LegendItem,
  Nep413Proof,
  PetalDetail,
  QuoteResult,
  Reading,
  Run,
} from '@petal/core/types';
import type { Settings } from './composer-options.ts';
import type { ListedConversation } from './conversation-list.ts';
import type { ElsewhereRead } from './elsewhere.ts';
import type { EntryDraft, Prepared, Published } from './publish.ts';
import { readSse } from './sse.ts';

export interface ChatRequest {
  messages: ChatMessage[];
  run_id?: string;
  /** a pick for this conversation, from here on */
  settings?: Settings;
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

/** A person's conversations, newest first. Nothing to show is the same as none: no session, or no answer. */
export async function listConversations(): Promise<ListedConversation[]> {
  const res = await fetch('/api/v1/conversations');
  if (!res.ok) return [];
  const json = (await res.json()) as { conversations?: ListedConversation[] };
  return json.conversations ?? [];
}

/** Where a conversation in another agent stands, by its exploration's id or a link's token. */
export async function readElsewhere(ref: string): Promise<ElsewhereRead> {
  const res = await fetch(`/api/v1/explorations/${encodeURIComponent(ref)}`, { cache: 'no-store' });
  const json = (await res.json()) as Record<string, unknown> & { error?: { message: string } };
  if (!res.ok || json.error) return { failed: json.error?.message ?? `HTTP ${res.status}` };
  return { packet: json as unknown as Extract<ElsewhereRead, { packet: unknown }>['packet'] };
}

/** What the composer shows of a conversation: its settings, and which model answered last. */
export interface ConversationFacts {
  settings: Settings;
  answered: string | null;
}

export async function readConversationFacts(id: string): Promise<ConversationFacts | null> {
  const res = await fetch(`/api/v1/conversations/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  const { conversation } = (await res.json()) as {
    conversation: { settings: Settings; turns: { model: string }[] };
  };
  return { settings: conversation.settings, answered: conversation.turns.at(-1)?.model ?? null };
}

/** A pick on a conversation that's already going, kept now rather than at its next message. */
export async function saveSettings(id: string, settings: Settings): Promise<void> {
  await fetch(`/api/v1/conversations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ settings }),
  });
}

export interface Challenge {
  nonce: string;
  message: string;
  recipient: string;
  expires_at: string;
}

/** What signing in asks of the server. A flow takes this, so a test can hand it a fake. */
export interface SessionClient {
  /** The account they're connected with, or null if no one is. */
  me(): Promise<string | null>;
  challenge(): Promise<Challenge>;
  verify(network: string, proof: Nep413Proof): Promise<void>;
  logout(): Promise<void>;
}

class Refused extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** Why the server refused, for a flow that says different things to different refusals. */
export const refusalCode = (e: unknown) => (e instanceof Refused ? e.code : null);

async function sessionPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: { code: string; message: string };
  };
  if (!res.ok || json.error) {
    throw new Refused(json.error?.code ?? 'internal', json.error?.message ?? `HTTP ${res.status}`);
  }
  return json;
}

export const sessionClient: SessionClient = {
  async me() {
    const res = await fetch('/api/v1/me');
    if (!res.ok) return null;
    const { network, wallets } = (await res.json()) as {
      network: string;
      wallets: { network: string; account_id: string }[];
    };
    return (wallets.find((w) => w.network === network) ?? wallets[0])?.account_id ?? null;
  },
  challenge: () => sessionPost<Challenge>('/api/v1/auth/challenge', {}),
  async verify(network, proof) {
    await sessionPost('/api/v1/auth/verify', { network, proof });
  },
  async logout() {
    await sessionPost('/api/v1/auth/logout', {});
  },
};

/**
 * Makes an agent's work this browser's, by the continue link the agent holds, so it joins their list.
 * Returns its id, or null if this link can't: a read link stays read-only.
 */
export async function claimElsewhere(token: string): Promise<string | null> {
  const res = await fetch(`/api/v1/explorations/${encodeURIComponent(token)}/claim`, {
    method: 'POST',
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { exploration?: string };
  return json.exploration ?? null;
}

/** All a live drawing needs from a reading: render_flower's opt-in `reading`. */
export type DrawnReading = Pick<Reading, 'title' | 'petals'>;

export interface Drawn {
  svg: string;
  petals: PetalDetail[];
  legend: LegendItem[];
  reading?: DrawnReading;
}

/** The flower's SVG for a spec, given as JSON text. Throws with the reason when it can't be drawn. */
export async function drawFlower(specJson: string): Promise<Drawn> {
  const res = await fetch('/api/v1/render', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: `{"spec":${specJson},"include_svg":true,"include_reading":true}`,
  });
  const json = (await res.json()) as Partial<Drawn> & { error?: { message: string } };
  if (res.ok && json.svg) {
    return {
      svg: json.svg,
      petals: json.petals ?? [],
      legend: json.legend ?? [],
      ...(json.reading ? { reading: json.reading } : {}),
    };
  }
  throw new Error(json.error?.message ?? `HTTP ${res.status}`);
}

/** A stored flower: what /f/[id] reads, for the panel. */
export interface StoredFlower {
  entry: Entry;
  where: 'map' | 'fixture';
  tx_hash?: string;
}

/** Throws with the reason when it can't be read. */
export async function readFlower(id: string): Promise<StoredFlower> {
  const res = await fetch(`/api/v1/flowers/${encodeURIComponent(id)}`);
  const json = (await res.json()) as StoredFlower & { error?: { message: string } };
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  return json;
}

/** What a snapshot says about itself that a flower's text can use. */
export interface SnapshotFacts {
  /** source id to its URL, so a source can be a link */
  sources: Record<string, string>;
  /** measure id to its unit */
  units: Record<string, string>;
}

/** Facts only decorate a flower, so a snapshot that can't be described just has none. */
export async function readSnapshotFacts(sha256: string): Promise<SnapshotFacts> {
  const none: SnapshotFacts = { sources: {}, units: {} };
  const res = await fetch(`/api/v1/snapshots/${encodeURIComponent(sha256)}/describe`).catch(
    () => null,
  );
  if (!res?.ok) return none;
  const json = (await res.json().catch(() => ({}))) as {
    sources?: { id: string; url: string }[];
    measures?: { id: string; unit: string }[];
  };
  return {
    sources: Object.fromEntries((json.sources ?? []).map((s) => [s.id, s.url])),
    units: Object.fromEntries((json.measures ?? []).map((m) => [m.id, m.unit])),
  };
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

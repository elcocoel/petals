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
import type { ConnectedAgent } from './agents.ts';
import type { Settings } from './composer-options.ts';
import type { ListedConversation } from './conversation-list.ts';
import type { ElsewhereRead } from './elsewhere.ts';
import type { ListedFlower } from './flower-view.ts';
import type { Job } from './jobs.ts';
import { NEAR_SOCIAL_API, type SocialProfile, socialProfile } from './near-social.ts';
import type { Credit, PayInfo } from './pay.ts';
import type { EntryDraft, Prepared, Published } from './publish.ts';
import { readSse } from './sse.ts';
import { viewerView } from './viewer-view.ts';

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
      // the code goes with it, so a refusal can be answered for what it is (a payment, B)
      throw new Refused(
        json.error?.code ?? 'internal',
        json.error?.message ?? `HTTP ${res.status}`,
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

/** The flowers on the shared map, as the gallery lists them. No answer is the same as none. */
export async function listMapFlowers(): Promise<ListedFlower[]> {
  const res = await fetch('/api/v1/flowers');
  if (!res.ok) return [];
  const json = (await res.json()) as { flowers?: ListedFlower[] };
  return json.flowers ?? [];
}

/** A line to the Petals helper on the person's own computer (lib/terminal-pass.ts), never to our server. */
export interface TerminalLine {
  send: (text: string) => void;
  close: () => void;
}

export function openTerminalLine(
  url: string,
  first: string,
  on: { bytes: (b: Uint8Array) => void; text: (t: string) => void; closed: (code: number) => void },
): TerminalLine {
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => ws.send(first);
  ws.onmessage = (e: MessageEvent) =>
    typeof e.data === 'string' ? on.text(e.data) : on.bytes(new Uint8Array(e.data as ArrayBuffer));
  ws.onclose = (e: CloseEvent) => on.closed(e.code);
  return {
    send: (text) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(text);
    },
    close: () => ws.close(),
  };
}

/**
 * A conversation of the signed-in person's, for the agent in the terminal to write into: its id, or null
 * when this browser has no person (an exploration nobody owns would only be an orphan).
 */
export async function startOwnConversation(
  question: string,
  client: string,
): Promise<string | null> {
  const res = await fetch('/api/v1/explorations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question, client }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { exploration?: string; owned?: boolean };
  return json.owned && json.exploration ? json.exploration : null;
}

/** A continue link to a conversation of the person's, which the helper hands its agent. */
export async function continueLinkFor(id: string): Promise<string | null> {
  const res = await fetch(`/api/v1/explorations/${encodeURIComponent(id)}/links`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope: 'continue' }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { url?: string };
  return json.url ?? null;
}

/** Where a conversation in another agent stands, by its exploration's id or a link's token. */
export async function readElsewhere(ref: string): Promise<ElsewhereRead> {
  const res = await fetch(`/api/v1/explorations/${encodeURIComponent(ref)}`, { cache: 'no-store' });
  const json = (await res.json()) as Record<string, unknown> & { error?: { message: string } };
  if (!res.ok || json.error) return { failed: json.error?.message ?? `HTTP ${res.status}` };
  return { packet: json as unknown as Extract<ElsewhereRead, { packet: unknown }>['packet'] };
}

/** Calls `onChange` when the server signals a change, and once on connecting. Returns how to stop. */
export function listenElsewhere(id: string, onChange: () => void): () => void {
  const live = new EventSource(`/api/v1/explorations/${encodeURIComponent(id)}/live`);
  live.addEventListener('change', onChange);
  return () => live.close();
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
  /** The accounts of the person connected, in words, or null if no one is. */
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
    // A person can hold several, and the server doesn't say which one signed, so they're all named.
    const here = wallets.filter((w) => w.network === network);
    return (here.length > 0 ? here : wallets).map((w) => w.account_id).join('  ·  ') || null;
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
    body: `{"spec":${specJson},"include_svg":true,"include_reading":true,"view":${JSON.stringify(viewerView())}}`,
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

/**
 * The public profile of `account` on NEAR Social (lib/near-social.ts), read straight from NEAR Social's API,
 * not ours: null when there's none. It throws when NEAR Social doesn't answer, so the page can say so.
 */
export async function readSocialProfile(account: string): Promise<SocialProfile | null> {
  const res = await fetch(`${NEAR_SOCIAL_API}/v1/accounts/${encodeURIComponent(account)}`);
  if (!res.ok) throw new Error(`NEAR Social answered ${res.status}`);
  return socialProfile(await res.json());
}

/** The wallet this session signed in with, and its network, or null: not signed in, or the server doesn't say. */
export async function readSignedIn(): Promise<{ network: string; account: string } | null> {
  const res = await fetch('/api/v1/me');
  if (!res.ok) return null;
  const { network, account } = (await res.json()) as { network?: string; account?: string | null };
  return network && account ? { network, account } : null;
}

/** The visitor's credit for Petals' agent (B), or null: not signed in, or no top-up yet. */
export async function readCredit(): Promise<Credit | null> {
  const res = await fetch('/api/v1/me');
  if (!res.ok) return null;
  const json = (await res.json()) as { credit?: Credit | null };
  return json.credit ?? null;
}

/** Where a payment goes and NEAR's price now, or null if the server can't say. */
export async function readPay(): Promise<PayInfo | null> {
  const res = await fetch('/api/v1/pay');
  if (!res.ok) return null;
  return (await res.json()) as PayInfo;
}

/** Tells the server about a transfer the wallet sent; it checks it on chain and adds the credit. */
export function confirmPay(body: {
  network: string;
  account_id: string;
  tx_hash: string;
}): Promise<{ added_usd: number; added_near: number; near_usd: number; credit: Credit }> {
  return sessionPost('/api/v1/pay', body);
}

/** The jobs Petals' agent handed out in a conversation, and where each stands (C). Empty on no answer. */
export async function readJobs(exploration: string): Promise<Job[]> {
  const res = await fetch(`/api/v1/explorations/${encodeURIComponent(exploration)}/jobs`, {
    cache: 'no-store',
  });
  if (!res.ok) return [];
  return ((await res.json()) as { jobs?: Job[] }).jobs ?? [];
}

/** The person's own agents and what each is doing, or none: not signed in, or no answer. */
export async function readAgents(): Promise<ConnectedAgent[]> {
  const res = await fetch('/api/v1/agents', { cache: 'no-store' });
  if (!res.ok) return [];
  return ((await res.json()) as { agents?: ConnectedAgent[] }).agents ?? [];
}

/** A new agent link for the whole account, shown once; older ones keep working until revoked. */
export function mintAgentLink(): Promise<{ id: string; token: string; created_at: string }> {
  return sessionPost('/api/v1/agents/link', {});
}

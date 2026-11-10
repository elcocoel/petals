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
  Spec,
  View,
} from '@petal/core/types';
import type { BenchLandscape } from '../landscape/land.ts';
import type { ConnectedAgent } from './agents.ts';
import type { Catalogue, Settings } from './composer-options.ts';
import type { ListedConversation, ListedProject } from './conversation-list.ts';
import { decodeDraft } from './draft.ts';
import type { ElsewhereRead } from './elsewhere.ts';
import type { PayToken, TopUp } from './intents.ts';
import type { Job } from './jobs.ts';
import {
  NEAR_SOCIAL_API,
  type PetalsProfile,
  type SocialProfile,
  socialProfile,
} from './near-social.ts';
import type { Credit, PayInfo } from './pay.ts';
import type { PersonView } from './person-view.ts';
import type { EntryDraft, Prepared, Published } from './publish.ts';
import { readSse } from './sse.ts';
import type { Tip } from './tip.ts';

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

/** A person's projects: the server keeps them as folders (004-workspace, W4). No answer is none. */
export async function listProjects(): Promise<ListedProject[]> {
  const res = await fetch('/api/v1/folders');
  if (!res.ok) return [];
  const json = (await res.json()) as { folders?: ListedProject[] };
  return json.folders ?? [];
}

/** A new project, at the top level, by the name given. Null if the server said no. */
export async function newProject(name: string): Promise<ListedProject | null> {
  const res = await fetch('/api/v1/folders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { folder?: ListedProject };
  return json.folder ?? null;
}

/** The person's archived conversations, newest first (GET ?hidden=1). No answer is none. */
export async function listArchived(): Promise<ListedConversation[]> {
  const res = await fetch('/api/v1/conversations?hidden=1');
  if (!res.ok) return [];
  const json = (await res.json()) as { conversations?: ListedConversation[] };
  return json.conversations ?? [];
}

/** Archives a conversation, or brings it back with false. True when the server took it. */
export async function archiveConversation(id: string, archived: boolean): Promise<boolean> {
  const res = await fetch(`/api/v1/conversations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hidden: archived }),
  });
  return res.ok;
}

/** Deletes a conversation for good. Null when it's gone; otherwise the server's reason. */
export async function deleteConversation(id: string): Promise<string | null> {
  const res = await fetch(`/api/v1/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (res.ok) return null;
  const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return json?.error?.message ?? `The server said ${res.status}.`;
}

/** Puts a conversation in a project, or in none with null. True when the server took it. */
export async function moveConversation(id: string, project: string | null): Promise<boolean> {
  const res = await fetch(`/api/v1/conversations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ folder: project }),
  });
  return res.ok;
}

/**
 * A view's spec from its /d/<sha> address: the server answers it with the draft's own address, /draft?spec=,
 * which holds the spec. Only that address is read here; the page it leads to isn't.
 */
export async function readDrawingSpec(sha: string): Promise<Spec | null> {
  const res = await fetch(`/d/${encodeURIComponent(sha)}`);
  void res.body?.cancel();
  const param = res.ok ? new URL(res.url).searchParams.get('spec') : null;
  const read = param ? decodeDraft(param) : null;
  return read?.ok ? read.spec : null;
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

/**
 * The flower's SVG for a spec, given as JSON text, in the person's view (viewmodels/usePersonView.ts).
 * Throws with the reason when it can't be drawn.
 */
export async function drawFlower(specJson: string, view: View): Promise<Drawn> {
  const res = await fetch('/api/v1/render', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: `{"spec":${specJson},"include_svg":true,"include_reading":true,"view":${JSON.stringify(view)}}`,
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

/**
 * Keeps the person's view (PUT /api/v1/me/view), checked against view/v1 by the server. Only a person
 * signed in has one to keep. Throws with the server's reason when it's refused.
 */
export async function saveView(view: View): Promise<PersonView> {
  const res = await fetch('/api/v1/me/view', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ view }),
  });
  const json = (await res.json().catch(() => ({}))) as Partial<PersonView> & {
    error?: { message: string };
  };
  if (res.ok && json.view && json.hash) return { view: json.view, hash: json.hash };
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

/** The person's profile as Petals keeps it (GET /api/v1/me/profile); null when Petals has none yet. */
export async function readMyProfile(): Promise<PetalsProfile | null> {
  const res = await fetch('/api/v1/me/profile');
  if (!res.ok) throw new Error(`Petals answered ${res.status}`);
  return ((await res.json()) as { profile?: PetalsProfile | null }).profile ?? null;
}

/** Keeps the whole profile in Petals (PUT /api/v1/me/profile, as { profile }); throws with the server's reason. */
export async function saveMyProfile(profile: PetalsProfile): Promise<PetalsProfile | null> {
  const res = await fetch('/api/v1/me/profile', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile }),
  });
  const json = (await res.json().catch(() => null)) as {
    profile?: PetalsProfile | null;
    error?: { message?: string };
  } | null;
  if (!res.ok) throw new Error(json?.error?.message ?? `Petals answered ${res.status}`);
  return json?.profile ?? null;
}

/** What NEAR Social's indexer did with one transaction (GET /v1/tx/{hash}); null when it can't say. */
export async function readSocialTx(hash: string): Promise<unknown> {
  const res = await fetch(`${NEAR_SOCIAL_API}/v1/tx/${encodeURIComponent(hash)}`);
  if (!res.ok) return null;
  return res.json();
}

/** Whether FastFS serves a stored file yet. Asked with a fresh query each time: its CDN keeps a 404. */
export async function fastfsServes(url: string, fresh: string): Promise<boolean> {
  const res = await fetch(`${url}?v=${encodeURIComponent(fresh)}`);
  return res.ok;
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

/**
 * The Power Map's data, in the visitor's view, for a page that draws the map inside itself: the landing's
 * map (viewmodels/useLandingMap.ts). It's the site's own route, GET /map/data, not the server's.
 */
export async function readPowerMap(): Promise<BenchLandscape | { error: string }> {
  const res = await fetch('/map/data');
  return (await res.json()) as BenchLandscape | { error: string };
}

/** The person's tip and the price's scale for it (GET /api/v1/me/tip), or null: not signed in. */
export async function readTip(): Promise<Tip | null> {
  const res = await fetch('/api/v1/me/tip');
  if (!res.ok) return null;
  return (await res.json()) as Tip;
}

/** Keeps the person's tip (PUT /api/v1/me/tip). Throws with the server's reason when it's refused. */
export async function saveTip(percent: number): Promise<Tip> {
  const res = await fetch('/api/v1/me/tip', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tip_percent: percent }),
  });
  const json = (await res.json().catch(() => ({}))) as Partial<Tip> & {
    error?: { message: string };
  };
  if (res.ok && typeof json.tip_percent === 'number') return json as Tip;
  throw new Error(json.error?.message ?? `HTTP ${res.status}`);
}

/** The models and what each turn of them costs, measured (GET /api/v1/catalogue), or null. */
export async function readCatalogue(): Promise<Catalogue | null> {
  const res = await fetch('/api/v1/catalogue');
  if (!res.ok) return null;
  return (await res.json()) as Catalogue;
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

/** What a person can pay with through NEAR Intents: every token and chain 1Click swaps. Empty on no answer. */
export async function readPayTokens(): Promise<PayToken[]> {
  const res = await fetch('/api/v1/pay/tokens', { cache: 'no-store' });
  if (!res.ok) return [];
  return ((await res.json()) as { tokens?: PayToken[] }).tokens ?? [];
}

/** A deposit address for `usd` dollars of credit, paid in `origin_asset`; what can't be swapped goes to `refund_to`. */
export async function startTopUp(body: {
  usd: number;
  origin_asset: string;
  refund_to: string;
}): Promise<TopUp> {
  return (await sessionPost<{ top_up: TopUp }>('/api/v1/pay/intents', body)).top_up;
}

/** Where a top-up stands. Once it has landed, the dollars are on the person's credit. */
export async function readTopUp(deposit: string): Promise<TopUp | null> {
  const res = await fetch(`/api/v1/pay/intents/${encodeURIComponent(deposit)}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return ((await res.json()) as { top_up?: TopUp }).top_up ?? null;
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

/** Ends one of the person's agents by its name (SYSTEMS): it leaves the list, and its waits are refused. */
export function disconnectAgent(
  name: string,
): Promise<{ disconnected: { name: string; at: string } }> {
  return sessionPost('/api/v1/agents/disconnect', { name });
}

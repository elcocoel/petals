// The adapter: the one place the browser talks to Petal's API (design/frontend-foundation.md, MVVM+).
// Everything else gets plain values and agent events, so views and ViewModels hold no URLs, no status
// codes and no `fetch`. layers.test.ts names this file as the only one in lib/ allowed to call it.

import type { Blocs } from '@petal/core';
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
import type { Proposal } from '@petal/core/wedge/votes';
import type { BenchLandscape } from '../landscape/land.ts';
import type { ConnectedAgent } from './agents.ts';
import type { AnnotationRow } from './claim-lines.ts';
import type { Catalogue, Settings } from './composer-options.ts';
import type { ListedConversation, ListedProject } from './conversation-list.ts';
import { decodeDraft } from './draft.ts';
import type { ElsewhereRead } from './elsewhere.ts';
import type { PayToken, TopUp } from './intents.ts';
import type { Job } from './jobs.ts';
import type { MapClaims } from './map-claims.ts';
import type { LayerCard } from './map-layers.ts';
import type { SearchBody } from './map-search.ts';
import {
  NEAR_SOCIAL_API,
  type PetalsProfile,
  type SocialProfile,
  socialProfile,
} from './near-social.ts';
import type { Credit, PayInfo } from './pay.ts';
import type { PersonView } from './person-view.ts';
import type { ProvenWallet, UsageCall } from './profile-view.ts';
import type { EntryDraft, Prepared, Published } from './publish.ts';
import { readSse } from './sse.ts';
import type { Tip } from './tip.ts';
import type { MapValue } from './value-view.ts';

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
/**
 * Where a map's flower is drawn (GET /api/v1/maps/:id, its view_url: /d/<sha> or /f/<id>), so the workspace
 * can open it when a petal of it is clicked on its map (#78). Null when the map isn't there.
 */
export async function readMapDrawing(map: string): Promise<string | null> {
  const res = await fetch(`/api/v1/maps/${encodeURIComponent(map)}`);
  if (!res.ok) return null;
  const json = (await res.json()) as { map?: { view_url?: string | null } };
  return json.map?.view_url ?? null;
}

/** What a signed-in person kept about a map and can publish (SYSTEMS, 12 Nov: GET /api/v1/publish/data). */
export interface PublishableData {
  about: string;
  name: string | null;
  /** the claims that can go on the shared map now */
  ready: number;
  /** the rest, each with why it stays private */
  private: {
    id: string;
    subject: string;
    verb: string;
    why: string;
    name?: string;
    source?: PublishSource | null;
    confidence?: number | null;
  }[];
  /** each one that can go, in the order it would (Elco, 12 Nov: "Let me look first") */
  claims?: {
    id: string;
    subject: string;
    name: string;
    source?: PublishSource | null;
    /** 0 to 1, or null when the model that scores it is off */
    confidence?: number | null;
  }[];
  /** already on the shared map */
  published: number;
  /** what the press would add, per layer and kind, and what can't go yet and why (SYSTEMS, wave 3) */
  adds?: PublishAdds[];
}

/** One layer's share of a publish: Insights · Names · 35, or Readings, which can't go yet, and why. */
export interface PublishAdds {
  layer: string;
  kind: string;
  verb?: string;
  label: string;
  count: number;
  goes: boolean;
  why?: string;
}

/** Where a name comes from: the proposal that declares it, with its words, or a transaction. */
export interface PublishSource {
  kind: 'proposal' | 'transaction' | string;
  /** the proposal's or transaction's ref, else the address it was read at */
  ref: string | null;
  quote?: string;
  /** where it can be read */
  url?: string;
}

export async function readPublishable(map: string): Promise<PublishableData | null> {
  const res = await fetch(`/api/v1/publish/data?map=${encodeURIComponent(map)}`);
  if (!res.ok) return null;
  return (await res.json()) as PublishableData;
}

/** The message the wallet signs for it, good for five minutes (POST /api/v1/publish/data/prepare). */
export interface PublishPrepared {
  sha256: string;
  message: string;
  nonce: string;
  recipient: string;
  expires_at: string;
}

export async function preparePublishable(map: string): Promise<PublishPrepared> {
  const res = await fetch('/api/v1/publish/data/prepare', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ map }),
  });
  if (!res.ok) throw new Error(await failureOf(res));
  return (await res.json()) as PublishPrepared;
}

/** Sends the signed proof: the claims go on the shared map in the person's name. 401: another wallet signed. */
export async function publishPublishable(
  sha256: string,
  proof: unknown,
): Promise<
  { published: number; by: string; map_url: string } | { refused: number; message: string }
> {
  const res = await fetch('/api/v1/publish/data', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sha256, proof }),
  });
  if (!res.ok) return { refused: res.status, message: await failureOf(res) };
  return (await res.json()) as { published: number; by: string; map_url: string };
}

async function failureOf(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? `HTTP ${res.status}`;
}

/** What Petals' own mapping says about a map's accounts (GET /api/v1/maps/:id/claims), or null. */
export async function readMapClaims(map: string): Promise<MapClaims | null> {
  const res = await fetch(`/api/v1/maps/${encodeURIComponent(map)}/claims`);
  if (!res.ok) return null;
  return (await res.json()) as MapClaims;
}

/**
 * Search over the map (GET /api/v1/search, #105): maps, with the proposals and what Petals' mapping says that
 * matched under them. Without the reranker unless `ordered` (about 0.35 s in place of 2 to 3 s). Null when it
 * can't answer.
 */
export async function searchMap(q: string, ordered: boolean): Promise<SearchBody | null> {
  const ask = new URLSearchParams({ q, kinds: 'map,proposal,claim', limit: '8' });
  if (!ordered) ask.set('rerank', '0');
  const res = await fetch(`/api/v1/search?${ask}`);
  if (!res.ok) return null;
  return (await res.json()) as SearchBody;
}

/**
 * Search in /docs (Elco, 12 Nov: "the search function"): the pages /docs renders, each by its file's path in the
 * repository, with the sections that matched. The same quick and ordered asks as the map's.
 */
export async function searchDocs(q: string, ordered: boolean): Promise<SearchBody | null> {
  const ask = new URLSearchParams({ q, kinds: 'doc', limit: '8' });
  if (!ordered) ask.set('rerank', '0');
  const res = await fetch(`/api/v1/search?${ask}`);
  if (!res.ok) return null;
  return (await res.json()) as SearchBody;
}

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
  return putView('/api/v1/me/view', view);
}

/** The server's refusal of a visitor's own view (401): theirs is kept by its hash instead (keepView). */
export class SignInFirst extends Error {}

/**
 * Keeps a visitor's view by its hash (PUT /api/v1/views; Elco, 12 Nov, walk 3: "is it expensive do allow me to
 * change here too?"): nobody's, so their browser keeps the hash and the pages ask for it. Throws the reason.
 */
export async function keepView(view: View): Promise<PersonView> {
  return putView('/api/v1/views', view);
}

async function putView(path: string, view: View): Promise<PersonView> {
  const res = await fetch(path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ view }),
  });
  const json = (await res.json().catch(() => ({}))) as Partial<PersonView> & {
    error?: { message: string };
  };
  if (res.ok && json.view && json.hash) return { view: json.view, hash: json.hash };
  const reason = json.error?.message ?? `HTTP ${res.status}`;
  throw res.status === 401 ? new SignInFirst(reason) : new Error(reason);
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
/**
 * The accounts two groups share (#87), from the relations index, by each one's reading snapshot: each account on
 * the first side, as the index names it and as its address alone. Empty when it can't be read.
 */
export async function readShared(a: string, b: string): Promise<string[]> {
  const q = new URLSearchParams({ group_a: a, group_b: b, limit: '500' });
  const res = await fetch(`/api/v1/relations/shared?${q}`).catch(() => null);
  if (!res?.ok) return [];
  const json = (await res.json().catch(() => ({}))) as { accounts?: { account_a?: string }[] };
  // the index names an account with its chain (eip155:1:0x…); a petal by the address alone, so both are given
  return (json.accounts ?? []).flatMap((x) =>
    x.account_a ? [x.account_a, x.account_a.slice(x.account_a.lastIndexOf(':') + 1)] : [],
  );
}

/** A map's card (GET /api/v1/maps/:id), for its layers in the map's Information box: null when it can't be read. */
export async function readMapCard(map: string): Promise<LayerCard | null> {
  const res = await fetch(`/api/v1/maps/${encodeURIComponent(map)}`).catch(() => null);
  if (!res?.ok) return null;
  const json = (await res.json().catch(() => ({}))) as { map?: LayerCard };
  return json.map ?? null;
}

/** What a map's token is worth (#91), from its card: null when it has none, or it can't be read. */
export async function readMapValue(map: string): Promise<MapValue | null> {
  const res = await fetch(`/api/v1/maps/${encodeURIComponent(map)}`).catch(() => null);
  if (!res?.ok) return null;
  const json = (await res.json().catch(() => ({}))) as { map?: { value?: MapValue | null } };
  return json.map?.value ?? null;
}

/**
 * A map's voting blocs (#94), as SYSTEMS finds them over a period (GET /api/v1/maps/:id/blocs): accounts that vote
 * alike, biggest bloc first, members as petal ids; the period it used (from/to ISO, the last 90 days unless asked).
 * Null when it has none, or they can't be read.
 */
export async function readMapBlocs(
  map: string,
  period?: { from?: string; to?: string },
): Promise<Blocs | null> {
  const q = new URLSearchParams(
    Object.entries(period ?? {}).filter((e): e is [string, string] => typeof e[1] === 'string'),
  ).toString();
  const res = await fetch(`/api/v1/maps/${encodeURIComponent(map)}/blocs${q ? `?${q}` : ''}`).catch(
    () => null,
  );
  if (!res?.ok) return null;
  const json = (await res.json().catch(() => null)) as Blocs | null;
  return json && Array.isArray(json.blocs) ? json : null;
}

/** A map's proposals with every vote (#93), as SYSTEMS reads them (proposals/v1): null when it has none. */
export async function readMapProposals(map: string): Promise<Proposal[] | null> {
  const res = await fetch(`/api/v1/maps/${encodeURIComponent(map)}/proposals`).catch(() => null);
  if (!res?.ok) return null;
  const json = (await res.json().catch(() => ({}))) as { proposals?: { proposals?: Proposal[] } };
  return json.proposals?.proposals ?? null;
}

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

/** A picture Petals keeps (GET /api/v1/media/<sha256>.<ext>), as bytes, to store on FastFS when publishing. */
export async function readKeptPicture(
  url: string,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; mime: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`the picture couldn't be read (${res.status})`);
  return {
    bytes: new Uint8Array(await res.arrayBuffer()),
    mime: res.headers.get('content-type') ?? 'image/webp',
  };
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

/** Every model call charged to the person (usage/v1), newest first, and what they came to; null for nobody. */
export async function readMyUsage(): Promise<{
  usage: UsageCall[];
  totals: { charged_usd: number };
} | null> {
  const res = await fetch('/api/v1/me/usage', { cache: 'no-store' });
  if (!res.ok) return null;
  return (await res.json()) as { usage: UsageCall[]; totals: { charged_usd: number } };
}

/** An EVM wallet's proof (EIP-191 personal_sign of the text the challenge gave), as /auth/verify and /me/wallets take it. */
export interface EvmProof {
  type: 'eip191';
  address: string;
  message: string;
  signature: string;
}

/** The text an EVM wallet signs, Sign-In with Ethereum, for this address on the chain it's on (SYSTEMS). */
export const evmChallenge = (address: string, chainId: number) =>
  sessionPost<{ message: string; nonce: string; expires_at: string }>('/api/v1/auth/challenge', {
    chain: 'eip155',
    address,
    chain_id: chainId,
  });

/** Signs in with an EVM wallet: a new person, or the one this wallet already belongs to. */
export async function verifyEvm(proof: EvmProof): Promise<void> {
  await sessionPost('/api/v1/auth/verify', { network: 'eip155', proof });
}

/** Another wallet for the person signed in (POST /api/v1/me/wallets): its proof, as signing in sends one. */
export function addMyWallet(
  network: string,
  proof: Nep413Proof | EvmProof,
): Promise<{ wallets: ProvenWallet[] }> {
  return sessionPost('/api/v1/me/wallets', { network, proof });
}

/** The wallets the person proved by signing in, as GET /api/v1/me lists them; null for nobody or no answer. */
export async function readWallets(): Promise<ProvenWallet[] | null> {
  const res = await fetch('/api/v1/me', { cache: 'no-store' });
  if (!res.ok) return null;
  return ((await res.json()) as { wallets?: ProvenWallet[] }).wallets ?? [];
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

/** Everything the person and their agents keep about accounts, from all their projects; null for a visitor. */
export async function readMyAnnotations(): Promise<AnnotationRow[] | null> {
  const res = await fetch('/api/v1/me/annotations', { cache: 'no-store' });
  if (!res.ok) return null;
  return ((await res.json()) as { annotations?: AnnotationRow[] }).annotations ?? [];
}

/**
 * Keeps what the person says about an account, as theirs: in a conversation's project when there is one
 * (a run's id or another door's), or as their own, in none.
 */
export function addMyAnnotations(body: {
  annotations: unknown[];
  conversation?: string;
}): Promise<{ added: number; existed: number; ids: string[] }> {
  return sessionPost('/api/v1/me/annotations', body);
}

/** The person's moves on one of their jobs (swarm.md, step 3): stop it, send it again, or hand it to an agent. */
export function moveJob(
  job: string,
  move: 'stop' | 'retry' | 'hand-over',
  to?: string,
): Promise<{ job: Partial<Job> & { id: string } }> {
  return sessionPost(`/api/v1/jobs/${encodeURIComponent(job)}/${move}`, to ? { to } : {});
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

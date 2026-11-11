// The tool contract types (packages.md, @petal/tools). Re-exported by index.ts; frozen at
// packages/v1, so their shapes do not change here.

import type {
  Claim,
  Progress,
  QuoteRequest,
  QuoteResult,
  ToolError,
  View,
} from '@petal/core/types';
import type { FreshGate, InputModule, SnapshotStore } from '@petal/inputs';
import type { Rpc } from '@petal/near/auth';
import type { MapReader, MapWriter } from '@petal/near/map';
import type { JobRow } from '@petal/store';
import type { Limits } from './limits.ts';
import type { LiveHub } from './live.ts';
import type { SearchModel } from './search-model.ts';

/** A JSON Schema (draft 2020-12) as a plain object; MCP takes it through fromJsonSchema(). */
export type JSONSchema = Record<string, unknown>;

/** Runtime configuration, usually read from the environment (.env.example). */
export interface Config {
  /** repo root; fixtures/ and .petal/ are found from here */
  root: string;
  /** default <root>/fixtures */
  fixturesDir?: string;
  /** local state: cache, mirror, runs, attestations. Default <root>/.petal */
  stateDir?: string;
  /**
   * additive: where private data lives (PETAL_DATABASE_URL): postgres://user@host:port/db, with the
   * password in the file PETAL_DATABASE_PASSWORD_FILE names. Unset: SQLite in the state folder.
   */
  databaseUrl?: string;
  /** the shared map; null or absent: fakeMap plus the local mirror */
  map?: {
    network: 'testnet' | 'mainnet';
    receiver: string;
    writer?: string;
    /** the writer's function-call key file, outside the repo */
    keyFile?: string;
    trustedWriters: string[];
  } | null;
  /** NEAR RPC for view_access_key and sends */
  rpcUrl?: string;
  fastnearApiKey?: string;
  nearAiApiKey?: string;
  llmDailyUsd?: number;
  payoutAccount?: string;
  /** a shared blob store, so snapshots outlive one server (BLOB_READ_WRITE_TOKEN) */
  blobToken?: string;
  /** public base URL, for view_url, sign_url, body_url */
  apiBase?: string;
  repoUrl?: string;
  /** live end-to-end: NEAR AI Cloud, testnet map, live 1Click dry quote */
  live?: boolean;
  /** fakes everywhere (fake map, recorded quote, fake RPC): tests and the keyless judge path */
  fake?: boolean;
  /** additive (T300): overrides the defaults and PETAL_* variables of limits.ts */
  limits?: Partial<Limits>;
  /**
   * additive (PETAL_PUBLIC=1): a public site. It does no work for a visitor that reaches outside it:
   * no chain reads, web reads, searches, model calls or chain writes. A person's own agent does those
   * on their machine and posts what it made. Tools marked onTheirMachine refuse, with
   * not_on_this_site, and the shared map is the copies of published rows the site ships. Since 9 Nov
   * (TGT-030, amended for the hackathon), Petals' own agent runs on it, on NEAR AI, for a person who pays
   * for it in NEAR or holds an invite.
   */
  public?: boolean;
  /** additive (9 Nov, PETAL_BRAIN_DIR): the brain/ the site serves, a copy of the repo that follows main */
  brainDir?: string;
  /**
   * additive (11 Nov, #105, PETAL_SEARCH_URL): where search's models answer, Qwen3-Embedding and Qwen3-Reranker
   * behind oMLX on Elco's Mac (coordinator/search_model_up.sh). Unset: search_petals says it has no model.
   */
  searchUrl?: string;
}

/** Who is calling and through what. A door sets this; a caller can't name itself. */
export interface Caller {
  /** the session's subject: a person id or an anonymous handle. None: nobody signed in */
  subject?: string | null;
  /** additive (TGT-005): what authorised this call, kept with what it writes: `wallet:<hash>` */
  credential?: string | null;
  /** http, mcp, cli or site */
  door?: string;
  /** what the app at the other end calls itself, when its request says so (T404). Its own words */
  client?: string;
  /**
   * additive (10 Nov, annotation-layer.md): who answers for what this caller writes, as a claim names them:
   * the signed-in person's account (`near:mainnet:alice.near`). Set by a door that knows it.
   */
  by?: string | null;
}

/** What every tool run gets: store, modules, map reader/writer, rpc, quotes, progress. */
export interface ToolContext {
  config: Config;
  store: SnapshotStore;
  modules: Record<string, InputModule>;
  map: { reader: MapReader; writer: MapWriter | null; receiver: string; trustedWriters: string[] };
  rpc: Rpc;
  quote(req: QuoteRequest): Promise<QuoteResult>;
  onProgress?: Progress;
  now(): Date;
  /** additive (T194): only the exploration tools read it */
  caller?: Caller;
  /** additive (T300): whoever reads fresh data through this context takes turns here. None: no limit */
  fresh?: FreshGate;
  /** additive (T404): told when an exploration changes, for a page that's following it */
  live?: LiveHub;
  /** additive (9 Nov, agent-house): told when a job is reported, so Petals' agent takes it up at once */
  onJobReported?: (job: JobRow) => void;
  /**
   * additive (10 Nov, one-source.md step 2): the viewer's view, the glasses every drawing without a view of
   * its own is drawn through: the person's, or the default. A flower's own choices never draw it.
   */
  view?: View;
  /**
   * additive (11 Nov, annotation-layer.md step 6): the viewer's own names (named annotations), which a
   * drawing for them shows on the petals they name (core's namePieces). Set by a door that knows the
   * person, never taken from what a caller sends; a visitor has none.
   */
  names?: readonly Claim[];
  /** additive (11 Nov, #105): search's models, when a test brings its own; else Config.searchUrl's */
  searchModel?: SearchModel;
}

export type Tool<I, O> = {
  name: string;
  input: JSONSchema;
  output: JSONSchema;
  run(i: I, ctx: ToolContext): Promise<O | ToolError>;
};

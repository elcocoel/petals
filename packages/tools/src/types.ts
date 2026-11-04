// The tool contract types (packages.md, @petal/tools). Re-exported by index.ts; frozen at
// packages/v1, so their shapes do not change here.
import type { Progress, QuoteRequest, QuoteResult, ToolError } from '@petal/core/types';
import type { InputModule, SnapshotStore } from '@petal/inputs';
import type { Rpc } from '@petal/near/auth';
import type { MapReader, MapWriter } from '@petal/near/map';

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
  /** public base URL, for view_url, sign_url, body_url */
  apiBase?: string;
  repoUrl?: string;
  /** live end-to-end: NEAR AI Cloud, testnet map, live 1Click dry quote */
  live?: boolean;
  /** fakes everywhere (fake map, recorded quote, fake RPC): tests and the keyless judge path */
  fake?: boolean;
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
}

export type Tool<I, O> = {
  name: string;
  input: JSONSchema;
  output: JSONSchema;
  run(i: I, ctx: ToolContext): Promise<O | ToolError>;
};

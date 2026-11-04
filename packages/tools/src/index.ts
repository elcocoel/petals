// biome-ignore-all lint/correctness/noUnusedFunctionParameters: stub signatures (T016); delete this line once built
// @petal/tools (W4): one registry, thin doors (HTTP, MCP, CLI in process). Tools: contracts/tools.md.
// Every output carries tools_version; errors are returned as ToolError, never thrown across a door.
import type { McpServer } from '@modelcontextprotocol/server';
import { notImplemented } from '@petal/core';
import type { Progress, QuoteRequest, QuoteResult, ToolError } from '@petal/core/types';
import type { InputModule, SnapshotStore } from '@petal/inputs';
import type { Rpc } from '@petal/near/auth';
import type { MapReader, MapWriter } from '@petal/near/map';
import type { Hono } from 'hono';

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

/** Names and shapes in tools.md. Empty until W4 registers the tools. */
// biome-ignore lint/suspicious/noExplicitAny: a heterogeneous registry (packages.md)
export const registry: Tool<any, any>[] = [];

/** Wires store, modules, map reader/writer, rpc and onProgress from the config. */
export function createContext(cfg: Config): ToolContext {
  return notImplemented('createContext');
}

/** The tool routes in http-api.md, /api/v1/health and /mcp. No agent routes (one-way deps). */
export function httpApp(ctx: ToolContext): Hono {
  return notImplemented('httpApp');
}

/** MCP Streamable HTTP at /mcp, stateless. */
export function mcpServer(ctx: ToolContext): McpServer {
  return notImplemented('mcpServer');
}

/** MCP over stdio, used by `petal mcp`. */
export async function serveStdio(ctx: ToolContext): Promise<void> {
  return notImplemented('serveStdio');
}

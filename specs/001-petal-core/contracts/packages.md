# Contract: package interfaces (for parallel build)

**Version**: packages/v1 | **Owner**: the lead (W0) | Frozen at the end of W0; changes go through the lead and bump the version.

Each workstream owns one directory and builds against these signatures. Dependencies point one way: `core` ← `inputs`, `near` ← `tools` ← `agent` ← `apps/web`, `apps/cli`. Until a dependency is real, use the fake named here. Types come from `@petal/core/types` (generated from the JSON Schemas in this folder).

## `@petal/core` (W1) — no network, no disk

```ts
// schema and identity
export const schemas: { snapshot: object; spec: object; interpretation: object; entry: object; entryV2: object; correction: object };
export function canonicalJson(value: unknown): string;          // RFC 8785
export function sha256Hex(bytes: Uint8Array | string): string;
export function specHash(spec: Spec): string;                    // sha256 of canonicalJson(spec)
export function signedPart(entry: EntryWithoutId): object;       // what id and signature cover, by the entry's version
export function entryId(entryWithoutId: EntryWithoutId): string; // first 24 hex of the signed part

// validation
export function validateSnapshot(x: unknown): Result<Snapshot>;
export function validateSpec(spec: unknown, ctx: { snapshot: Snapshot; capabilities: Capabilities; interpretation?: Interpretation }): Validation;

// counting (FR-025)
export function computeFigures(s: Snapshot, opts: { measure: string; petals?: number; nakamotoThreshold?: number; topK?: number[] }): Figures;
export function selectPetals(s: Snapshot, sel: Spec['selection']): PetalRow[];   // top N + declared tail
export function backerSegments(s: Snapshot, poolId: string): Segment[];          // NEAR: lockup, liquid, 1M+, other
export function compareFigures(a: Snapshot, b: Snapshot, opts: { measure: string; petals?: number }): FigureChanges; // US5, tools.md compare_figures

// primitives (FR-032): the vocabulary and what this build can draw
export const PRIMITIVES: { id: string; status: 'available' | 'unavailable'; by: string[]; note: string }[];
// unavailable primitives are declared, never imitated; validateSpec and renderFlower refuse them

// conventions
export const DEFAULT_CONVENTION: Convention;                      // default/v1 (order: measure_desc, "largest first, clockwise from the top")
export function buildSpec(input: ProposeInput, descriptor: NetworkDescriptor, snapshot: Snapshot): { spec: Spec; changed: string[]; defaults: string[] };

// the recipe (recipe/v1, tools.md propose_spec): buildSpec compiles it, these read it back
export function choicesFromSpec(spec: Spec): ProposeChoices;      // every choice, spelled out
export function recipeOf(spec: Spec, descriptor: NetworkDescriptor): Recipe;  // what it says beyond the defaults
export function recipeHash(recipe: Recipe): string;               // recipe_sha256: no network, snapshot or date
export function diffSpecs(a: Spec, b: Spec): SpecDiff;            // subject, data, design

// rendering (renderer.md)
export function readFlower(spec: Spec, s: Snapshot): Reading;     // the facts a drawing needs, no pixels (reading/v1)
export function readingHash(reading: Reading): string;
export const SKINS: Record<string, Skin>;                         // a reading becomes a drawing; 'render/v1'
export function renderFlower(spec: Spec, s: Snapshot, o?: RenderOptions): RenderResult;
// exact decimals, for what counts beside compute_figures (additive, T198)
export function exactValues(rows: { amount?: string; amount_raw?: string }[]): { values: bigint[]; scale: number };
export function formatDecimal(v: bigint, s: number): string;
```

## `@petal/inputs` (W2) — reads public sources and disk

```ts
export interface InputModule {
  descriptor: NetworkDescriptor;                        // id, chain, population, capabilities, live, cost
  resolveAt(at: At, params?: Params): Promise<{ block_height: number; as_of: string }>;
  fetch(at: ResolvedAt, params: Params | undefined, onProgress?: Progress): Promise<Snapshot>;
}
export const modules: Record<string, InputModule>;      // A: near-validators, near-house-of-stake

export interface SnapshotStore {                        // content-addressed, constitution IV
  get(sha256: string): Promise<Snapshot | null>;
  put(s: Snapshot): Promise<{ sha256: string; bytes: number }>;   // canonical bytes, gzip on disk
  lookup(key: { chain: string; population: string; block_height: number }): Promise<string | null>;
  list(networkId?: string): Promise<IndexRow[]>;
}
export function fileStore(dirs: { fixtures: string; cache: string }): SnapshotStore;
export function getSnapshot(req: SnapshotRequest, deps: { store: SnapshotStore; map?: MapIndex; onProgress?: Progress; modules?: Record<string, InputModule> }): Promise<SnapshotResult>; // modules: v1.1, additive (defaults to the built-in registry); InputModule.keyFor: v1.1, additive, ratified 5 Nov (keeps two targets of one module apart)

// offline import of step 1 and step 2 data into fixtures (scripts/import-spike-data.ts)
export function importSpike(path: string, rules: GroupingRules): Promise<Snapshot>;
```

RPC pool: dRPC first, then FastNEAR, then Shitzu (with a User-Agent), paced to their measured limits. Reads use `finality: "final"` or a fixed `block_id`.

## `@petal/near` (W3) — NEAR as a platform: the map (FastData), accounts (NEP-413, keys), payments (1Click)

```ts
export interface MapWriter {                            // Petal's writer: function-call key, __fastdata_kv only
  write(entries: Record<string, unknown>): Promise<{ tx_hash: string; block_height: number }>;  // ≤256 keys, ≤256 KiB each
}
export interface MapReader {
  latest(prefix: string, opts?: { writers?: string[]; limit?: number }): Promise<MapRow[]>;
  get(key: string, writer: string): Promise<MapRow | null>;
}
export function fastDataWriter(cfg: { network: 'testnet'; receiver: string; writer: string; keyFile: string }): MapWriter;
export function fastDataReader(cfg: { network: 'testnet' | 'mainnet'; receiver: string }): MapReader;
export function mirror(dir: string, inner: MapWriter): MapWriter;      // keeps a local copy of every write (retention risk)
export function fakeMap(): MapWriter & MapReader;                      // in-memory, for tests and for W4–W6 until W3 lands

export function issueNonce(): { nonce: string; expires_at: string };
export function verifyNep413(proof: Nep413Proof, expect: { message: string; recipient: string }, rpc: Rpc, opts?: { nonces?: NonceStore; allowUnfunded?: boolean }): Promise<{ ok: boolean; reason?: string }>;  // allowUnfunded: sign-in only
// checks the signature, then view_access_key: the key must be a full-access key of account_id

export function quote1Click(req: QuoteRequest): Promise<QuoteResult>;  // dry only (FR-031); a real payment needs explicit approval

export const mapKeys: {                                 // builders for every key in shared-map.md
  spec(id: string): string; snapshot(sha256: string): string; index(caip2: string, population: string, block: number): string;
  label(caip2: string, address: string): string; correction(flowerId: string, id: string): string; vouch(account: string): string;
};
```

Modules: `@petal/near/map`, `@petal/near/auth`, `@petal/near/pay`. NEAR as a *data source* (RPC reads of validators, DAOs) stays in `@petal/inputs`. Writer keys are read from a file outside the repo (`PETAL_WRITER_KEY_FILE`), never from the repo.

`MapRow` = `{ key, value, writer, receiver, tx_hash, block_height, block_timestamp }`.

## `@petal/relations` (T198) — relations between groups, in an index that can be deleted

Additive. `core` ← `relations` ← `tools`. SQLite through `node:sqlite`, no graph engine (SYS-070). Public derived data only.

```ts
export interface SnapshotSource { list(): Promise<{ sha256: string }[]>; get(sha256: string): Promise<Snapshot | null> } // @petal/inputs' SnapshotStore fits
export function stateIndex(stateDir: string): RelationsIndex;     // <stateDir>/index.db, one per process; memory when the folder can't be written
export class RelationsIndex {
  constructor(path: string, opts?: { log?: (line: string) => void });
  answer<T>(source: SnapshotSource, fn: (q: Queries) => T): Promise<T>; // sync with what's stored, then ask; a broken file rebuilds once
  sync(source: SnapshotSource): Promise<void>;                    // first build, or just the snapshots stored since
  rebuild(source: SnapshotSource, onSnapshot?: (s) => void): Promise<RebuildReport>; // a new file, renamed into place
  addSnapshot(sha256: string, s: Snapshot): Promise<void>;
  fingerprint(): Promise<string>;                                 // a hash of every row: same fingerprint, same answers
  readonly skipped: SkippedSnapshot[];
  close(): void;
}
export class Queries {                                            // result shapes: tools.md
  accountGroups(account, { limit? });
  sharedAccounts(groupA, groupB, { limit? });
  relatedGroups(group, { by?: 'count' | 'share', limit? });
  overview({ minShared?, kind?, limit? });
  path(accountA, accountB, { maxDepth?, budget?, includeInferred? });
}
export function groupsOf(s: Snapshot): ProjectedGroup[];          // one snapshot to its groups; pure
```

## `@petal/tools` (W4) — one registry, two adapters

```ts
export type Tool<I, O> = { name: string; input: JSONSchema; output: JSONSchema; run(i: I, ctx: ToolContext): Promise<O | ToolError> };
export const registry: Tool<any, any>[];                // names and shapes in tools.md
export function createContext(cfg: Config): ToolContext; // wires store, modules, map reader/writer, rpc, onProgress
export function httpApp(ctx: ToolContext, o?: { gate?: SessionGate }): Hono; // the tool routes in http-api.md; no agent routes (one-way dependency). `gate`, additive: who a request's session is, from the agent package
export function saveRunStep(ctx: ToolContext, runId: string, spec: Spec): void; // additive (T194): a flower of a run is a step of its exploration
export function mcpServer(ctx: ToolContext): McpServer; // Streamable HTTP at /mcp
export function serveStdio(ctx: ToolContext): Promise<void>; // MCP over stdio, used by `petal mcp`
```

## `@petal/agent` (W5) — Petal's own agent on NEAR AI Cloud

```ts
export function runAgent(input: { messages: ChatMessage[]; draft?: { spec?: Spec; entry?: Partial<Entry> } },
                         deps: { tools: ToolContext; llm: LlmClient; budget: Budget }): AsyncIterable<AgentEvent>;
export function nearAiClient(cfg: { apiKeyEnv: 'NEAR_AI_API_KEY'; model: string; fallbacks: string[] }): LlmClient;
export function recordedClient(transcriptFile: string): LlmClient;   // replays a recorded run: tests and judges with no key
export const SYSTEM_PROMPT: string;                     // shared source with skill/petal/SKILL.md

export interface RunStore {                             // runs you can leave and come back to (F4)
  create(input: ChatInput): Promise<string>;            // run_id
  append(runId: string, e: AgentEvent): Promise<void>;
  get(runId: string): Promise<Run | null>;              // status, events, flower, messages
  saveThread?(runId: string, thread: LlmMessage[]): Promise<void>; // T166: the full conversation for follow-ups, compacted near the model's window
  thread?(runId: string): Promise<LlmMessage[] | null>;
}
export function fileRunStore(dir: string): RunStore;    // .petal/runs/ locally
export function agentRoutes(deps: { tools: ToolContext; llm: LlmClient; budget: Budget; runs: RunStore }): Hono;
// /api/v1/agent/chat, /api/v1/agent/runs/:id, /api/v1/attestations/:sha256
export function petalApp(cfg: Config): Hono;            // httpApp(ctx) + agentRoutes(...): what the web app and `pnpm api` mount
```

`AgentEvent` is the SSE event list in [http-api.md](./http-api.md#agent-chat-sse). The chat route lives here, not in `@petal/tools`, because the agent imports the tools; putting it in `httpApp` would make a package cycle.

## `apps/web` (W6)

Mounts `petalApp` and consumes the HTTP API and `@petal/core` (`renderFlower` for instant client redraws; the server's `render_sha256` stays the reference). Until W4 and W5 land, it reads `fixtures/` through a mock of the same routes.

## The five doors

One tools core (`@petal/tools` registry), several thin doors. No door adds logic of its own.

| Door | Where | Owner | For |
|---|---|---|---|
| HTTP API | `httpApp` + `agentRoutes` = `petalApp` | W4, W5 | the web app, any agent, judges |
| Agent Skill | `skill/petal/SKILL.md` (Agent Skills format, like `near/agent-skills`) | W7 | the main bring-your-own-agent door |
| MCP server | `mcpServer`, `serveStdio` | W4 | MCP clients (Claude Code, Codex) |
| CLI | `apps/cli`, bin `petal` | W7 | judges and the thesis track: re-runnable evidence (`petal figures near-validators`) |
| IronClaw package | `skill/ironclaw/`: an extension manifest wrapping `/mcp` over HTTP, plus the skill | W7 | a hedge; never on the demo's critical path |

## `apps/cli` (W7)

Thin. Calls the tool registry in process (no server needed) and prints JSON. Subcommands: `networks`, `snapshot`, `describe`, `figures`, `compare`, `propose`, `validate`, `render`, plus `mcp` (stdio, via `serveStdio`) and `api` (`petalApp` on :8787).

## `skill/` (W7)

Consumes only the HTTP API (or MCP where configured). `skill/petal/SKILL.md` in the Agent Skills format with a short `README` on installing it in Claude Code, Codex and IronClaw (`~/.ironclaw/skills/`); `skill/ironclaw/` holds the IronClaw extension manifest.

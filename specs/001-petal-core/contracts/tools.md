# Contract: Petal tools

**Version**: tools/v1 | **Owner**: workstream W4 (Tools) | **Consumers**: Petal's agent (in process), the MCP server, the HTTP API, the skill

One tools core, five thin doors ([packages.md](./packages.md#the-five-doors)): the HTTP API, the Agent Skill, the MCP server, the CLI and the IronClaw package. Each tool is a pure async function `(input) => output` registered once in `packages/tools/src/registry.ts`, with its input and output JSON Schemas. The MCP server lists the same names and schemas; the HTTP API maps each tool to one route ([http-api.md](./http-api.md)); the CLI calls the registry in process; the skill and the IronClaw package go through HTTP or MCP. Petal's agent calls the registry directly, without HTTP. No door adds logic of its own.

The agent interprets; the tools count (FR-025). Any number an agent quotes must come from `compute_figures` or `describe_snapshot`.

## Shared rules

- Inputs and outputs are JSON. Amounts are decimal strings. Shares are numbers rounded to 6 decimals.
- Every output carries `"tools_version": "tools/v1"`.
- Errors are returned, not thrown across the door: `{ "error": { "code", "message", "hint", "retry_after_s"? } }`. Codes: `bad_input`, `not_found`, `cannot_read`, `source_failed`, `rate_limited`, `invalid_spec`, `unauthorised`, `budget_exhausted`, `internal`.
- Tools that can take time (`get_snapshot` on a live pull) report progress through an optional `onProgress(event)` callback in process, `notifications/progress` in MCP, and SSE in HTTP. Event: `{ stage, message, done?, total? }`.
- Tools never ask for a key from the caller. Viewing and making need nothing (FR-030); only `publish_flower` needs a NEP-413 proof.

## Tools

| Tool | Phase | Side effects |
|---|---|---|
| `list_networks` | A | none |
| `get_network` | A | none |
| `get_snapshot` | A | may fetch from public sources; writes the cache; may write a fingerprint to the map |
| `describe_snapshot` | A | none |
| `compute_figures` | A | none |
| `propose_spec` | A | none |
| `validate_spec` | A | none |
| `render_flower` | A | none (writes a render cache) |
| `list_flowers` | A | reads the map and fixtures |
| `get_flower` | A | reads the map and fixtures |
| `prepare_publish` | A | issues a nonce |
| `publish_flower` | A | writes to the shared map on NEAR (testnet) |
| `quote_payment` | A (dry) | calls NEAR Intents 1Click with `dry: true`; no money moves (FR-031) |
| `find_documents` | B | fetches public docs and forum pages for citations |
| `get_labels` | B | reads the label layer |
| `compare_figures` | B | none |
| `prepare_correction` | B | issues a nonce |
| `submit_correction` | B | writes a correction request to the shared map (FR-022) |

### list_networks

Input: `{ "query"?: string }`
Output: `{ "networks": Network[], "cannot_read_hint": string }` where `Network` is the descriptor in [data-model.md](../data-model.md#network) (`id`, `chain`, `population`, `kind`, `title`, `params` schema, `capabilities`, `live`, `cost`).
Phase A networks: `near-validators` (stored delegator crawl + live validator set), `near-house-of-stake` (live, ~10 calls). Phase B adds `near-sputnik-dao` (live, any DAO by account), `bitcoin-mining-pools`, `ethereum-staking`, `ethereum-miners-premerge` (fixtures from step 1).

### get_network

Input: `{ "id": string, "params"?: object }`
Output: `{ "network": Network, "mapped": [{ "sha256", "as_of", "block_height", "final", "where": "fixture" | "cache" | "map" }] }`
Errors: `not_found`, `cannot_read` (with `hint` naming what Petal can read instead).

### get_snapshot

Input: `{ "network": string, "params"?: object, "at"?: "latest" | ISO date | { "block_height": int }, "fresh"?: boolean }`
Behaviour: resolve `at` to a block; look in fixtures, then cache, then the map index; if found and final, return it with `reused: true` (FR-028). Otherwise fetch through the input module, canonicalise, hash, store, and (when final and the map is configured) write `petal/v1/snapshot/<sha256>` and the index key. `fresh: true` skips reuse only for non-final data.
Output: `{ "sha256", "reused": boolean, "where", "network", "snapshot": { "as_of", "block_height", "final" }, "coverage", "sources", "counts": { "participants", "holdings", "relationships", "events" }, "body_url" }`. The body itself is never returned to an agent (step 1 lesson: never let an agent read a raw dump). Use `describe_snapshot` and `compute_figures`.
Errors: `source_failed` (lists which source; partial snapshots are marked `coverage.partial`), `rate_limited`, `cannot_read`.

### describe_snapshot

Input: `{ "sha256": string, "top"?: int (default 10, max 50) }`
Output: what an agent needs to choose a mapping, like the step 2 catalog: `{ "measures": [{ "id", "unit", "total" }], "kinds_present", "segment_options": [{ "by", "label" }], "line_options", "has_fusions", "primitives": [{ "id", "status": "available" | "unavailable", "note" }], "top": [{ "id", "label", "kind", "identity", "share" }], "coverage_note", "sources": [{ "id", "url" }] }`. `primitives` comes from `PRIMITIVES` in core: what this build can draw, and what is declared unavailable (FR-032).

### compute_figures

Input: `{ "sha256": string, "measure": string, "petals"?: int (default 60), "nakamoto_threshold"?: number, "top_k"?: int[] (default [1,5,10,100]) }`
Output (`Figures`): `{ "measure", "unit", "total", "participants_total", "participants_included", "shares": [{ "id", "label", "amount", "share", "rank" }] (top `petals` only), "top_k_share": { "1": n, "5": n, ... }, "nakamoto": { "threshold", "count" }, "hhi", "gini", "tail": { "count", "amount", "share" }, "fusions": [], "figure_ids": [ "fig:total", "fig:nakamoto", ... ] }`.
Deterministic. Definitions in [data-model.md](../data-model.md#figures).

### propose_spec

The agent passes choices, the tool builds the full canonical spec. Two agents making the same choices get the same `spec_sha256`.
Input: `{ "network": string, "params"?: object, "sha256": string, "choices"?: { "measure"?, "petals"?, "width"?: "r1.5"|"r2"|"r3"|"equal", "height"?: "sqrt"|"linear"|"log"|"equal"|"m:<metric>", "colour"?: "kind"|"identity"|"single", "outline"?: "identity_status"|"none", "segments"?: "none"|"backers"|"time"|"ops"|"roles", "lines"?: "none"|string, "markings"?: "none"|"fusion", "order"? }, "variation_of"?: sha256, "meanings"?: { "<primitive>": "override text" } }`
Behaviour: start from `default/v1` and the population's defaults; apply choices; attach the standard meaning and source ids for each primitive from the module descriptor; record `changes[]` when `variation_of` is set.
Output: `{ "spec": Spec, "spec_sha256", "defaults_applied": string[], "changed_from_default": string[] }`.
`order` fills `encodings.order` with its standard meaning (`default/v1`: `measure_desc`, "largest first, clockwise from the top").
Errors: `bad_input` with the allowed values and the closest alternative when a choice doesn't apply to this population (for example `segments: "backers"` on Bitcoin), or names a primitive this build marks unavailable (texture, extrusion, opacity): the answer says it is not available yet, and nothing is imitated (FR-032).

### validate_spec

Input: `{ "spec": Spec, "interpretation"?: Interpretation }`
Output: `{ "valid": boolean, "errors": [{ "path", "rule", "message" }], "warnings": [...] }`. Rules: schema, snapshot exists and matches, measure and `by` values allowed, a meaning and a known source for every primitive, width band ≤ 3, tail declared, and (with an interpretation) every mapping cited and `unknowns` not empty. Phase B adds the figure check: every percentage in the interpretation matches a figure within 0.05 points.

### render_flower

Input: `{ "spec": Spec, "include_svg"?: boolean (default false for MCP, true for HTTP), "size"?: int (default 800) }`
Output: `{ "spec_sha256", "render_sha256", "svg"?: string, "legend": LegendItem[], "petals": PetalDetail[], "view_url": string }`. See [renderer.md](./renderer.md) for `LegendItem`, `PetalDetail` and determinism. `view_url` opens the flower on the site from the spec alone (draft, not published).
Errors: `invalid_spec` (render refuses anything `validate_spec` rejects).

### list_flowers / get_flower

`list_flowers` input: `{ "network"?: string, "maker"?: string, "limit"?: int }` → `{ "flowers": [{ "id", "title", "network", "as_of", "maker", "published_at", "where": "map" | "fixture", "tx_hash"? }] }`. Reads the shared map (trusted writers only, [shared-map.md](./shared-map.md)) and the hero fixtures.
`get_flower` input: `{ "id": string }` → `{ "entry": Entry, "where", "tx_hash"?, "verified": { "entry_hash": bool, "maker_signature": bool, "model_signature": "present" | "absent" }, "corrections": [{ "id", "target", "request", "status": "open" | "accepted" | "declined" }] }`.

### prepare_publish

Input: `{ "entry": Entry without id and provenance.maker }` (spec, interpretation, snapshot, render hash, agent provenance)
Output: `{ "entry_sha256", "nonce", "recipient", "message", "expires_at", "sign_url" }`. `message` is the exact text the maker signs with NEP-413. `sign_url` opens the site's publish page with the draft loaded, for a maker whose own agent made the flower (the agent hands the link to the human).

### publish_flower

Input: `{ "entry_sha256": string, "proof": Nep413Proof }`
Behaviour: check the nonce is fresh and unused; verify the NEP-413 signature over `message`; check through RPC that `public_key` is a full-access key of `account_id`; build the final entry (adds `provenance.maker` and `id`); write `petal/v1/spec/<id>` with Petal's writer key (a function-call key limited to the map receiver and `__fastdata_kv`); mirror the entry locally.
Output: `{ "id", "key", "receiver", "writer", "tx_hash", "explorer_url", "gallery_url" }`.
Errors: `unauthorised` (bad or stale proof), `invalid_spec`, `source_failed` (RPC or FastData down; the entry stays in the local mirror marked `pending` and is retried).

### quote_payment

Input: `{ "purpose": "sponsor_refresh" | "sponsor_coverage", "amount_usd": number (default 1), "origin_asset"?: string (default Base USDC), "network"?: string }`. `sponsor_coverage` quotes new coverage of a network Petal can't read yet (FR-031).
Behaviour: `POST https://1click.chaindefuser.com/v0/quote` with `dry: true`, `swapType: EXACT_OUTPUT`, recipient Petal's account. No deposit address is returned, no money moves.
Output: `{ "dry": true, "amount_in", "amount_in_usd", "min_amount_in", "time_estimate_s", "fees": {...}, "correlation_id", "quoted_at", "note": "Dry quote. Paying is not switched on." }`.
FR-031: no money moves in the build without Elco's explicit OK.

### compare_figures (Phase B, US5)

What changed between two dates of one network. The tools count; the agent only quotes (FR-025).
Input: `{ "a": sha256, "b": sha256, "measure": string, "petals"?: int (5–300, default 60) }`. Both snapshots must be the same network and population; `a` is the earlier one.
Output (`FigureChanges`): `{ "measure", "unit", "a": { "as_of", "block_height" }, "b": { "as_of", "block_height" }, "total": { "a", "b", "change" }, "nakamoto": { "threshold", "a", "b", "change" }, "hhi": { "a", "b", "change" }, "top_k_share": { "1": { "a", "b", "change" }, ... }, "joined": [{ "id", "label", "share" }], "left": [{ "id", "label", "share" }], "moved": [{ "id", "label", "share_a", "share_b", "change", "rank_a", "rank_b" }] (largest changes first), "moments": [{ "at", "title", "kind": "event" | "curated", "source" }] (between the two dates), "figure_ids": [ "fig:delta.nakamoto", "fig:delta.hhi", ... ] }`.
Errors: `bad_input` (different networks, or `a` is not earlier than `b`), `not_found`.

### prepare_correction / submit_correction (Phase B, FR-022)

`prepare_correction` input: `{ "flower_id", "target": { "participant", "caip2", "address", "label_key"? }, "request": "correct" | "remove", "reason", "evidence"?: [...] }` → `{ "correction_sha256", "nonce", "recipient", "message", "expires_at", "issue_url" }`. `message` is the NEP-413 text; `issue_url` is the GitHub fallback for people without a NEAR account.
`submit_correction` input: `{ "correction_sha256", "proof": Nep413Proof }` → `{ "id", "key", "tx_hash", "explorer_url" }`. Verifies like `publish_flower`, then writes `petal/v1/correction/<flower-id>/<id>` ([shared-map.md](./shared-map.md#correction-requests-fr-022)).
Errors: `unauthorised`, `not_found`, `source_failed`.

## Types referenced

`Network`, `Snapshot` ([common-table.schema.json](./common-table.schema.json)), `Spec`, `Interpretation`, `Entry`, `Nep413Proof`, `ModelSignature` ([petal-spec.schema.json](./petal-spec.schema.json)), `Figures` and `FigureChanges` (above), `LegendItem`, `PetalDetail` ([renderer.md](./renderer.md)).

## The skill (the bring-your-own-agent door)

`skill/petal/SKILL.md` (W7), in the Agent Skills format (as in NEAR's `near/agent-skills`), tells any agent (Claude Code, Codex, IronClaw) to work in this order:

1. `list_networks` → pick the network, or say plainly that Petal can't read it and what it can read.
2. `get_snapshot` → say whether it was reused.
3. `describe_snapshot` and `compute_figures` → quote only these numbers.
4. `propose_spec` with the fewest choices the question needs → `validate_spec` with the interpretation → fix and retry on errors.
5. `render_flower` → hand back `view_url`, the legend, the interpretation, and what the data can't tell.
6. To publish: `prepare_publish` → give the human `sign_url`.

The skill calls the HTTP API with `curl` (works in all three agents). Agents with MCP configured use the same names over MCP. IronClaw gets a small package in `skill/ironclaw/` (an extension manifest wrapping `/mcp` over HTTP, plus the skill); it is a hedge and never on the demo's critical path.

## Contract tests (W4)

- Each tool: input and output validate against their schemas, for a fixture snapshot.
- HTTP, MCP and the CLI return identical JSON for the same call (minus transport fields).
- `propose_spec` with the same choices returns the same `spec_sha256` across runs and doors.
- Errors: each code above has one test.

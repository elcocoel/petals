# Contract: Petal tools

**Version**: tools/v2 (since 9 Nov: the brain's tools, layers on the site, jobs, compose_view's seam, hand_job's `to`; a flower entry keeps the tools_version that drew it) | **Owner**: workstream W4 (Tools) | **Consumers**: Petal's agent (in process), the MCP server, the HTTP API, the skill

One tools core, five thin doors ([packages.md](./packages.md#the-five-doors)): the HTTP API, the Agent Skill, the MCP server, the CLI and the IronClaw package. Each tool is a pure async function `(input) => output` registered once in `packages/tools/src/registry.ts`, with its input and output JSON Schemas. The MCP server lists the same names and schemas; the HTTP API maps each tool to one route ([http-api.md](./http-api.md)); the CLI calls the registry in process; the skill and the IronClaw package go through HTTP or MCP. Petal's agent calls the registry directly, without HTTP. No door adds logic of its own.

The agent interprets; the tools count (FR-025). Any number an agent quotes must come from `compute_figures` or `describe_snapshot`.

## Shared rules

- Inputs and outputs are JSON. Amounts are decimal strings. Shares are numbers rounded to 6 decimals.
- Every output carries `"tools_version": "tools/v2"`.
- Errors are returned, not thrown across the door: `{ "error": { "code", "message", "hint", "retry_after_s"?, "ended"? } }`. `ended` (additive, 11 Nov, swarm.md step 3) is `stopped` or `handed_over` when a worker's job ended for it: its next call through the job's link says so, with code `unauthorised`. Codes: `bad_input`, `not_found`, `cannot_read`, `source_failed`, `rate_limited`, `invalid_spec`, `unauthorised`, `invite_required` (agent routes only), `budget_exhausted`, `not_on_this_site` (a public site, `PETAL_PUBLIC=1`, refuses a tool that runs on the person's own machine), `internal`.
- Additive (J4): `approval_required` is what Petal's own agent loop answers a held `get_snapshot`, `propose_spec` or `render_flower` with, before the person's yes ([http-api.md](./http-api.md#agent-chat-sse)). No tool returns it and no door sees it: every door runs these tools as before (SYS-030).
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
| `render_flower` | A | stores the spec body under its hash, put-if-absent (SYS-043) |
| `list_flowers` | A | reads the map and fixtures |
| `get_flower` | A | reads the map and fixtures |
| `prepare_publish` | A | issues a nonce |
| `publish_flower` | A | writes to the shared map on NEAR (testnet) |
| `quote_payment` | A (dry) | calls NEAR Intents 1Click with `dry: true`; no money moves (FR-031) |
| `find_documents` | B | fetches public docs and forum pages for citations |
| `get_labels` | B | reads the label layer |
| `search_petals` | #105 | reads the map, the store and search's vectors; embeds a text it has no vector for, once, and keeps the vector (migration 29) |
| `find_voting_blocs` | #94 | reads a map's proposals as kept and its newest reading; keeps nothing |
| `look_up` | M-Lookup | reads the map, the store and the relations index; for an address, `read_chain`'s first look; for a name, `find_target`'s searching |
| `find_target` | M-Talk | at most 5 keyless calls to public sources and the chain |
| `read_chain` | M-Reach | at most 12 view calls and one log query, on our own endpoints only |
| `read_page` | M-Reach | fetches one public URL; a daily cap |
| `search` | M-Reach | one query on an unofficial route; a daily cap and a spacing |
| `compare_figures` | B | none |
| `prepare_correction` | B | issues a nonce |
| `submit_correction` | B | writes a correction request to the shared map (FR-022) |
| `account_groups` | M-System | none; the first call may build the derived index |
| `shared_accounts` | M-System | none; the first call may build the derived index |
| `related_groups` | M-System | none; the first call may build the derived index |
| `relations_overview` | M-System | none; the first call may build the derived index |
| `power_path` | M-System | none; the first call may build the derived index |
| `list_explorations` | M-System | none |
| `get_exploration` | M-System | none |
| `start_exploration` | M-System | writes to the private store |
| `save_step` | M-System | writes to the private store; stores the spec body under its hash |
| `add_note` | M-System | writes to the private store |

### list_networks

Input: `{ "query"?: string }`
Output: `{ "networks": Network[], "cannot_read_hint": string }` where `Network` is the descriptor in [data-model.md](../data-model.md#network) (`id`, `chain`, `population`, `kind`, `title`, `params` schema, `capabilities`, `live`, `cost`).
Phase A networks: `near-validators` (stored delegator crawl + live validator set), `near-house-of-stake` (live, ~10 calls). Phase B adds `near-sputnik-dao` (live, any DAO by account), `bitcoin-mining-pools`, `ethereum-staking`, `ethereum-miners-premerge` (fixtures from step 1).

### find_target (M-Talk, T164; additive, still tools/v1)

From plain words or an address to candidates. A token is a ledger of holdings, and transferability is a property of it: Moloch shares are a token that can't be transferred. No target is named in code.
Input: `{ "query": string, "chain"?: string, "limit"?: int (1-12, default 6) }`. "UNI on Base" also names the chain.
Output: `{ "query", "chain", "candidates": Candidate[], "more": int, "ambiguous": boolean, "next": string, "sources": [{ "id", "url", "status": "answered" | "failed" | "skipped", "hits", "ms"?, "note"? }], "calls": int }`.
`Candidate`: `{ "name", "symbol", "kind": "token" | "dao" | "network", "chain", "address": string | null, "ledger": "erc20" | "moloch-v1" | "moloch-v2" | "spl" | "other" | null, "transferable": boolean | null, "confirmed": { "by": "chain", "chain", "url", "answered": [signature] } | null, "draw": [{ "module", "params", "shows", "stored"?: { "sha256", "as_of", "block_height" }, "note"? }], "cannot_draw": string | null, "evidence": { "liquidity_usd"?, "volume_24h_usd"?, "holders"?, "verified"?, "followers"?, "proposals"?, "snapshot_space"? }, "sources": [{ "id", "url" }] }`.
Behaviour: Petal's modules and stored snapshots, then GeckoTerminal, Jupiter and Snapshot's hub; each EVM chain is then asked about its best candidate (`identifyContracts`, one eth_call). An EVM address that neither the chain confirmed nor a stored snapshot holds gets `cannot_draw`, never `draw`; Solana candidates are not confirmed here, the module's first read checks the mint. At most 5 calls and 4 s each; a source that is down costs only its own answer. `ambiguous` is true when different things carry the name: the caller asks, it does not pick. In fake mode no outbound call is made.

`next` reports what was found and what didn't answer. It doesn't tell the caller to ask or to stop. A chain whose endpoints don't answer is said to be down, and that says nothing about the address. Each chain's endpoints are tried in order.

### look_up (M-Lookup, T390; additive, still tools/v1)

One place to ask "what do we know about this?", with any word: a name, a ticker, an address, an account, a flower id, a snapshot hash. It reports and doesn't steer: there's no `next`, and every item says how it's known in `known`: `verified` (the chain answered just now), `stored` (a read Petal holds, on its date), `listed` (a market or DAO list names it, unconfirmed), `inferred` (the same address on another chain). It never fails on a guess: an unknown word gives empty lists and a `says` that names what was searched and what was down.
Input: `{ "query": string, "chain"?: string }`.
Output: `{ "query", "says", "flowers": [{ "id", "title", "network", "as_of", "where", "view_url", "known" }], "stored": [{ "network", "title", "params"?, "sha256", "as_of", "block_height", "known" }], "accounts": [{ "account", "role": "holder" | "delegator" | "backed", "in", "network", "sha256", "as_of", "known", "measure"?, "unit"?, "amount"?, "share"?, "rank"?, "of"?, "accounts"? }], "chain": [{ "chain", "kind": "contract" | "account", "known", "native_balance"?, "transactions_sent"?, "answers"?, "verified_source"?, "proxy_of"?, "delegates_code_to"? }], "listed": [{ "name", "symbol", "kind", "chain", "address", "ledger", "transferable", "known", "listed_by", "draw", "cannot_draw", "evidence" }], "ambiguous"?: true, "searched": [{ "id", "status": "answered" | "down" | "skipped", "note"? }] }`.
Behaviour: flowers on the map and in the fixtures match by their words, their id, or because they draw a read found here. Stored reads match by their words, their hash, an address in their params, a listed candidate's `draw.stored`, or an account in them. An account (an EVM or NEAR account, `chain:address`, a Solana address) is looked for in the relations index, and each read it's in gives its share and rank by the measure a flower of that read uses (`role: "holder"`), its place in a delegators group (`delegator`), or the group that backs it (`backed`, with `accounts`). An EVM address gets `read_chain`'s first look on every chain, or the one named: no code is an account, with its balance and transactions sent. A name, and an address where a chain holds code, go through `find_target`'s searching; its candidates are `listed`, at most 5, with `draw` and `cannot_draw` as there. A NEAR account, a flower id or a hash is answered from what Petal holds.

Routes for the three tools below: `POST /api/v1/read-chain`, `GET /api/v1/read-page?url=&start=`, `GET /api/v1/web-search?query=`. They're in http-api.md and the skill's table.

### search_petals (#105, 11 Nov; additive, still tools/v1)

Everything on the map (organisations, their names, symbols and types, their proposals, and Petals' own mapping's claims, each under the map whose accounts it's about) and, for the signed-in person, their own conversations, explorations, shapes, notes, follows and annotations, by words and by meaning. Words are BM25 over each document's words, accents and plurals folded; meaning is Qwen3-Embedding's vector of the question against each document's; the two rankings are fused by reciprocal rank (k 60), and Qwen3-Reranker reads the best 30 and orders them. A name, a symbol or an address typed exactly as it is comes first. One answer per map, with what matched under it (its proposals, a claim about its address). The models run on Elco's Mac behind oMLX (`PETAL_SEARCH_URL`, `coordinator/search_model_up.sh`); a text's vector is kept by the model and the text's sha256, so a text is embedded once, and a wave's load is embedded at the next search. When the model isn't running (none set, or it doesn't answer), it searches by words alone and says so (Elco, 11 Nov: "Fall back to word search"): `meaning: "off"` and `says`.
Input: `{ "q": string (at most 500), "kinds"?: ("map" | "proposal" | "claim" | "conversation" | "exploration" | "shape" | "note" | "follow")[], "limit"?: int (1 to 50, default 10) }`.
Output: `{ "meaning": "on" | "off", "says"?, "results": [{ "kind", "id", "title", "about", "view_url"?, "score", "ranks": { "words"?, "meaning"? }, "rerank"?, "at"?, "snippet"?, "matched"?: [same, without view_url and matched] }] }`. `ranks` says how each way ranked it (1 first); `rerank` is the reranker's reading, 0 to 1. A claim's `title` is its claim in words: who it's about by name (its map's, or one a name claim gives it, the person's own first) or short address, then what it says ("Compound: No stable voting bloc is asserted…", "0xf02f…e986 is a member of Alice"). Petals' agent's copy is bound to the person whose conversation it is (jobs.ts).

### find_voting_blocs (#94, 11 Nov; additive, still tools/v1)

A DAO map's voting blocs over a period, from its proposals as Petals read them (proposals/v1 or v2). Method `blocs/agreement@2`: each pair of accounts that voted on at least `min_shared` of the same proposals in the period (default 5), voted alike on at least `min_agreement` of them (default 0.8), and agreed beyond what each shared proposal's split explains by at least `min_kappa` (default 0.5; Cohen's kappa, where a proposal's chance of two voters agreeing is the sum of its choices' shares squared, from -1 to 1; META, 11 Nov: a majority agreeing with itself is no bloc). A vote of null (a ballot of choices) isn't counted. A bloc is the accounts such pairs link, the largest first, `id` `bloc:<12 hex of its members>`. The period is by when each proposal was submitted, `from` inclusive and `to` exclusive; with neither, every proposal. Members and pairs are the petal ids of the map's newest reading, or the account as a claim names it when it has no petal there. It answers the blocs and `pair_count`; with `pairs: true`, each pair, and each as an inferred claim (claim/v4, `moves_with`, grounds `synchronised_behaviour`, method `blocs/agreement@2#<12 hex of its thresholds and period>`, by `tool:petals-blocs@1`), its evidence a note with the counts, kappa, the period and the thresholds, and each shared proposal. Agreement in votes, never proof of coordination. It keeps nothing; `add_annotation` keeps what an agent needs in its person's project. Petals' own mapping keeps none for now (META, 11 Nov).
Input: `{ "map": string, "from"?: date-time, "to"?: date-time, "min_shared"?: int (1 up), "min_agreement"?: number (0 to 1), "min_kappa"?: number (-1 to 1), "pairs"?: boolean }`.
Output: `{ "about", "period": { "from", "to" }, "method": { "name", "min_shared", "min_agreement", "min_kappa" }, "proposals": { "in_period", "voted" }, "pair_count", "blocs": [{ "id", "members", "pairs" }], "pairs"?: [{ "a", "b", "shared", "agreed", "agreement", "kappa" }], "claims"?: [Claim] }`. Errors: `not_found` (no proposals read for that map).

### read_chain (M-Reach, T332; additive, still tools/v1)

Any address on a chain Petal knows. Read-only: `eth_call`, `eth_getLogs`, `eth_getCode` and the like, never a transaction. Only the RPC endpoints in `EVM_CHAINS` are ever used: no input is a URL, and an unknown `chain` is `bad_input`. Explorers are Sourcify, and Blockscout where a chain lists it, with only a checked address in the URL.
Input: `{ "address": string, "chain"?: string, "calls"?: (string | { "fn": string, "args"?: string[] })[] (at most 12), "logs"?: { "event": string, "from_block"?: int, "to_block"?: int } }`. A call is a signature, with `returns (...)` if known. With no `calls`, a first look. With no `chain`, every chain gets a look, and calls and logs go to at most two that hold a contract.
Output: `{ "address", "read": [Reading], "says" }`. `Reading`: `{ "chain", "status": "answered" | "down" | "offline", "note"?, "read_from"?: { "by": "chain", "url", "block"? }, "kind"?: "contract" | "account", "code_bytes"?, "proxy_of"?: { "address", "standard" }, "verified_source"?: { "by", "url", "of", "name", "view_functions", "other_functions", "events" } | null, "calls"?: [{ "fn", "args"?, "ok", "value"?, "guessed_as"?, "in_units"?, "reverted"?, "error"?, "cut"? }], "logs"?: { "event", "ok", "from_block", "to_block", "count"?, "logs"?, "note"?, "error"? }, "native_balance"?, "transactions_sent"?, "delegates_code_to"? }`.
Bounds: 12 calls; one log query a read, at most 100 logs shown; a range no wider than the chain's first endpoint takes; 20 log queries a minute across the process. Errors: `bad_input`, `rate_limited`.

### read_page (M-Reach, T333; additive, still tools/v1)

A public URL as plain text. What comes back is a page's words: `untrusted: true`, and `says` tells the reader they're data, not instructions and not proof. Only public addresses: http or https, ports 80 and 443, no credentials in the URL, checked after DNS and on every redirect, connecting to the address that was checked. No cookies. Limits: 10 s and 2 MB for the whole read, redirects included; a daily cap (`PETAL_PAGE_READS_PER_DAY`).
Input: `{ "url": string, "start"?: int }`. Output: `{ "untrusted": true, "says", "url", "final_url"?, "status", "fetched_at"?, "title", "text", "addresses", "links", "next_start", "truncated"?, "note"? }`. `text` is at most 20,000 characters, and `next_start` reads on. Errors: `cannot_read` (not public), `source_failed` (no answer), `rate_limited`.

### search (M-Reach, T334; additive, still tools/v1)

Words to public pages, through DuckDuckGo Lite: an unofficial route with no agreement behind it, which can change or refuse at any time. Nothing in Petal depends on it. One at a time, four seconds apart, with a daily cap (`PETAL_SEARCHES_PER_DAY`).
Input: `{ "query": string }`. Output: `{ "untrusted": true, "says", "query", "status": "answered" | "down" | "offline", "results": [{ "title", "url", "snippet" }], "note"? }`. Down is an answer, with a note saying it says nothing about the question, not an error.

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
Input: `{ "network": string, "params"?: object, "sha256": string, "choices"?: { "measure"?, "petals"?, "width"?: "r1.5"|"r2"|"r3"|"equal", "height"?: "sqrt"|"linear"|"log"|"equal"|"m:<metric>", "colour"?: "kind"|"identity"|"single", "outline"?: "identity_status"|"none", "segments"?: "none"|"backers"|"time"|"ops"|"roles", "lines"?: "none"|string, "markings"?: "none"|"fusion", "order"? }, "parent"?: Spec, "variation_of"?: sha256, "meanings"?: { "<primitive>": "override text" } }`
Behaviour: start from `default/v1` and the population's defaults, or with a `parent` from that spec's recipe; apply choices on top; attach the standard meaning and source ids for each primitive from the module descriptor; record `changes[]` for a variation (they list differences from the defaults, not from the parent).
Variations: `parent` is the spec this one changes, on the same network, and only the choices that change are sent. `variation_of` is filled in from it, and must match if given. `variation_of` with no `parent` is refused with `bad_input`: the tools keep no specs, so the parent's choices would be lost. Petal's own agent names the parent by hash and its loop passes the spec.
Output: `{ "spec": Spec, "spec_sha256", "defaults_applied": string[], "changed_from_default": string[], "recipe": Recipe, "recipe_sha256", "diff"?: SpecDiff }`.
`Recipe` (recipe/v1) is `{ "petal": "recipe/v1", "choices", "meanings"? }`: what the spec says beyond its network's defaults, with no target and no date. It's reusable: `choices` and `meanings` go back into `propose_spec` for another network or date, and a choice that doesn't apply there is refused as below. `recipe_sha256` is the SHA-256 of the canonical recipe, so the same choices on two networks have the same hash.
`SpecDiff`, with a parent: `{ "same_recipe": boolean, "subject": Change[], "data": Change[], "design": Change[], "says": string }`, with `Change` as `{ "what", "from", "to", "says" }`. Subject is the network, data the snapshot and labels, design the choices. `says` is the whole of it in words, e.g. "same recipe, newer data". A measure change is one change, though it rewrites meanings and sources.
`order` fills `encodings.order` with its standard meaning (`default/v1`: `measure_desc`, "largest first, clockwise from the top").
Errors: `bad_input` with the allowed values and the closest alternative when a choice doesn't apply to this population (for example `segments: "backers"` on Bitcoin), or names a primitive this build marks unavailable (texture, extrusion, opacity): the answer says it is not available yet, and nothing is imitated (FR-032).

### validate_spec

Input: `{ "spec": Spec, "interpretation"?: Interpretation }`
Output: `{ "valid": boolean, "errors": [{ "path", "rule", "message" }], "warnings": [...] }`. Rules: schema, snapshot exists and matches, measure and `by` values allowed, a meaning and a known source for every primitive, width band ≤ 3, tail declared, and (with an interpretation) every mapping cited and `unknowns` not empty. Phase B adds the figure check: every percentage in the interpretation matches a figure within 0.05 points.

### render_flower

Input: `{ "spec": Spec, "include_svg"?: boolean (default false for MCP, true for HTTP), "include_reading"?: boolean (default false), "size"?: int (default 800) }`
Output: `{ "spec_sha256", "render_sha256", "svg"?: string, "reading"?: { "title", "petals" }, "legend": LegendItem[], "petals": PetalDetail[], "view_url": string, "short_url"?: string }`. See [renderer.md](./renderer.md) for `LegendItem`, `PetalDetail` and determinism. `view_url` opens the flower on the site from the spec alone (draft, not published). `short_url` (M-System, additive) is `/d/<spec_sha256>`, which redirects to the same place, with the body stored under its hash and hashed again on read. It's absent when nothing lasting can hold the body, so `view_url` is always there as the fallback. Petal's own agent is shown neither: its loop puts the link in.
`reading` (T200, additive, opt-in) is the `title` and `petals` of `readFlower` on the same spec and snapshot, for a live drawing of the flower. Petal's own agent neither is offered `include_reading` nor reads `reading`, so what the model sees and pays for doesn't change.
Errors: `invalid_spec` (render refuses anything `validate_spec` rejects).

### list_flowers / get_flower

`list_flowers` input: `{ "network"?: string, "maker"?: string, "limit"?: int }` → `{ "flowers": [{ "id", "title", "network", "as_of", "maker", "published_at", "where": "map" | "fixture", "tx_hash"?, "view_url" }], "hint"? }`. Reads the shared map (trusted writers only, [shared-map.md](./shared-map.md)) and the hero fixtures. Additive (T391): `view_url` is the flower's own page, `/f/<id>` after the public base, so no agent hands over a bare id or makes a link up. A `network` that is no id Petal reads is empty with a `hint` naming the ids that have flowers, not `cannot_read`: models guess ids ("near", "moloch").
`get_flower` input: `{ "id": string }` → `{ "entry": Entry (`flower/v1` or `flower/v2`, each verified by its own rule), "where", "tx_hash"?, "view_url" (additive, T391), "verified": { "entry_hash": bool, "maker_signature": bool, "model_signature": "present" | "absent" }, "corrections": [{ "id", "target", "request", "status": "open" | "accepted" | "declined" }] }`.

### prepare_publish

Input: `{ "entry": Entry without id and provenance.maker }` (`petal: "flower/v2"`, spec, interpretation, snapshot, agent provenance). A draft in the older `flower/v1` form is lifted to `flower/v2`, not refused.
Behaviour: checks the spec and the interpretation, then adds the receipt `drawn_with: { render, sha256 }` from what the renderer draws now, replacing any receipt in the draft. A drawing is never a reason to refuse ([shared-map.md](./shared-map.md#entry-versions)).
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

### Relations between groups (M-System, T198; additive, still tools/v1)

Read-only, public, and with no sign-in. They read `<stateDir>/index.db`, which holds only what stored snapshots say and can be deleted at any time (SYS-003): it builds on first use, takes in snapshots stored since on each call, and a missing, stale or corrupt file is rebuilt rather than failing. `pnpm relations:rebuild` deletes and rebuilds it and says what it read.

**Names.** A group is a module and its parameters over time (`group_id`: `erc20-holders/eip155:1/token:0x…/token_balance`, `near-validators/near:mainnet/validators/delegators:<pool>`). `window_days` is how a read was made, so it isn't part of the id. A group has one `observation` per stored date. Where a tool takes a group, it takes a `group_id` (its latest date), `<group_id>@<sha256>` (that date), or a snapshot's `sha256` (that snapshot's main group, at that date). An account is `chain:address`, one id per chain. A bare address also works, and stands for that address on every chain it appears on.

**What every result says** (SYS-071), in the data:
- `at_least`: true when coverage on either side is partial. Overlap is then a lower bound, and absence isn't proof. `coverage` on each group gives `members_named`, `members_total` (null when the snapshot states coverage for another measure), `tail_accounts`, `amount_total`, `amount_named`, `named_share`, `window`, `complete`, `why_partial[]`.
- `as_of` on everything, and `as_of_a`, `as_of_b`, `gap_seconds`, `gap_days` on every pair. Two reads can be years apart, so a shared account need not have been in both at once.
- `match`: `{ status: "observed" }` on one chain. `{ status: "inferred", method: "same_evm_address" | "same_address_string" }` when one address on two chains is taken for one account. Equal strings outside the EVM chains are no match, and nor are folded `group:*` rows.
- `does_not_show` and `absence`: shared membership isn't coordination, and doesn't show a common owner or controller.
- `not_read`, only when non-empty: `[{ sha256, reason }]`, stored snapshots the index could not read.
- `identity`, where a snapshot holds a label: `{ name, source, status }` exactly as stored. Never upgraded, and never used to say two accounts are one person.
- Amounts are decimal strings, and shares are numbers rounded to 6 decimals, the same as `compute_figures`. `weight` is the sum, over shared accounts, of the smaller of the two shares: units don't add up across groups.

`Group` (a group at one date): `{ group_id, title, kind: "holdings" | "delegators", chain, module, measure, unit, as_of, block_height, final, snapshot_sha256, latest, observations, coverage }`.

#### account_groups
Input: `{ account, limit?: int (1-1000, default 100) }`.
Output: `{ asked, accounts: string[], groups: [{ group: Group, account, match, amount, share, rank, identity, account_kind }], total, more, anchor_of: Group[], at_least, index: { snapshots, groups, observations, observations_partial }, absence, does_not_show }`. Every date of every group, largest share first. `anchor_of` lists groups about this account, such as a pool's delegators, which it isn't a member of. An unknown account is an empty answer with `at_least`, not an error.

#### shared_accounts
Input: `{ group_a, group_b, limit?: int (0-1000, default 50) }`.
Output: `{ a: Group, b: Group, same_group, shared, at_least, match, as_of_a, as_of_b, gap_seconds, gap_days, weight, share_of_a, share_of_b, accounts: [{ account_a, account_b, match, amount_a, amount_b, share_a, share_b, rank_a, rank_b, as_of_a, as_of_b, identity_a, identity_b, groups_observed }], more, absence, does_not_show }`. `shared` counts all of them, and `accounts` is capped, largest smaller-share first. `groups_observed` lets a reader spot an account that's in nearly everything.
Errors: `not_found` (with near matches in `hint`); `bad_input` when both name one group at one date. Two dates of a group can be compared by naming them, and then `same_group` is true.

#### related_groups
Input: `{ group, by?: "count" | "share" (default count), limit?: int (1-200, default 20) }`.
Output: `{ group: Group, by, basis, related: [{ group: Group, shared, at_least, match, as_of_a, as_of_b, gap_seconds, gap_days, weight, share_of_a, share_of_b }], total, more, absence, does_not_show }`. Precomputed between the latest date of each group. A group is never related to itself or to another date of itself. Pairs with nothing seen in common aren't listed.
Errors: `not_found`.

#### relations_overview
Input: `{ min_shared?: int (default 1), kind?: "holdings" | "delegators" | "all" (default holdings), limit?: int (0-5000, default 500) }`.
Output: `{ min_shared, kind, basis, groups: [{ id, title, kind, chain, module, unit, as_of, snapshot_sha256, observations, members_named, members_total, complete }], groups_left_out, pairs: [{ a, b, shared, weight, at_least, match, as_of_a, as_of_b, gap_seconds, gap_days }], pairs_total, pairs_more, accounts, index, absence, does_not_show }`. Each pair once, largest first. For a far-zoom map. `kind: "all"` is hundreds of kilobytes on today's data, so it isn't the default.

#### power_path
Input: `{ account_a, account_b, max_depth?: int (1-6, default 3; how many shared groups), budget?: int (1-200,000, default 200,000; edges read before giving up), include_inferred?: boolean (default false) }`.
Output: `{ from: { asked, accounts, match | null }, to: { asked, accounts, match | null }, max_depth, budget, walked, found, reason: "found" | "same_account" | "unknown_account" | "no_path" | "depth_limit" | "budget", gave_up, hops, touched, note, does_not_show }`.
A hop is `{ via: "group", from, to, group: Group, from_in_group, to_in_group }`, with `{ role: "member", share, rank }` or `{ role: "anchor" }` on each end, or, when inference is allowed, `{ via: "same_address", from, to, match }`. `gave_up` is true for `depth_limit` and `budget`: a path may exist. It is one shortest path among possibly many, chosen the same way each time. It isn't scored: group sizes are there so a reader can judge, since a huge group connects nearly anything.

### Explorations (M-System, T194; additive, still tools/v1)

A private, door-independent ref over public objects, like a git branch ([data-model](../../002-system/data-model.md#an-exploration)). Conversations don't travel, but work and notes do. Every door has these except Petal's own agent, whose run saves steps by itself and which would pay 2.7 KB on every model call to list them.

**Whose.** Where a tool takes `exploration`, it takes an id (`exp_…`), which only its owner's session can open, or a link (`/s/<token>`, the whole URL or the token). A `read` link opens the packet. A `continue` link can also `save_step` and `add_note`. Anyone else, a revoked link, and nothing at all get one answer: `not_found`, with one fixed message. HTTP is the only door with a session so far; MCP and the CLI have links.

**What it holds.** At most 100 steps and 100 notes. One nobody owns goes after 14 days with no write, on a later `start_exploration`. Limits are in `.env.example`.

**Who wrote what.** A step and a note say which `door` (`site`, `http`, `mcp`, `cli`) and `from` whom (`owner`, `link:<id>`, and `fork:` in front when a fork copied it). The door sets these; a caller can't.

**Untrusted.** Notes, step notes, the question and the target are data from whoever wrote them. The packet says so in `untrusted`, and on each note. Nothing here spends, so a note can't cause spending.

#### get_exploration

Input: `{ "exploration": string }`
Output, the resume packet: `{ "exploration", "access": { "as": "owner" | "read" | "continue", "can": string[], "cannot"?: string[] }, "question", "target": string | null, "current": { "spec_sha256", "spec", "recipe", "recipe_sha256", "snapshot_sha256", "as_of", "block_height", "network", "short_url" } | null, "steps": Step[] (the last 20), "steps_total", "notes": Note[] (the last 30), "notes_total", "untrusted": { "fields": string[], "says" }, "free": string[], "spends": string[], "next", "forked_from": string | null, "run_id"?: string | null (owner only: the conversation on the site), "created_at", "updated_at" }`.
`Step`: `{ "seq", "parent", "spec_sha256", "recipe_sha256", "snapshot_sha256", "as_of", "door", "from", "note", "at", "diff": SpecDiff | null }`, where `diff` is `diffSpecs` against its parent. `Note`: `{ "seq", "untrusted": true, "from", "door", "at", "text" }`.
To use a recipe on another target: `propose_spec` with that `network` and `sha256`, `choices: recipe.choices` and `meanings: recipe.meanings`. What doesn't apply there is refused with what's allowed.

#### list_explorations

Input: `{ "limit"?: int (1-200, default 50) }`
Output: `{ "explorations": [{ "exploration", "question", "target", "head", "short_url"?, "steps", "notes", "forked_from", "run_id", "created_at", "updated_at" }] }`, newest first. Errors: `unauthorised` with no session.

#### start_exploration

Input: `{ "question"?: string (required unless forking), "target"?: string, "fork_of"?: string (a link, or an id of your own) }`
Output: `{ "exploration", "owned": boolean, "forked_from": string | null, "link"?: { "id", "scope": "continue", "url", "created_at" }, "next" }`. With a session it's that subject's. With none it has no owner, and `link` is its only key, shown once: its holder can claim it after signing in. A fork copies the steps and notes, so it stands alone once a link is revoked. Errors: `source_failed` on a store that won't last, as on the keyless copy.

#### save_step

Input: `{ "exploration": string, "spec"?: Spec, "spec_sha256"?: string (one `render_flower` stored), "note"?: string }`
Output: `{ "exploration", "step": Step, "head", "unchanged": boolean, "short_url" }`. The spec must pass `validate_spec`. Its parent is its `variation_of`, or else the head. Saving the head again adds no step, and a note with it stays as a note. Errors: `unauthorised` on a read link, `invalid_spec`, `not_found`.

#### add_note

Input: `{ "exploration": string, "text": string (2,000 characters at most), "title"?: string (80 characters at most) }`
Output: `{ "exploration", "note": Note, "title"? }`. Errors: `unauthorised` on a read link.

`title` (10 Nov, Elco: conversations are named) names the exploration as a conversation in its owner's list, which shows it instead of the question it started on. The person's own agent sends it with its first reply's note and again when the subject changes: 3 to 6 plain words, the subject, not the request. A note without one leaves the name as it is. When the person carries the work on in Petals' chat, the new run starts with that name.

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

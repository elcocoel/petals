# Research: Petal core (plan phase 0)

**Feature**: `001-petal-core` | **Date**: 2026-11-04 | **Plan**: [plan.md](./plan.md)

Each item gives the decision, why, and what else was looked at. Decisions are **proposed** and reviewed at the task gate. Non-NEAR alternatives are recorded for later, not built (constitution, NEAR showcase).

Inputs: the step 1 and step 2 research (data sources, NEAR's fit, the map and payments, NEAR DAO data, an agent spike), plus two desk checks run today (docs, npm, GitHub, keyless GETs; sources at the end). Nothing was signed, sent or paid.

## R1. Language, runtime, workspace

- **Decision**: TypeScript everywhere, in a pnpm workspace in `build/`. Node 24 LTS. `.nvmrc` and `engines` pin it.
- **Why**: one language for renderer, tools, agent and web, so the browser and the server run the same renderer. NEAR's JS libraries, the MCP SDK and Next.js are all TypeScript-first.
- **Found today**: Node 24.14.0 is installed through nvm, but the `node` first on the PATH is 22.22.3 (`~/.local/bin/node`). Every script must run under Node 24 (`nvm use`). pnpm 10.33.0 is installed.
- **Readiness check (2026-11-04, Node 24.14.0, pnpm 10.33.0)**: no blockers.
  - Pinned versions match npm latest: near-api-js 7.4.0, near-connect 0.12.0, MCP server 2.4.0.
  - TypeScript 7.0.2 (the native compiler) works with Next 16.4.5 and `tsc -b`.
  - Traps, folded into T002, T003, T006, T011, T013–T015, T022 and T051: Vitest 5 ignores `vitest.workspace.ts`; noble 2.x needs `.js` subpaths; strict Ajv needs `ajv-formats`; both schemas emit `Datetime`; the login shell's `node` is v22.
  - `petals.testnet`, `writer.petals.testnet` and `petals.near` were all free.
- **Alternatives**: keep Python (the spikes) for inputs and TypeScript for the web (two runtimes, two test stacks, renderer duplicated); Rust (slow to build in a week); Bun or Deno (less certain support from NEAR and MCP libraries). Python spikes stay outside the repo and are not product code.

## R2. Package split

- **Decision**: `packages/core`, `packages/inputs`, `packages/near`, `packages/tools`, `packages/agent`, `apps/web`, `skill/`. Interfaces in [contracts/packages.md](./contracts/packages.md).
- **Why**: each is one workstream with one owner and a narrow interface, so agents can build in parallel. `near` (not `map`) because it holds three NEAR platform adapters: the map (FastData), accounts (NEP-413, keys) and payments (1Click). NEAR as a data source stays in `inputs`. `web` is an app, not a library, so it sits in `apps/`.
- **Alternatives**: a single Next.js app with everything inside (fast to start, hard to split between agents, and the MCP and skill doors would depend on the web app); more packages (one per input module; premature).

## R3. Schemas and types

- **Decision**: the JSON Schemas in `contracts/` (draft 2020-12) are the source of truth. They are copied into `packages/core/schema/`. Ajv validates. TypeScript types are generated with `json-schema-to-typescript` and checked in. MCP v2 takes raw JSON Schema through `fromJsonSchema()`, so no second schema language is needed.
- **Why**: the schemas are the contract between workstreams and with outside agents; JSON Schema is language-neutral and is what MCP tools publish anyway. Both schemas and sample documents were validated today.
- **Alternatives**: Zod 4 as the source with JSON Schema exported (good DX, but the contract would live in code); TypeBox; Valibot.

## R4. Canonical JSON and fingerprints

- **Decision**: RFC 8785 (JCS) canonical JSON, SHA-256 over the uncompressed canonical bytes. Snapshots are stored as `<sha256>.json.gz`. Flower ids are the first 24 hex characters of the entry hash.
- **Why**: gzip output can vary between zlib versions, so the hash must not depend on it. FastData re-serialises values with sorted keys, so readers must re-canonicalise before checking a hash. Amounts are decimal strings, so number formatting never changes a hash.
- **Alternatives**: `JSON.stringify` with sorted keys (number edge cases); CBOR; IPFS CIDs (useful later if bodies move to content-addressed storage).

## R5. Renderer

- **Decision**: a pure TypeScript function, spec + snapshot → SVG string, in `core`. Port the geometry of the flower spike (polygon, straight bars, stacked segments, width band). Fixed 2-decimal coordinates, fixed element order, ids from the spec, colours as CSS custom properties so light and dark share bytes. Contract: [contracts/renderer.md](./contracts/renderer.md).
- **Why**: SVG is deterministic, diffable, testable byte for byte (SC-005), exports to an image, and is easy for judges to inspect. The spike already proved the look. The canonical render runs in Node; the browser uses the same code for instant redraws.
- **Risk**: `Math.sin` and `Math.log` can differ in the last bit between JavaScript engines. Rounding to 2 decimals hides this almost always; the server's `render_sha256` is the reference.
- **Alternatives**: Three.js or WebGL (rendering in code is preferred; the right tool for extrusion and 3D, so it becomes a *view* over the same geometry in Phase B or later, not the canonical render); D3 (adds a dependency for what is simple trigonometry); Canvas (no byte-level determinism, no vector export).

## R6. Counting

- **Decision**: all figures in `core`: shares, top-k share, Nakamoto coefficient (threshold stated: 1/3 for BFT chains), HHI, Gini over included participants, tail, and fusions (Phase B). Sums in exact decimal arithmetic on `amount_raw` where present (BigInt), shares as numbers rounded to 6 decimals. Each figure has an id the interpretation cites.
- **Why**: the talk-a-flower test showed a small model misquotes figures; the agent interprets, the tools count (FR-025).
- **Alternatives**: let the agent compute from a catalog (failed in the test); a SQL engine such as DuckDB (overkill for ≤300k rows).

## R7. Inputs and the snapshot cache

- **Decision**: input modules output snapshot/v1 ([common-table.schema.json](./contracts/common-table.schema.json)). A file store keyed by SHA-256 with an index from (chain, population, block) to hash. Lookup order: fixtures, local cache, map index. Final snapshots are never fetched again (FR-028). Phase A modules: `near-validators` and `near-house-of-stake`.
- **Fixtures**: checked in under `fixtures/snapshots/`, budget ≤ 5 MB gzipped each, ≤ 25 MB in total. The NEAR validators fixture is imported from the 2026-11-03 pull: all 371 validators, 862 pools, owners and liquid-staking contracts, every delegation of at least 1,000 NEAR (8,319 rows, 98.76% of delegated stake), and the rest folded into one row per pool and backer class, declared in `coverage.grouped`.
- **Live in Phase A**: House of Stake holders, power and delegations (~10 keyless calls, ~10 s). This proves fetch → hash → store → reuse with real live data. The NEAR delegator crawl (963 calls, ~24 min keyless) stays an offline script.
- **Live in Phase B**: any Sputnik DAO by account (2–25 s; 2,070 v2 DAOs nobody prepared), which is the cheapest real "network nobody prepared" path (FR-002).
- **RPC pool**: dRPC first (0.1 s per view, no 429s at 2.5 calls/s), FastNEAR, then Shitzu (needs a User-Agent). Reads at `finality: final` or a fixed block.
- **Deployed cache**: a serverless host has no lasting disk. Phase A deploy (if any) serves fixtures and writes new live snapshots to `/tmp` plus a fingerprint on the map. A lasting store for new bodies is a Phase B choice (FastFS on NEAR, or Vercel Blob).
- **Alternatives**: a database (SQLite, DuckDB, Supabase); object storage (R2, S3); committing the full 17 MB crawl (bloats the repo; the grouped fixture keeps 98.76% of stake individually).

## R8. The shared map

- **Decision**: FastData KV on NEAR testnet. Receiver `petals.testnet` with no contract. Keys `petal/v1/spec/<id>`, `petal/v1/snapshot/<sha256>`, `petal/v1/index/<caip2>/<population>/<block>`, later `petal/v1/label/…` and `petal/v1/vouch/…`. Reader filters by trusted writers. Local mirror of every write. Snapshot bodies stay off the map, named by hash. Contract: [contracts/shared-map.md](./contracts/shared-map.md).
- **Confirmed today**: testnet KV at `kv.test.fastnear.com` answers keyless. Exact read endpoints (latest by writer and key, by prefix per receiver, history, multi). No filter takes a list of writers, so the gallery reads once per trusted writer. No retention statement anywhere, so the mirror is required.
- **Why**: about 0.00014 NEAR per spec, every row records its writer and keeps history, and anyone can add, which is the shared-map idea.
- **Alternatives**: contract storage (10 NEAR per MB, permanent; a small index only, if ever); SocialDB (`social.near`); NEAR DA (built for rollups); our own storage (S3/R2, Supabase); a GitHub repo with pull requests (like mempool's pool list); Ethereum's Open Labels Initiative for labels (hex addresses only).

## R9. Publishing and accounts

- **Decision (Phase A): relayed publish.** The maker signs one NEP-413 message naming the entry hash (sign-in and signature in one wallet prompt via `connect({ signMessageParams })`). Petal's server verifies it (`near-api-js` v7 `verifyMessage`, which also checks the key is a full-access key) and writes the entry with Petal's writer account, using a function-call key limited to `petals.testnet` and `__fastdata_kv`. The signature is stored inside the entry.
- **Why**: one prompt, no gas, no funded maker account, and no "transaction failed" screen. Wallets and `near-api-js` report no-contract receipts as failed (near.social: "treat that as success"), which would confuse a first-time maker. Authorship stays checkable by anyone through the stored signature. It uses NEP-413, function-call keys and FastData on the first publish.
- **Decision (Phase B): the maker writes.** (a) Direct: the maker's wallet sends `__fastdata_kv`, so the row's writer is the maker. (b) Agent key: `connect({ addFunctionCallKey: { contractId, publicKey, allowMethods: { anyMethod: false, methodNames: ["__fastdata_kv"] } } })` adds a limited key whose private half the maker's own agent holds (FR-029).
- **Wallets on testnet** (from the near-connect manifest): Meteor, Intear, Ledger, Nightly, WalletConnect, NEAR CLI. HOT and MyNearWallet are not offered on testnet. The quickstart uses Meteor.
- **Libraries**: `@hot-labs/near-connect` 0.12.0 directly. Skip `near-connect-hooks` and `function-call-key-plugin`: both require near-connect ^0.11.1, and the plugin keeps the key in `localStorage`. `near-api-js` 7.4.0 for server signing and verification (v7 absorbed the `@near-js/*` packages). Nonces are 32 random bytes (the docs' UUID example is 36 bytes and wrong).
- **Alternatives**: NEP-366 meta-transactions with a relayer (keeps the maker as writer and Petal pays; indexer support for wrapped writes unverified); `@near-wallet-selector` (docs.near.org now shows only near-connect); GitHub or Google login, Sign-In with Ethereum, passkeys (not NEAR).

## R10. The brain: NEAR AI Cloud

- **Decision**: Petal's agent calls NEAR AI Cloud (`https://cloud-api.near.ai/v1`, OpenAI-compatible) with the `openai` npm SDK and a small loop of our own. Primary `deepseek-ai/DeepSeek-V4.1-Flash-1017` (TEE, tools, $0.30 in / $1.20 out per million tokens), chosen in the bake-off below, called with `reasoning_effort: "low"`. Fallbacks `z-ai/glm-5.3-flash`, then `Qwen/Qwen3.8-27B`. Prices checked at `GET /v1/models` on 5 Nov.
- **Signatures**: model calls are **not streamed**, sent with the canonical model id, `x-no-aliasing: true` and `Accept-Encoding: identity`, so they get a `provider_tee` signature over `model:sha256(request):sha256(response)`. Petal keeps the exact request and response hashes, fetches `GET /v1/signature/{id}` right away (retention is not documented), and fetches the attestation report before the completion (`provider=near` works on all three models). Both endpoints need a key, so Petal stores the signature and the report hash with the entry and serves the report for anyone to check at `GET /api/v1/attestations/<report_sha256>`. Progress to the browser comes from Petal's own events, not token streaming.
- **Budget**: about $0.02 per flower on the primary, counted at full input price (cached input is cheaper on NEAR AI, so the real bill is at or below this). Per-chat cap $0.05, daily cap $3 (configurable). `max_completion_tokens` is 16,000: it includes reasoning tokens, and a low limit returned empty content. Without a key, a recorded transcript replays, so judges always see the flow (SC-009).
- **Alternatives**: Anthropic or OpenAI APIs directly (~$0.15 per flower, no TEE signature); the Vercel AI SDK (more abstraction than the loop needs); hosted IronClaw as the brain (needs a login).

### The bake-off (T060, 5 Nov 2026)

Each model got the same two questions for a flower nobody had drawn: "Who stands behind NEAR's validators? Make me a fresh flower with their backers, not an existing one." and "Who holds power in NEAR's House of Stake? Make me a fresh flower, not an existing one." House of Stake is read live. Testnet map, writer key on, `reasoning_effort: "low"`, final code. Run with `node tests/e2e/bakeoff.ts`; the transcripts are in `fixtures/transcripts/bakeoff/`.

| Model | Question | Flower | Wall | Turns | Cost | `validate_spec` tries | Only tool numbers | Signature | Reading of the interpretation |
|---|---|---|---|---|---|---|---|---|---|
| DeepSeek V4.1 Flash | validators | yes | 32.9 s | 7 | $0.0189 | 1 | yes | `provider_tee` | Best. Fewest choices (`segments: backers` only). Names House of Stake as a separate power, and that liquid-staking holders carry the real weight. Six specific unknowns. |
| DeepSeek V4.1 Flash | House of Stake | yes | 43.3 s | 7 | $0.0173 | 1 | yes | `provider_tee` | Good. Three cited power claims, tail quantified. One guess about delegates, correctly marked as inferred. |
| GLM 5.3 Flash | validators | yes | 37.9 s | 8 | $0.0060 | 2 (a warning, no error) | yes | `provider_tee` | Correct and cited, but a single power claim, and it spells out a default as a choice. |
| GLM 5.3 Flash | House of Stake | yes | 35.1 s | 7 | $0.0044 | 1 | yes | `provider_tee` | Correct, thinner. Spells out defaults (`height`, `width`) as choices. |
| Qwen 3.8 27B | validators | yes | 53.5 s | 7 | $0.0058 | 1 | yes | `provider_tee` | Good, fewest choices; one overstatement ("dominates block production rights"). Guessed a network id first and recovered. |
| Qwen 3.8 27B | House of Stake | yes | 52.2 s | 7 | $0.0052 | 1 | yes | `provider_tee` | Clean, default mapping, one power claim. |

Longest gap between events: 8 s in every run (the heartbeat).

**Why DeepSeek**: all three pass on these rules, so the choice is on the reading, which is the product. DeepSeek's was the fullest and the most disciplined across the low-effort runs, at about 3.5 times GLM's price per flower, and as fast. GLM is the fallback, and the choice to make if cost matters more than the reading: it is one line (`DEFAULT_MODEL` in `packages/agent/src/near-ai.ts`).

**Reasoning effort matters more than the model for time.** Every run of the day, by effort (`earlier/` in the same folder; earlier prompts and tool trims, so read these for time, not for wording):

| Model | Own default effort | `medium` | `low` |
|---|---|---|---|
| DeepSeek | 77.8 s; validators hit the 120 s limit | not run | 32.9-64.7 s, 9 of 9 |
| GLM | 66.4-88.4 s, 5 of 5 | 68.1-92.4 s, 2 of 2 | 25.7-43.7 s, 7 of 8 |
| Qwen | 63.2-72.4 s; one hit the 120 s limit | not run | 52.2-66.2 s, 3 of 4 |

The two `low` runs that missed the limit lost most of their time before the model was at fault: a House of Stake read took 103 s (GLM) and 41 s (Qwen), where it normally takes 8-11 s. The likely cause is an RPC node hanging on each call of the read. It was not reproduced; the pool now leaves a hung node alone for 30 s, and the read no longer waits for its map write.

## R11. Tools: one core, five thin doors

- **Decision** (2026-11-04): tools are plain async functions with JSON Schemas in `packages/tools`, and every door is thin over them:
  1. **HTTP API**, the base, which the web app uses: a Hono 4 app. Tool routes come from `@petal/tools` (`httpApp`); the agent's routes (chat, runs, attestation reports) come from `@petal/agent` (`agentRoutes`), and `petalApp` joins them. Keeping the agent's routes on the agent side keeps the dependency one way (agent → tools).
  2. **Agent Skill**: `skill/petal/SKILL.md` in the Agent Skills format, as NEAR's official dev pack `near/agent-skills` ships them. The main bring-your-own-agent door.
  3. **MCP server**: `@modelcontextprotocol/server` v2, stateless Streamable HTTP at `/mcp`, stdio for local use.
  4. **CLI** (`apps/cli`, bin `petal`): calls the registry in process and prints JSON; for judges and the thesis track (re-runnable evidence).
  5. **IronClaw package** (`skill/ironclaw/`): an extension manifest wrapping `/mcp` over HTTP, plus the skill. About half a day, never on the demo's critical path.
  Petal's agent calls the registry in process. Contracts: [contracts/tools.md](./contracts/tools.md), [contracts/http-api.md](./contracts/http-api.md), [contracts/packages.md](./contracts/packages.md#the-five-doors).
- **Why these five**: they match NEAR's direction (Agent Skills in `near/agent-skills`; NEAR AI investing in private, verifiable inference) and cost little because no door holds logic.
- **Same spec through two doors**: `propose_spec` takes a few choices and fills every default and standard meaning, so Petal's agent and Claude Code reach the same `spec_sha256` when they make the same choices (quickstart step 4).
- **Alternatives**: OpenAPI-first with generated clients; tRPC (TypeScript-only callers); MCP v1 SDK `@modelcontextprotocol/sdk` 1.32 (still patched, but v2 has been stable since July 2026).

## R12. Web

- **Decision**: Next.js (App Router) in `apps/web`. The Hono API (`petalApp`) mounts at `/api/[[...route]]` with `@hono/vercel` (the `hono/vercel` helper is deprecated). Pages: gallery `/`, flower `/f/[id]`, draft view `/draft?spec=`, maker chat `/make`, publish `/publish/[draft]`.
- **Why**: one deploy for site and API, server rendering for share links and previews, first-class streaming, familiar to coding agents.
- **UI polish**: parked until Phase B (architecture before polish). M6 holds the beauty pass (constitution VI).
- **Alternatives**: Vite SPA with a separate Hono server (lighter, two deploys); SvelteKit; Astro.

## R13. The skill and IronClaw

- **Decision**: one `skill/petal/SKILL.md`, in the Agent Skills format, for Claude Code, Codex and IronClaw. It calls the HTTP API with `curl`, or MCP where configured. The system prompt for Petal's agent and the skill share one source text.
- **Why**: the step 2 test showed a skill file is enough for a capable agent. IronClaw loads skills from `~/.ironclaw/skills/`; its MCP needs a packaged extension and hosted IronClaw needs a login, so the demo never depends on it.
- **Phase B**: build the small IronClaw package (`skill/ironclaw/`: extension manifest over `/mcp`, plus the skill) and try it in a local IronClaw; an IronHub listing only if time allows (review time unknown).
- **Hedge, not core**: IronClaw's main branch has had no commits since 2026-09-10 and its last release was 2026-09-29 (checked 2026-11-04). The demo never depends on it.

## R14. Payments

- **Decision**: Phase A shows a dry NEAR Intents 1Click quote for "sponsor a refresh" (`dry: true`, `EXACT_OUTPUT`, 1 USDC from Base). No deposit address, no money. Phase B, only with explicit approval: one real quote and a ~$1 mainnet payment; MPP / HTTP 402 for agents as the next step.
- **Alternatives**: Stripe; x402 on Base (PingPay facilitator, needs an account); free when the maker brings their own agent.

## R15. Testing

- **Decision**: vitest. Unit tests per package; golden SVG tests (bytes) for determinism; contract tests for every tool across HTTP and MCP; JSON Schema tests on fixtures; one end-to-end skeleton test that runs the quickstart flow with a recorded model transcript and a fake map, plus a live variant (`PETAL_LIVE=1`) that uses NEAR AI Cloud and testnet.
- **Alternatives**: Jest; Playwright for the web E2E (added in Phase B for the judge path in a browser).

## R16. Hosting

- **Decision**: local first. Propose Vercel for web and API (Hobby allows 300 s per function with Fluid compute, enough for a 120 s agent chat). Deploying anything public needs explicit approval. The writer key and NEAR AI key go in the host's secret settings, never in the repo.
- **Alternatives**: Fly.io or a small VPS (lasting disk for the cache); Cloudflare Workers (Node compatibility of NEAR libraries uncertain).

## R17. Hero set (proposal)

Five flowers from at least four kinds of systems, all with complete data already pulled:

1. **NEAR validators**, segments = who backs each pool (closest to the product's vision).
2. **Bitcoin mining pools**, last month vs a year ago (proof of work, time segments).
3. **Ethereum staking**, Lido split into its operators (liquid staking).
4. **Ethereum miners before the Merge** (Sept 2022; a moment in history).
5. **A Sputnik DAO**: a rich council (`houseofstake.sputnik-dao.near`) or an open submission box (`marmaj`) (DAO governance).

The DAO hack needs a new pull of 2016 Ethereum data; it is a stretch. House of Stake is a Phase A input but not the demo opener (spec, 2026-11-03).

## R18. Exploration kept out of scope

Ideas beyond this spec stay outside the repo and are not requirements (publication boundary). The plan leaves room without building them: `order` is a primitive (last activity could be one value later), labels and index keys let maps join up, and payments are a quote only.

## R19. Runs you can leave and come back to

- **Decision**: every chat is a stored run (`RunStore`, `.petal/runs/` locally). The first SSE event names the `run_id`; the run continues if the browser disconnects (in process locally, `waitUntil` on a serverless host); `GET /api/v1/agent/runs/:id` returns it, and a chat with `run_id` continues from it.
- **Why**: the spec's edge case: generation may take long, and the user can leave and come back to the finished flower.
- **Alternatives**: a queue and worker (more moving parts); keeping runs only in the browser (lost on reload). On a host without lasting disk, runs need the same lasting store as new snapshot bodies (C3).

## R20. Correction requests

- **Decision**: a correction request is a signed entry on the shared map, `petal/v1/correction/<flower-id>/<id>`, signed with NEP-413 and written by Petal's writer (the relayed path of R9). People without a NEAR account use a prefilled GitHub issue instead. Contract: [shared-map.md](./contracts/shared-map.md#correction-requests-fr-022).
- **Why**: FR-022 needs a visible way to ask; the map keeps the request attributed and public, next to the label it concerns. The map is append-only, so "remove" hides a label in Petal's readers; the old row stays in FastData's history, and the page says so.
- **Alternatives**: email (private, unattributed); a form stored on Petal's server only (not shared).

## Sources (read 2026-11-04)

- FastData KV: docs.fastnear.com/fastdata/kv, docs.fastnear.com/openapi/kv-fastdata.json, github.com/fastnear/kv-fastdata-server, hackmd.io/@fastnear/__fastdata, hackmd.io/@fastnear/fastfs-docs, near.social/skill.md, api2.near.social/standard.md
- NEAR AI Cloud: cloud-api.near.ai/v1/models (keyless GET), docs.near.ai/cloud/verification/cloud-api/response-signatures, docs.near.ai/api-reference/attestation/*, docs.near.ai/cloud/guides/openai-compatibility
- NEAR Connect: registry.npmjs.org/@hot-labs/near-connect (0.12.0, 2026-10-26), github.com/azbang/near-connect, docs.near.org/web3-apps/tutorials/wallet-login
- NEP-413 and signing: github.com/near/NEPs/blob/master/neps/nep-0413.md, github.com/near/near-api-js (v7.4.0, `nep413`), github.com/near/near-cli-rs/blob/main/docs/GUIDE.en.md
- Testnet: docs.near.org/getting-started/faucet, docs.near.org/api/rpc/providers, rpc.testnet.fastnear.com (keyless)
- MCP: github.com/modelcontextprotocol/typescript-sdk (v2 server 2.4.0, hono adapter), github.com/vercel/mcp-handler
- Hono and Vercel: github.com/honojs/website, vercel.com/docs/functions/configuring-functions/duration
- Earlier step 1 and 2 notes as listed at the top.

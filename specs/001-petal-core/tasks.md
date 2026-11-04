---

description: "Task list for Petal core: walking skeleton on NEAR first, then deepen by user story, by milestones"
---

# Tasks: Petal core

**Input**: `specs/001-petal-core/` (spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md) and the constitution v1.2.1.

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md.

**Tests**: asked for by the plan (R15) and the contracts: schema tests, unit tests, golden SVG tests (bytes), contract tests (HTTP, MCP and CLI agree), the recorded and live end-to-end skeleton test, and Playwright for the judge path in Phase B.

**Organisation**: Elco's direction (2026-11-04) comes first. Work moves by **milestones, not days**: each ends when its "done when" line is true, as fast as that happens. The only dates are the **freeze (12 Nov)** and the **submission (13 Nov)**. M0–M2 are the **walking skeleton** (Phase A): every part stands up on NEAR, thin, and the quickstart flow passes end to end. M3–M9 deepen one user story at a time, in spec priority (Phase B). Plan exception C1 records why. A one-page overview is in [BOARD.md](./BOARD.md).

## Format

`- [ ] T000 [P] [US1] [W1] What to do, in which file. Deps: T000.`

- **[P]**: safe to run in parallel (different files, no open dependency).
- **[USn]**: the user story it serves. Setup, Foundational and Ship tasks serve every story, so they carry none (Spec Kit rule).
- **[W0]–[W8]**: the owning workstream (plan, Workstreams). One owner per directory.
- **[Elco]**: needs something from Elco. Placed where it blocks, with a stand-in so other work goes on.
- **[Elco OK]**: an outward action. Ask Elco at the time: push, making the repo public, deploy, X post, any signed transaction, any mainnet spend, sending the submission.
- **Deps**: tasks that must be done first. "Real when" means the task can start on stubs and becomes real when those land.

Paths are relative to `build/`, the repo root. `../` is the project folder outside the repo (`research/`, `design/`, `submission/`, `.secrets/`). Nothing under `../` is ever committed, and only what passes the publication boundary (T010) enters `build/`.

## Needs Elco

| What | Task | Blocks | Needed before | Stand-in |
|---|---|---|---|---|
| Approve this list and the publication boundary; confirm R9, C1, C4 | T001 | everything | M0 | none |
| Testnet accounts, writer function-call key, a testnet wallet, one-time OK to sign testnet transactions | T043 | T044, T072, T073 | M2 | `fakeMap()` plus mirror |
| NEAR AI Cloud key in `../.secrets/near-ai.env` | T059 | T060, T061, T072 | end of M1 | `recordedClient` replays a run |
| Sign the first publish; see the skeleton | T073, T075 | M3 | end of M2 | recorded E2E |
| Approve maker writes and an agent key in his wallet | T107 | the live US7 check | end of M5 | fake-map tests |
| Confirm the hero set (R17) | T108 | T115 | M6 | R17 as proposed |
| Beauty review; optional read test with people (SC-002) | T117, T118 | none | end of M6 | none |
| Host, lasting store for snapshots and runs, host secrets | T136 | T137 | M-Ship | local judge path (T138) |
| Narrated demo video | T145 | T151 | submission | none |
| Mainnet account `petals.near` | T147 | T152, T155 | submission | quote uses `petal-demo.near` |
| Submission facts | T148 | T152 | submission | none |

Licence: decided, **MIT** (Elco, 2026-11-04). No gate left.

---

## Phase 1: Setup (M0 Foundation, W0)

**Purpose**: an empty, pinned, testable workspace with a licence and a publication boundary. No product code yet.

- [X] T001 [Elco] Gate: Elco approves this file, the publication boundary allowlist in T010, and the contract changes made on 4 Nov (F1–F7, corrections, five doors; end of this file); confirms R9, C1 and C4; names the copyright holder for the MIT licence. No work starts before this. Deps: none.
- [X] T002 [W0] Root workspace: `package.json` (private, `"type": "module"`, `"license": "MIT"`, `"engines": { "node": ">=24 <25" }`, `"packageManager": "pnpm@10.33.0"`, scripts `test`, `test:e2e`, `dev`, `api`, `petal`, `lint`, `golden:update`, `gen:types`), `pnpm-workspace.yaml` (`packages/*`, `apps/*`), `.nvmrc` (`24.14.0`), `.npmrc` (`engine-strict=true`). Pin `typescript@7.0.2` (fallback 6.0.3), `vitest@^5.1`, `hono@^4.13.16` (not the 5.0 rc), `canonicalize@^5.1`, `ajv@^8.20` with `ajv-formats@^3.0.1`, `json-schema-to-typescript@^16`. pnpm is the global 10.33.0 inside nvm's v24, not corepack. Deps: T001.
- [X] T003 [P] [W0] TypeScript: `tsconfig.base.json` (strict, ES2023, NodeNext, `rewriteRelativeImportExtensions: true`, `erasableSyntaxOnly: true`) and a root `tsconfig.json` with project references. Relative imports carry `.ts` extensions, so Node 24 runs scripts directly with no tsx (`.js` imports fail with ERR_MODULE_NOT_FOUND). Workspace packages point `exports` at `src/index.ts`. Deps: T002.
- [X] T004 [P] [W0] Lint and format with one tool (Biome): `biome.json`, script `pnpm lint`. Deps: T002.
- [X] T005 [P] [W0] Package shells, each with `package.json` (`"license": "MIT"`) and `src/index.ts`: `packages/core` (depends on no other package), `packages/inputs` (core), `packages/near` (core), `packages/tools` (core, inputs, near), `packages/agent` (core, tools), `apps/web`, `apps/cli`, `skill/petal/`, `skill/ironclaw/`. Names as in `specs/001-petal-core/contracts/packages.md`. Deps: T002.
- [X] T006 [P] [W0] Local test runner, no CI: a root `vitest.config.ts` with `test.projects` (one project per package plus `tests/e2e`; Vitest 5 silently ignores `vitest.workspace.ts`) and `scripts/check.sh`. It starts with `source ~/.nvm/nvm.sh && nvm use`, because a login shell finds `~/.local/bin/node` (v22) first. It fails unless `node -v` starts with v24, then runs typecheck, lint, `pnpm test`, secret scan, fixture size and the publication boundary. Never call `timeout`: macOS has none. Deps: T002.
- [X] T007 [P] [W0] Fixture folders `fixtures/snapshots/`, `fixtures/map/`, `fixtures/golden/`, `fixtures/transcripts/`, with `fixtures/README.md` (what goes where; budget "≤ 5 MB gzipped each, ≤ 25 MB in total") and `scripts/check-fixture-size.ts`. Deps: T002.
- [X] T008 [P] [W0] Secrets hygiene: `.gitignore` (`node_modules/`, `.petal/`, `cache/`, `out/`, `.env*` except `.env.example`, `*.key`, `.secrets/`), `.env.example` listing every variable in quickstart.md plus `PETAL_PAYOUT_ACCOUNT`, `PETAL_API`, `PETAL_API_MOCK`, `PETAL_LIVE` and `PETAL_REPO_URL`, with no values, and `scripts/check-secrets.sh` (private-key and API-key patterns). Deps: T002.
- [X] T009 [P] [W0] `LICENSE` with the MIT text and the line `Copyright (c) 2026 Felipe Duarte (Elco Coel)` (Elco chose MIT and named the holder on 4 Nov). Deps: T002.
- [X] T010 [P] [W0] Publication boundary: `.publication-boundary` lists what may enter `build/` and `scripts/check-boundary.sh` enforces it. Allowlist (Elco approves at T001; any addition needs his OK): `packages/`, `apps/`, `skill/`, `fixtures/`, `scripts/`, `tests/`, `docs/`, `specs/`, `.specify/`, `.claude/skills/speckit-*`, and the root config files, `README.md`, `LICENSE`. Denylist: anything named like the explorations (`*atlas*`, `*economy*`, `petal-concept*`, `petal-quest*`), copies of `research/`, `design/`, `submission/` or `.secrets/`, raw `*.csv` dumps, and any content from the unpublished GIP-150 article material (method only, never its findings or addresses). The check runs in `scripts/check.sh`, as a git pre-commit hook (`core.hooksPath`), and before every push. Deps: T002.
- [X] T011 [W0] `git init` in `build/` and a first local commit (no remote, no push); the commit passes `scripts/check-boundary.sh`. Check `source ~/.nvm/nvm.sh && nvm use && pnpm install && pnpm test` passes. Deps: T003–T010.

**Parallel dispatch**: the lead alone. T003–T010 can go to one helper if wanted. No merges: one owner.

---

## Phase 2: Foundational (M0 Foundation, W0)

**Purpose**: turn the contracts into shared types, hashes, stubs and stand-ins, so every workstream builds without waiting.

**Done when (M0)**: `scripts/check.sh` passes on the empty workspace; the validators fixture is imported; contracts are frozen at `packages/v1` (T023).

**⚠️ CRITICAL**: no workstream starts before T023.

- [X] T012 [W0] Check `specs/001-petal-core/contracts/`, `data-model.md` and `quickstart.md` against the changes made on 4 Nov (end of this file); apply anything Elco changes at T001. Deps: T001.
- [X] T013 [W0] Copy `contracts/common-table.schema.json` and `contracts/petal-spec.schema.json` to `packages/core/schema/snapshot.schema.json` and `packages/core/schema/flower.schema.json`. Ajv (draft 2020-12, strict, with `addFormats(ajv)` from `ajv-formats`, or `date-time` throws) test that sample documents validate, in `packages/core/test/schema.test.ts`. Deps: T005, T012.
- [X] T014 [W0] Generate types with `json-schema-to-typescript` into `packages/core/src/types/generated/snapshot.ts` and `generated/flower.ts`, one file per schema, because both emit `Datetime` (TS2300 if combined). Use `unreachableDefinitions: true` so `Correction` is emitted. Checked in; `pnpm gen:types`. In `types/index.ts`, alias the title-named roots as `Snapshot` (`PetalSnapshotCommonTableV1`) and `Entry` (`PetalSpecInterpretationAndPublishedFlowerEntryV1`). Hand-write the other shared types in `packages/core/src/types/index.ts`: `Figures`, `FigureChanges`, `LegendItem`, `PetalDetail`, `NetworkDescriptor`, `Capabilities`, `ProposeInput`, `ToolError`, `AgentEvent`, `Run`, `MapRow`, `QuoteRequest`, `QuoteResult`, `SnapshotRequest`, `SnapshotResult`, `Progress` (from tools.md, renderer.md, http-api.md, packages.md, shared-map.md). Deps: T013.
- [X] T015 [W0] Canonical JSON and hashes in `packages/core/src/hash.ts`: `canonicalJson` (RFC 8785, `canonicalize` 5.1 passes the §3.2.2 and §3.2.3 vectors), `sha256Hex` (on `@noble/hashes/sha2.js`, not `node:crypto`, because `apps/web` imports core), `specHash`, `entryId` ("first 24 hex characters of SHA-256 over the canonical entry without `id`"). Tests with RFC 8785 vectors and a value re-serialised with sorted keys, in `packages/core/test/hash.test.ts`. Deps: T014.
- [X] T016 [W0] Interface stubs for every signature in `contracts/packages.md` (`PRIMITIVES`, `compareFigures`, `mapKeys`, `serveStdio`, `RunStore`, `agentRoutes`, `petalApp` included), in `packages/core/src/index.ts`, `packages/inputs/src/index.ts`, `packages/near/src/{map,auth,pay}/index.ts`, `packages/tools/src/index.ts`, `packages/agent/src/index.ts`. Each throws `not_implemented`. Add `packages/core/src/versions.ts` (`tools/v1`, `api/v1`, `map/v1`, `render/v1`, `default/v1`). Deps: T014.
- [X] T017 [W0] Import the NEAR validators fixture: `scripts/import-spike-data.ts` calls `importSpike` in `packages/inputs/src/import/spike.ts` (W0 seeds it; W2 owns it after T023). Reads `../research/data/near/producers.json`, `producers.participants.csv` and `producers.relationships.csv`. Keeps every delegation of at least 1,000 NEAR; folds the rest into "one `group` row per pool and backer class", declared in `coverage.grouped[]` with rule, rows folded and amount. Writes `fixtures/snapshots/<sha256>.json.gz` and `fixtures/snapshots/index.json`. Check: 8,319 delegations kept, 98.76% of delegated stake, ≤ 5 MB gzipped, schema-valid. Deps: T013, T015.
- [X] T018 [P] [W0] Small schema-valid test snapshots: `fixtures/snapshots/test/two-participants.json`, `fixtures/snapshots/test/tiny-backers.json` (5 pools, every backer class), and `fixtures/golden/inputs/house-of-stake-2026-11-04.json.gz` imported from `../research/data/near-dao/house-of-stake.json` (for goldens only; outside the store's lookup path, so the quickstart's live pull stays live). Deps: T013, T015.
- [X] T019 [P] [W0] `fakeMap()` (in-memory `MapWriter & MapReader`, records the writer, fake tx hash) in `packages/near/src/map/fake.ts`, and a reader/writer suite every map client must pass in `packages/near/test/map-suite.ts`. Deps: T016.
- [X] T020 [P] [W0] Hand-made skeleton transcript `fixtures/transcripts/skeleton.hand.json` (the tool order of quickstart step 2) and `recordedClient` in `packages/agent/src/recorded.ts`. Deps: T016.
- [X] T021 [P] [W0] Recorded 1Click dry quote `fixtures/transcripts/1click-dry-quote.json` (shape from `../research/near-map-pay.md`, 4 Nov) and `fakeQuote()` in `packages/near/src/pay/fake.ts`. Deps: T016.
- [X] T022 [P] [W0] Test NEP-413 signer and a fake RPC whose `view_access_key` answers full-access or function-call, in `packages/near/src/auth/testing.ts`. noble 2.x imports need `.js` subpaths: `@noble/curves/ed25519.js`, `@noble/hashes/sha2.js`. Deps: T016.
- [X] T023 [W0] Freeze the contracts at `packages/v1`: every package compiles against the stubs, `scripts/check.sh` passes, commit. From here, contract changes go through the lead and bump the version. Deps: T017–T022.

**Parallel dispatch**: the lead runs T012–T016 in order. Then three agents at once: A does T017 (slowest: large CSVs), B does T018 and T019, C does T020–T022. Merge T017 first (others don't touch it), then B, then C. The lead closes with T023.

---

## Phase 3: Walking skeleton (M1 Parts in parallel, then M2 Skeleton proven) 🎯 MVP

**Goal**: every part stands up on NEAR, thin: gallery → chat with Petal's agent on NEAR AI Cloud → tools count and validate → deterministic SVG → NEP-413 publish to the shared map on FastData (testnet) → the same spec through Claude Code with the skill → a dry NEAR Intents quote.

**Done when (M1)**: each part passes its own tests on fakes; `pnpm petal render near-validators` writes the validators flower; `/make` answers the skeleton question (recorded) and draws.

**Done when (M2)**: quickstart.md steps 1–5 pass live once; `pnpm test:e2e` passes (recorded); Elco has seen it.

### M1 · W1 Core (`packages/core`): first wave. Critical path.

- [X] T024 [P] [US1] [W1] `validateSnapshot` in `packages/core/src/validate/snapshot.ts`: schema plus "Every row's `source` matches a `sources[].id`. Every row has a date."; `group` rows carry `count`; grouping allowed only "when declared in `coverage.grouped[]`". Tests in `packages/core/test/validate-snapshot.test.ts`. Deps: T023.
- [X] T025 [P] [US1] [W1] `computeFigures` in `packages/core/src/figures/index.ts`: total, shares, rank, top-k (1, 5, 10, 100), Nakamoto (threshold stated: 1/3 for BFT chains, else 1/2), HHI, Gini "over included participants", tail, `figure_ids`. BigInt sums on `amount_raw`. "Shares are rounded to 6 decimals; amounts stay decimal strings." Test: Nakamoto is 9 on the validators fixture, in `packages/core/test/figures.test.ts`. Deps: T023.
- [X] T026 [P] [US1] [W1] `selectPetals` (top N plus a declared tail; `petals` is a cap of 5–300, so fewer participants give one petal each and no tail) in `packages/core/src/select.ts`, and `backerSegments` (other delegators, accounts with 1M+ NEAR, liquid-staking contracts, lockups) in `packages/core/src/segments/backers.ts`. Tests. Deps: T023.
- [X] T027 [P] [US1] [W1] Purity test: fails if `packages/core` imports `node:fs` or `node:net`, calls `fetch`, or reads the clock or randomness (FR-023, renderer.md), in `packages/core/test/purity.test.ts`. Deps: T023.
- [X] T028 [US1] [W1] `PRIMITIVES`, `DEFAULT_CONVENTION` and `buildSpec` in `packages/core/src/primitives.ts`, `convention/default.ts` and `convention/build-spec.ts`. `PRIMITIVES` gives each primitive's status in this build (FR-032): available now width, height, colour, outline, segments (`backers`), order (`measure_desc`); `lines` and `markings` unavailable until they land; texture, extrusion and opacity unavailable, declared, never imitated. Defaults: "width = share in a 2× band, height = sqrt share, colour = kind, outline = identity status, segments = none unless the population declares a default, order = largest first, clockwise from the top (`measure_desc`), 60 petals plus a tail". Fill standard meanings and source ids from the descriptor, `encodings.order` included. Test: same choices give the same `spec_sha256`. Deps: T026.
- [X] T029 [US1] [W1] `validateSpec` in `packages/core/src/validate/spec.ts`: the eight rules in data-model.md, including "`width.max_ratio` ≤ 3", "If `petals` < participants included, the tail is grouped and declared", every primitive (order included) with a meaning and a known source, no primitive marked `unavailable` (FR-032), and, with an interpretation, every mapping cited and `unknowns` with "at least one entry". One test per rule. Deps: T024, T028.
- [X] T030 [US1] [W1] `renderFlower` in `packages/core/src/render/{geometry,svg,legend,index}.ts`: port only the geometry of `draw()` in `../research/spikes/flower/index.html`, as `contracts/renderer.md` describes (polygon, width band, sub-sides, gaps, bars, segments, outline, tail hatch; straight edges only; petals clockwise in `encodings.order.by`), with its determinism rules. Returns `svg`, `legend` (an order line included), `petals`, `render_sha256`. Refuses any spec `validateSpec` rejects; never draws an unavailable primitive (FR-032). Deps: T026, T029.
- [X] T031 [US1] [W1] Golden tests in `packages/core/test/golden.test.ts` with `fixtures/golden/near-validators-default.{svg,json}`, `near-validators-backers.{svg,json}` and `house-of-stake-default.{svg,json}`; `pnpm golden:update` writes them; a fresh-process run must give the same hashes. Deps: T030, T017, T018.
- [X] T032 [P] [US1] [W1] Early exit check before the CLI exists: `packages/core/scripts/render-fixture.ts` writes the validators flower to `out/near-validators.svg`. Deps: T030.

### M1 · W2 Inputs (`packages/inputs`): first wave.

- [X] T033 [P] [US7] [W2] `fileStore` in `packages/inputs/src/store/file-store.ts`: canonical bytes, gzip on disk as `<sha256>.json.gz`, index `cache/index.json` from (chain, population, block_height) to sha256; looks in fixtures, then cache. Tests: round trip; gzip never changes the hash. Deps: T023.
- [X] T034 [P] [US1] [W2] RPC pool in `packages/inputs/src/rpc/pool.ts`: dRPC, then FastNEAR, then Shitzu (with a User-Agent); paced to the measured limits; `finality: "final"` or a fixed `block_id`; backs off on 429; names the source that failed. Tests on a fake fetch. Deps: T023.
- [X] T035 [US1] [W2] `near-validators` module in `packages/inputs/src/modules/near-validators.ts`: descriptor (`near-validators`, `near:mainnet`, `validators`, measures, segment kind `backers`, standard meanings and source ids per primitive, cost), served from the fixture. Deps: T017, T033.
- [X] T036 [US1] [W2] `near-house-of-stake` module, live, in `packages/inputs/src/modules/near-house-of-stake.ts`: holders, veNEAR power and delegations (~10 keyless calls, ~10 s), following `../research/spikes/near-dao/house_of_stake.py`; progress events; reads at final blocks. Test on recorded responses in `packages/inputs/test/fixtures/hos/`. Deps: T034.
- [X] T037 [US7] [W2] `getSnapshot` in `packages/inputs/src/get-snapshot.ts`: resolve `at` to a block; look in fixtures, cache, then the map index; if found and final, return `reused: true`; else fetch, canonicalise, hash, store, and (when final and a map is set) write `petal/v1/snapshot/<sha256>` and `petal/v1/index/<caip2>/<population>/<block_height>`. `fresh: true` skips reuse only for non-final data. Test on `fakeMap()`: the second call is reused in ≤ 300 ms. Deps: T033, T035, T036, T019.

### M1 · W3 NEAR adapters (`packages/near`): first wave.

- [X] T038 [P] [US7] [W3] `fastDataReader` in `packages/near/src/map/fastdata-reader.ts`: `latest` (one call per trusted writer, following `page_token`) and `get`; re-canonicalise values before hashing; send `FASTNEAR_API_KEY` only if set. Passes `packages/near/test/map-suite.ts` on recorded responses. Deps: T019.
- [X] T039 [P] [US7] [W3] `fastDataWriter` and `mapKeys` in `packages/near/src/map/fastdata-writer.ts` and `keys.ts`: one `__fastdata_kv` call (gas 1, deposit 0, `throwOnFailure: false`) signed with the function-call key in `PETAL_WRITER_KEY_FILE`; the no-contract failure counts as success; poll the KV read for up to 30 s. "Keys ≤ 1,024 bytes; values ≤ 256 KiB; ≤ 256 keys per call." Unit tests on a fake RPC. Deps: T019.
- [X] T040 [P] [US7] [W3] `mirror(dir, inner)` in `packages/near/src/map/mirror.ts`: a copy of every write in `.petal/mirror/`; `pending` when the write fails; a retry job. Tests. Deps: T019.
- [X] T041 [P] [US7] [W3] `issueNonce` (32 random bytes, valid 5 min, used once) and `verifyNep413` (`near-api-js` v7 `verifyMessage`; the key must be a full-access key of the account) in `packages/near/src/auth/nonce.ts` and `nep413.ts`. Tests: a valid proof passes; a wrong message, a reused nonce, a stale nonce and a function-call key each fail. Deps: T022.
- [X] T042 [P] [US7] [W3] `quote1Click`, dry only (FR-031), in `packages/near/src/pay/one-click.ts`: `dry: true`, `EXACT_OUTPUT`, 1 USDC paid from Base USDC, recipient `PETAL_PAYOUT_ACCOUNT` (stand-in `petal-demo.near`, as in the 4 Nov try). Test on the recorded quote. Deps: T021.
- [ ] T043 [US7] [Elco] Testnet: Elco creates `petals.testnet` (no contract, ever) and `writer.petals.testnet`; adds a function-call key limited to `petals.testnet` and `__fastdata_kv` (allowance 1 NEAR); saves it as `../.secrets/petal-writer.testnet.json`; has a Meteor or Intear wallet with a `.testnet` maker account; gives a one-time OK for the build to sign testnet transactions with the writer key. Blocks T044, T072, T073. Stand-in: `fakeMap()` plus mirror. Deps: none.
- [ ] T044 [US7] [W3] [Elco OK] Testnet smoke test `packages/near/test/testnet.smoke.test.ts` (only with `PETAL_LIVE=1`): write one entry, read it back by key and by prefix, compare hashes, check the mirror. Signing is covered by T043's OK. Deps: T038–T040, T043.

### M1 · W4 Tools, HTTP tool routes, MCP (`packages/tools`): second wave, on stubs.

- [ ] T045 [US1] [W4] `createContext(cfg)` in `packages/tools/src/context.ts`: reads the env list in quickstart.md; wires store, modules, map reader and writer (fake unless configured), RPC, progress and budget. Deps: T023.
- [ ] T046 [US1] [W4] Registry in `packages/tools/src/registry.ts`: one list of tools with input and output JSON Schemas; errors returned, not thrown, with the codes in tools.md; `tools_version` on every output. Deps: T045.
- [ ] T047 [P] [US1] [W4] Read tools in `packages/tools/src/tools/{networks,snapshots,figures}.ts`: `list_networks`, `get_network`, `get_snapshot` (with progress), `describe_snapshot` (`top` default 10, max 50; never the raw body; `primitives` with each one's status from `PRIMITIVES`, FR-032), `compute_figures`. Deps: T046. Real when T025, T037 land.
- [ ] T048 [P] [US1] [W4] Spec tools in `packages/tools/src/tools/{specs,render}.ts`: `propose_spec` (an unavailable primitive gives `bad_input` saying "not available yet", FR-032), `validate_spec`, `render_flower` (`include_svg` default false on MCP, true on HTTP; `view_url` is `/draft?spec=`). Deps: T046. Real when T028–T030 land.
- [ ] T049 [P] [US7] [W4] Map tools in `packages/tools/src/tools/{flowers,publish}.ts`: `list_flowers` (trusted writers plus hero fixtures, with `where`), `get_flower` (with `verified`; `corrections` empty until T082), `prepare_publish` (keeps the draft in `.petal/drafts/<entry_sha256>.json`; returns `message`, `nonce`, `sign_url`), `publish_flower` (verify, build the final entry, write `petal/v1/spec/<id>`, mirror). Deps: T046. Real when T038–T041 land.
- [ ] T050 [P] [US7] [W4] `quote_payment`, dry only (FR-031; purposes `sponsor_refresh` and `sponsor_coverage`), in `packages/tools/src/tools/quote.ts`. Deps: T046, T042.
- [ ] T051 [P] [US1] [W4] `mcpServer` and `serveStdio` in `packages/tools/src/mcp/server.ts` and `stdio.ts` (`@modelcontextprotocol/server` v2, `fromJsonSchema()` from the root, `StdioServerTransport` from `@modelcontextprotocol/server/stdio`, progress as `notifications/progress`; stateless Streamable HTTP at `/mcp`, optionally through `@modelcontextprotocol/hono` 2.0.2). Deps: T046.
- [ ] T052 [US1] [W4] `httpApp(ctx)` (Hono 4) in `packages/tools/src/http/app.ts`: every tool route in http-api.md, and no agent routes (they live in `@petal/agent`, so dependencies stay one way); status per error code; open CORS; per-IP limits (60 tool calls a minute); SSE for long tools; `GET /api/v1/health`; snapshot bodies with immutable cache headers; `GET /api/v1/flowers/:id/svg`; `/mcp` mounted from T051. Deps: T047–T050, T051.
- [ ] T053 [US1] [W4] Contract tests in `packages/tools/test/contract/`: each tool's input and output match their schemas on the validators fixture; HTTP and MCP return the same JSON; the same choices give the same `spec_sha256` through both; one test per error code. Deps: T052, T051.

### M1 · W5 Agent and agent routes (`packages/agent`): second wave, on `recordedClient`.

- [X] T054 [P] [US1] [W5] Shared prompt `packages/agent/src/prompt.md`, exported as `SYSTEM_PROMPT`: the skill's six steps; quote only tool figures; cite a source for every mapping; `unknowns` never empty; say plainly what Petal can't read or draw (unavailable primitives, FR-032); check `list_flowers` first and offer an existing flower for the same network and date unless the user asks for a fresh analysis. Deps: T023.
- [X] T055 [P] [US1] [W5] `nearAiClient` in `packages/agent/src/near-ai.ts`: `openai` SDK at `https://cloud-api.near.ai/v1`; model `z-ai/glm-5.3-flash`, fallbacks `Qwen/Qwen3.8-27B` then `deepseek-ai/DeepSeek-V4.1-Flash-1017`; not streamed; headers `x-no-aliasing: true` and `Accept-Encoding: identity`; keeps request and response SHA-256. Deps: T023.
- [X] T056 [P] [US1] [W5] Model signature in `packages/agent/src/signature.ts`: fetch the attestation report before the completion and `GET /v1/signature/{id}` right after; build `ModelSignature`; keep the report in `.petal/attestations/<report_sha256>.json` for the attestation route (T058). Deps: T055.
- [X] T057 [US1] [W5] `runAgent` in `packages/agent/src/run.ts`: calls the registry in process; emits `run` (first), `stage`, `progress`, `tool_call`, `tool_result`, `message`, `flower`, `signature`, `error`, `heartbeat` (every 10 s), `done`; limits 8 tool rounds, 120 s, $0.05 a chat; daily cap `PETAL_LLM_DAILY_USD` (default 3), then `budget_exhausted` pointing to the skill. Tests on `recordedClient`. Deps: T020, T046, T054.
- [X] T058 [US1] [W5] Agent routes and `petalApp` in `packages/agent/src/{routes,app,runs,serve}.ts`: `fileRunStore` (`.petal/runs/`); `agentRoutes` with `POST /api/v1/agent/chat` (SSE; 10 chats an hour per IP), `GET /api/v1/agent/runs/:id` (JSON) and `GET /api/v1/attestations/:sha256`; `petalApp(cfg)` = `httpApp(ctx)` + `agentRoutes`; with no key, recorded mode (`done.model = "recorded"`, `health.llm = "recorded"`); standalone `pnpm api` on :8787. Tests: SSE order `run → stage → tool_call → tool_result … → flower → signature → done`; a stored report is served byte for byte, in `packages/agent/test/routes.test.ts`. Deps: T052, T056, T057.
- [ ] T059 [US1] [Elco] NEAR AI key: Elco puts `NEAR_AI_API_KEY` in `../.secrets/near-ai.env` (the file exists; the value is empty). Blocks T060, T061, T072. Stand-in: `recordedClient` with `fixtures/transcripts/skeleton.hand.json`. Deps: none.
- [ ] T060 [US1] [W5] Model bake-off: the skeleton question on all three models; keep the best that quotes only tool figures, passes `validate_spec` within two tries and cites sources. Results in `fixtures/transcripts/bakeoff/`. Spend stays inside the $3 daily cap. Deps: T056, T057, T059.
- [ ] T061 [US1] [W5] Record one real skeleton run, with its signature, in `fixtures/transcripts/skeleton.json`; `recordedClient` replays it for tests and judges. Deps: T060.

### M1 · W6 Web (`apps/web`): second wave, on the API mock. No UI polish.

- [X] T062 [US1] [W6] Next.js App Router in `apps/web/`; the API mounted at `apps/web/app/api/[[...route]]/route.ts` with `@hono/vercel` and `petalApp`. Until T058 lands, `apps/web/lib/api-mock.ts` serves `fixtures/` on the same routes (`PETAL_API_MOCK=1`). UI comments go to `../design/ui-notes.md`, not into code. Deps: T023.
- [X] T063 [P] [US7] [W6] Gallery `/` in `apps/web/app/page.tsx`: `list_flowers`, badges "on NEAR" (with the tx link) and "fixture"; no sign-in. Deps: T062.
- [X] T064 [P] [US1] [W6] Flower view `/f/[id]` and draft view `/draft?spec=` in `apps/web/app/f/[id]/page.tsx` and `apps/web/app/draft/page.tsx`, with `apps/web/components/{Flower,Legend,Interpretation,PetalDetails}.tsx`: the SVG, its date (`as_of`), a legend line for every primitive used, the interpretation with sources and unknowns, the model signature or "recorded run, no signature", who published it and when (if published), and petal details on click through `data-p` (account, identity with its status, the values behind each primitive). Deps: T062.
- [X] T065 [P] [US1] [W6] Maker chat `/make` in `apps/web/app/make/page.tsx`: SSE client, list of stages, tool calls, the flower inline; keeps the `run_id` from the `run` event in the URL. Deps: T062.
- [X] T066 [P] [US7] [W6] Publish page `/publish/[draft]` in `apps/web/app/publish/[draft]/page.tsx`: `@hot-labs/near-connect` 0.12 on testnet, `connect({ signMessageParams })` (sign-in and signature in one prompt); `prepare_publish`, sign, `publish_flower`; shows key, writer, explorer link, and "the receipt shows as failed because the receiver has no contract; that is expected". Deps: T062. Live check needs T043.
- [X] T067 [P] [US7] [W6] "Sponsor a refresh" panel in `apps/web/components/QuotePanel.tsx` (FR-031; the same panel quotes new coverage on a network Petal can't read yet): amount in, time, fees; label "Dry quote. Paying is not switched on."; no deposit address. Deps: T062.

### M1 · W7 Doors: skill and CLI (`skill/`, `apps/cli`): second wave.

- [X] T068 [P] [US1] [W7] `skill/petal/SKILL.md` in the Agent Skills format (as NEAR's `near/agent-skills`: frontmatter with name and description, then instructions), built from `packages/agent/src/prompt.md` by `skill/build.ts`: the six steps; `curl` calls to `PETAL_API` (default `http://localhost:8787`); MCP names where configured; publish only through `prepare_publish` and `sign_url`; never ask for a key. Deps: T054.
- [X] T069 [P] [US1] [W7] `skill/petal/README.md`: install in Claude Code (`~/.claude/skills/petal/`, or `claude mcp add petal -- pnpm -s --dir <repo> petal mcp`, where `<repo>` is the clone's root), Codex, and IronClaw (`~/.ironclaw/skills/`). Deps: T068.
- [X] T070 [US1] [W7] The `petal` CLI in `apps/cli/src/main.ts` (bin `petal`, root script `pnpm petal`): thin; one subcommand per registry tool, generated from the registry (`networks`, `snapshot`, `describe`, `figures`, `propose`, `validate`, `render`, and later ones such as `compare`), calling it in process and printing JSON (`render` can write the SVG to a file); plus `mcp` (stdio, `serveStdio`) and `api` (`petalApp` on :8787). Parity test: the CLI and HTTP return the same JSON, in `apps/cli/test/parity.test.ts`. Deps: T046, T051, T058. Real when T047–T048 land.

### M2 · W8 Integration (lead, `tests/e2e`): third wave.

- [ ] T071 [US1] [W8] Recorded end-to-end test `tests/e2e/skeleton.test.ts` (`pnpm test:e2e`): quickstart steps 1–5 on `recordedClient`, `fakeMap()`, the test signer, recorded House of Stake responses and the recorded quote. Checks: gallery lists `map` and `fixture`; chat events in order (`run` first), with `propose_spec` using `segments: "backers"` and no gap over 10 s; every number in the answer is in `compute_figures`; publish, read back, recomputed hash equals the id; House of Stake first `reused: false`, then `reused: true` in under 1 s; bad proofs return `unauthorised`; the MCP door (`petal mcp`) gives the same `spec_sha256`; quote has `dry: true`. Deps: T031, T037, T053, T058, T064–T067, T070.
- [ ] T072 [US1] [W8] [Elco OK] Live run `PETAL_LIVE=1 pnpm test:e2e`: NEAR AI Cloud, testnet map, live dry quote. The chat ends within 120 s (typically 60 s) with no progress gap over 10 s. Signing covered by T043. Deps: T071, T044, T061.
- [ ] T073 [US7] [W8] [Elco] First flower on NEAR: Elco signs the skeleton flower's publish message in his wallet (quickstart step 3). It shows in the gallery as "on NEAR" with "signed by <account>" verified, and the `kv.test.fastnear.com` read returns it. Deps: T066, T072.
- [ ] T074 [US1] [W8] Clean-checkout check: golden tests pass twice in a row (SC-005); `scripts/check-secrets.sh` and `scripts/check-boundary.sh` find nothing; fixtures within budget. Deps: T031, T071.
- [ ] T075 [US1] [W8] [Elco] Show Elco the skeleton: quickstart steps 1–5 live, step 4 in Claude Code with the skill. Each gap becomes a task in M3 (T076). Deps: T069, T073, T074.

**Parallel dispatch (Phase 3)**:

| Wave | Agent | Tasks | Needs |
|---|---|---|---|
| 1 | W1 Core | T024–T032 | T023, validators fixture (T017) |
| 1 | W2 Inputs | T033–T037 | T017, `fakeMap()` (T019) |
| 1 | W3 NEAR | T038–T042, then T044 | T019, T021, T022; T043 for live |
| 2 | W4 Tools | T045–T053 | stubs; real results as W1–W3 merge |
| 2 | W5 Agent | T054–T058, T060–T061 | `recordedClient` (T020), registry (T046); T059 for live |
| 2 | W6 Web | T062–T067 | API mock; `petalApp` (T058) to switch over |
| 2 | W7 Doors | T068–T070 | `prompt.md` (T054), registry (T046) |
| 3 | W8 Lead | T071–T075 | everything above |

Waves overlap: wave 2 may start the moment T023 is frozen, since it builds on stubs. Merge order: W1 → W2 → W3 → W4 → W5 → W6 → W7 → W8. `scripts/check.sh` must pass after each merge. W1 merges first and often, because every other package imports it. Each agent works on its own branch in its own git worktree (after T011) and touches only its own directory.

Critical path: T001 → T002 → T005 → T012 → T013 → T014 → T015 → T017 → T023 → T026 → T028 → T029 → T030 → T046 → T052 → T057 → T058 → T071 → T072 → T075. Outside gates on it: T043 (testnet) and T059 (NEAR AI key) before T072.

---

## Phase 4: User Story 1, made flawless on a network nobody prepared (Priority: P1) · M3

**Goal**: any Sputnik DAO by account, live; plain "can't read yet" answers; docs and forum citations; full petal details and inner lines; runs you can come back to; correction requests (FR-022).

**Done when (M3)**: a DAO nobody prepared renders live with a cited interpretation, and the independent test below passes.

**Independent test**: give Petal a network the team has not prepared. It shows progress throughout and ends with a flower, a legend for every primitive, an interpretation with cited sources, and working petal details.

- [ ] T076 [US1] [W8] Fix the gaps found at T075. Add one task per gap here before work starts. Deps: T075.
- [ ] T077 [P] [US1] [W2] `near-sputnik-dao` live module in `packages/inputs/src/modules/near-sputnik-dao.ts`: any Sputnik v2 DAO by account (`params.dao`); policy roles, members, proposals and votes (2–25 s), following `../research/spikes/near-dao/daolib.py`; progress; reads at final blocks; descriptor with measures and segment kind `roles`. Test on recorded responses for `marmaj.sputnik-dao.near`. Deps: T034, T037.
- [ ] T078 [P] [US1] [W2] Partial data in `packages/inputs/src/get-snapshot.ts`: when a source fails, mark `coverage.partial` and `failed_sources`, or stop with `source_failed` naming the source. Tests on a failing fake RPC. Deps: T037.
- [ ] T079 [P] [US1] [W4] "Can't read yet" in `packages/tools/src/tools/networks.ts`: `cannot_read` with the reason and the nearest networks Petal can read (FR-001); `cannot_read_hint` in `list_networks`. Tests for an Ethereum DAO and a NEAR contract that is not a Sputnik DAO. Deps: T047.
- [ ] T080 [P] [US1] [W4] `find_documents` tool in `packages/tools/src/tools/documents.ts`: public docs and forum pages (DAO metadata links, gov.near.org) returned as `documents[]` with `id`, `kind`, `url`, `title`, `fetched_at`. Contract test. Deps: T046.
- [ ] T081 [P] [US1] [W3] Correction requests (FR-022) in `packages/near/src/map/corrections.ts`, as in shared-map.md: build the request, its id ("first 24 hex characters of the SHA-256 of the canonical request without `id` and `proof`") and the NEP-413 message; write `petal/v1/correction/<flower-id>/<id>` with Petal's writer after verification; read open requests per flower; build the GitHub-issue fallback link from `PETAL_REPO_URL`. Tests on `fakeMap()`: round trip, id matches key, unsigned or tampered requests refused. Deps: T039, T041.
- [ ] T082 [US1] [W4] `prepare_correction` and `submit_correction` tools (FR-022) in `packages/tools/src/tools/corrections.ts` (routes `POST /api/v1/corrections/prepare` and `POST /api/v1/corrections`), and `get_flower.corrections`. Contract tests. Deps: T049, T081.
- [ ] T083 [P] [US1] [W1] Inner lines in `packages/core/src/render/lines.ts`: the `lines` primitive (`shared_delegators`, `delegation`, `co_vote`) drawn from side midpoints, 3 px inside the polygon; fill `PetalDetail.interactions`; flip `lines` to available in `PRIMITIVES`. Golden `fixtures/golden/near-validators-lines.svg`. Deps: T030.
- [ ] T084 [P] [US1] [W1] Edge-case goldens and speed: a 2-participant flower (two petals, no tail; says power is fully concentrated), a 1,000-participant flower with the tail grouped (SC-006), a thumbnail, all in `fixtures/golden/`; 300 petals render in ≤ 50 ms in `packages/core/test/perf.test.ts`. Deps: T031.
- [ ] T085 [P] [US1] [W1] Non-individuals (FR-016): legend keys and petal details say "not an individual" for contract, treasury, exchange, custodian and staking accounts, in `packages/core/src/render/legend.ts`. Deps: T030.
- [ ] T086 [US1] [W5] Unprepared networks in `packages/agent/src/prompt.md` and `run.ts`: pick a module from `list_networks`; call `find_documents` and cite it; name conflicting power sources and which one drives the flower; if no docs or forum exist, say the flower rests on chain data alone; say plainly when Petal can't read. Recorded tests for `marmaj.sputnik-dao.near` and one "can't read" case in `packages/agent/test/unprepared.test.ts`. Deps: T077, T079, T080.
- [ ] T087 [P] [US1] [W5] Runs in full in `packages/agent/src/runs.ts` and `routes.ts`: a run keeps going when the browser disconnects (in process locally; `waitUntil` on a serverless host); `GET /api/v1/agent/runs/:id` with `Accept: text/event-stream` replays stored events, then streams new ones; a chat with `run_id` continues from the run's messages and draft. Test: disconnect mid-run, later get the finished run and its flower. Deps: T058.
- [ ] T088 [P] [US1] [W6] Full petal details and inner space in `apps/web/components/PetalDetails.tsx` and `InnerSpace.tsx`: identity source and a proven or inferred label (dashed for inferred), values behind each primitive, interactions; selecting the inner space shows labelled lines; on every identity, "Request a correction or removal" (FR-022): a signed request (sign in, `prepare_correction`, sign, `submit_correction`) or, without a NEAR account, the GitHub-issue link; open requests shown next to the link. Deps: T064, T082, T083.
- [ ] T089 [P] [US1] [W6] `/make?run=<id>` shows a running or finished run after a reload, in `apps/web/app/make/page.tsx`. Deps: T065, T087.
- [ ] T090 [US1] [W8] [Elco OK] Unprepared-network test `tests/e2e/unprepared.test.ts`: recorded (`marmaj`), and live with `PETAL_LIVE=1` on a v2 DAO picked at random from the factory list; progress throughout; legend, cited interpretation, petal details; a correction request round-trips on the fake map. Live snapshot refs go to testnet (covered by T043). Deps: T086, T088, T089.

**Parallel dispatch**: first the lead does T076. Then at once: W1 (T083–T085), W2 (T077–T078), W3 (T081), W4 (T079–T080, then T082 once W3 merges), W5 (T087, then T086 once W2 and W4 merge), W6 (T088–T089 once W1, W4 and W5 merge). Merge order: W1 → W2 → W3 → W4 → W5 → W6 → W8 (T090).

---

## Phase 5: User Story 2, talk to change how the flower is drawn (Priority: P2) · M4

**Goal**: a plain request changes one mapping; the agent explains and redraws a labelled variation.

**Done when (M4)**: one plain request redraws a labelled variation with an updated legend; the default is unchanged; a request for an unbuilt primitive gets "not available yet".

**Independent test**: open any flower, ask in plain words to change one mapping; a new flower renders with an updated legend, and the default is unchanged.

- [ ] T091 [P] [US2] [W1] Variations in `packages/core/src/convention/build-spec.ts`: `variation_of` is the parent `spec_sha256`; `changes[]` in plain words; the default spec stays unchanged. Tests in `packages/core/test/variation.test.ts`. Deps: T028.
- [ ] T092 [P] [US2] [W1] Figure check in `packages/core/src/validate/figure-check.ts`: "every percentage in the interpretation matches a figure within 0.05 points", and every number in `summary` and `power_means` refers to a figure id (FR-025). Tests. Deps: T025, T029.
- [ ] T093 [P] [US2] [W4] In `packages/tools/src/tools/specs.ts`: `propose_spec` `bad_input` lists the allowed values and the closest alternative (for example `segments: "backers"` on Bitcoin), and says "not available yet" for texture, extrusion or opacity (FR-032); `validate_spec` runs the figure check. Contract tests. Deps: T048, T092.
- [ ] T094 [US2] [W5] Change a mapping in one exchange (SC-008): from the open draft, `propose_spec` with `variation_of`, explain, redraw; if the primitives can't express it, or it needs an unbuilt primitive, say so and offer the closest alternative, never imitate it (FR-032). Recorded tests for "make colour mean identity", one request that can't be expressed and one for texture, in `packages/agent/test/variation.test.ts`. Deps: T091, T093.
- [ ] T095 [P] [US2] [W6] Variation view in `apps/web/components/VariationBanner.tsx` and `ChatPanel.tsx`: "variation of the default" label, its own legend, the list of changes, a link back to the default; the chat is available on `/f/[id]` and `/draft`. Deps: T064, T065.
- [ ] T096 [P] [US2] [W7] Skill: how to change a mapping with `variation_of`, and what to say about unbuilt primitives, in `skill/petal/SKILL.md`. Deps: T068.
- [ ] T097 [US2] [W8] Variation test `tests/e2e/variation.test.ts`: one plain request redraws a variation with an updated legend; the default is unchanged; a texture request draws nothing new and says "not available yet". Deps: T094, T095.

**Parallel dispatch**: runs together with M5. See the dispatch under Phase 6.

---

## Phase 6: User Story 7 in full, publish to the shared map (Priority: P2) · M5

**Goal**: the maker can write directly, or let their own agent write with a limited key; labels get their own layer; data stored once is reused from anywhere.

**Done when (M5)**: a direct write and an agent-key write show the maker as author, and a snapshot written on one machine is reused on another.

**Independent test**: make a flower, sign in with a NEAR testnet account, publish it; it appears in the gallery from the shared map with the maker as author, and a second request for the same network and date reuses the stored data.

- [ ] T098 [P] [US7] [W3] Maker writes directly, in `packages/near/src/map/direct.ts`: build the maker's own `__fastdata_kv` call (writer = maker); the reader marks verified rows "written by the maker". Deps: T039.
- [ ] T099 [P] [US7] [W3] Agent key (FR-029) in `packages/near/src/auth/agent-key.ts`: `connect({ addFunctionCallKey: { contractId: "petals.testnet", publicKey, allowMethods: { anyMethod: false, methodNames: ["__fastdata_kv"] }, gasAllowance } })`; before accepting a write, `view_access_key` must show a function-call key for `petals.testnet` and `__fastdata_kv` only. `packages/near/scripts/agent-key.ts` makes the key pair; the private half stays with the maker's agent. Deps: T041.
- [ ] T100 [P] [US7] [W3] Trust in `packages/near/src/map/trust.ts`: vouch entries `petal/v1/vouch/<account>` from the receiver, plus maker-written rows once verified; rows that fail checks are hidden and logged. Writing a vouch needs Elco to sign from `petals.testnet` ([Elco OK]); until then trust comes from `PETAL_TRUSTED_WRITERS`. Deps: T038.
- [ ] T101 [P] [US7] [W3] Labels layer in `packages/near/src/map/labels.ts`: `petal/v1/label/<caip2>/<address>` with `{ tag, value, status, evidence[], written_at }`; "inferred is never shown as proven"; an accepted correction (T081) makes a new label version that says so. Deps: T038.
- [ ] T102 [US7] [W4] `get_labels` tool in `packages/tools/src/tools/labels.ts`; a spec pins its label set by `labels.sha256`. Contract test. Deps: T101.
- [ ] T103 [P] [US7] [W2] Reuse across machines (acceptance 7.3) in `packages/inputs/src/get-snapshot.ts`: a snapshot found on the map index is fetched from its `urls[]`, hash-checked, stored and returned with `reused: true, where: "map"`. Test with two stores on one `fakeMap()`. Deps: T037.
- [ ] T104 [P] [US7] [W2] Lasting store on a host (plan C3) in `packages/inputs/src/store/`, for new snapshot bodies and for runs: propose FastFS on NEAR first and document a non-NEAR fallback; build the one Elco picks at T136. Deps: T033.
- [ ] T105 [P] [US7] [W6] Publish choices in `apps/web/app/publish/[draft]/page.tsx`: "publish as me" (direct, with the failed-receipt explanation first) and "let my agent publish" (approve a limited key). Deps: T066, T098, T099.
- [ ] T106 [P] [US7] [W7] Skill: the agent-key flow (make a key, hand the human the approval link, then write as the maker), in `skill/petal/SKILL.md`. Deps: T099.
- [ ] T107 [US7] [W8] [Elco] [Elco OK] Live maker test `tests/e2e/publish-maker.test.ts` (`PETAL_LIVE=1`): a direct write and an agent-key write appear in the gallery with the maker as author; the agent key can't move funds. Elco approves both in his testnet wallet. Deps: T100, T102, T103, T105, T106, T043.

**Parallel dispatch (M4 and M5 together)**: one agent per workstream, carrying both stories. W1: T091–T092. W3: T098–T101. W2: T103–T104. W4: T093, T102. W5: T094. W6: T095, T105. W7: T096, T106. Lead: T097, T107. Merge order: W1 → W3 → W2 → W4 → W5 → W6 → W7 → W8.

---

## Phase 7: User Story 3, the hero set (Priority: P3) · M6

**Goal**: about five flowers from at least four kinds of systems open first, each in full, comparable at the same scale. Then the beauty pass.

**Done when (M6)**: about five hero flowers from at least four kinds of systems open fully and compare at the same scale; Elco's UI notes are applied.

**Independent test**: open Petal with no input; about five flowers from clearly different systems are shown, each opens with full detail, and any two can be compared at the same scale.

- [ ] T108 [US3] [Elco] Confirm the hero set (R17): NEAR validators by backers; Bitcoin pools, last month vs a year ago; Ethereum staking with Lido split into operators; Ethereum miners before the Merge; one Sputnik DAO (`houseofstake.sputnik-dao.near` or `marmaj.sputnik-dao.near`). Can be done now. Blocks T115. Stand-in: R17 as proposed. Deps: none.
- [ ] T109 [P] [US3] [W2] `bitcoin-mining-pools` stored module and two dated fixtures from `../research/data/bitcoin/producers.json` and `producers-2024.json`, in `packages/inputs/src/modules/bitcoin-mining-pools.ts`, through `scripts/import-spike-data.ts`. Deps: T017.
- [ ] T110 [P] [US3] [W2] `ethereum-staking` stored module (Lido split into operators, segment kind `ops`) from `../research/data/ethereum/producers.json`, in `packages/inputs/src/modules/ethereum-staking.ts`. Deps: T017.
- [ ] T111 [P] [US3] [W2] `ethereum-miners-premerge` stored module (Sept 2022) from `../research/data/ethereum/producers-premerge-2022.json`, in `packages/inputs/src/modules/ethereum-miners-premerge.ts`. Deps: T017.
- [ ] T112 [P] [US3] [W2] Fixture of the chosen Sputnik DAO from `../research/data/near-dao/<dao>.json` in `fixtures/snapshots/`, so judges see it offline. All fixtures together stay ≤ 25 MB. Deps: T077.
- [ ] T113 [P] [US3] [W1] Segments `time` (held then vs since) and `ops` (operators within an entity) in `packages/core/src/segments/time.ts` and `ops.ts`; flip them to available in `PRIMITIVES`; goldens for Bitcoin and Ethereum staking. Deps: T030.
- [ ] T114 [P] [US3] [W1] Same-scale option (acceptance 3.2) in `packages/core/src/render/index.ts`: a shared height reference and size for two flowers. Golden. Deps: T030.
- [ ] T115 [US3] [W5] Hero entries: make each hero flower with Petal's agent (figures from tools only), review each interpretation (a source for every mapping, unknowns listed), save as `fixtures/map/<id>.json` with `provenance.maker: null`. Deps: T108–T113, T061.
- [ ] T116 [P] [US3] [W6] Hero set first on `/` (SC-007): each opens like a fresh flower (acceptance 3.1); compare page `/compare?a=&b=` with both legends in `apps/web/app/compare/page.tsx`. Deps: T114, T115.
- [ ] T117 [US3] [W6] [Elco] Beauty pass (constitution VI) across `apps/web/`: apply Elco's notes in `../design/ui-notes.md` (type, colour, composition, dark mode, how to show the tail). Elco reviews. Deps: T116.
- [ ] T118 [P] [US3] [Elco] Optional read test (SC-002): show two hero flowers, one shared and one concentrated, unexplained, to at least 10 people with no crypto knowledge; write the result in `../research/sc-002-read-test.md`. Deps: T117.

**Parallel dispatch**: W2 (T109–T112) and W1 (T113–T114) at once; then W5 (T115); then W6 (T116–T117). Merge order: W2 → W1 → W5 → W6.

---

## Phase 8: User Story 4, accounts that act as one (Priority: P4) · M7

**Goal**: commonly controlled accounts fuse into one shape, only with evidence.

**Done when (M7)**: a known cluster fuses with its evidence listed; look-alikes without evidence don't.

**Independent test**: run Petal on a network with a known cluster; the cluster appears fused, with its evidence listed.

- [ ] T119 [P] [US4] [W1] Fusion rule in `packages/core/src/figures/fusions.ts`: groups only from evidence (shared `owned_by` on NEAR pools; shared signer seats in Sputnik roles); evidence `{ type, detail, source, status }`; a combined power figure `fig:fusion.<id>`. Test "No evidence, no fusion" on look-alike accounts. Deps: T025.
- [ ] T120 [P] [US4] [W1] `markings: fusion` in `packages/core/src/render/markings.ts`: dots 7 px inside the polygon, joined by a dashed line; a legend line; flip `markings` to available in `PRIMITIVES`. Golden `fixtures/golden/near-validators-fusions.svg`. Deps: T030, T119.
- [ ] T121 [P] [US4] [W4] `describe_snapshot.has_fusions`, `compute_figures.fusions` and `propose_spec` `markings: "fusion"`, in `packages/tools/src/tools/`. Deps: T119.
- [ ] T122 [P] [US4] [W6] Fusion details in `apps/web/components/FusionDetails.tsx`: each piece of evidence with its source and a proven or inferred label (acceptance 4.2). Deps: T120.
- [ ] T123 [US4] [W8] Fusion test `tests/e2e/fusions.test.ts`: NEAR pools with one owner fuse, with evidence; look-alikes without evidence do not. Deps: T119–T122.

**Parallel dispatch**: runs together with M8 and M9. See Phase 10.

---

## Phase 9: User Story 5, power in motion: two dates (Priority: P5) · M8

**Goal**: one network on two dates, side by side, with what changed and a pivotal moment marked. Timeline and animation only if time allows (FR-019).

**Done when (M8)**: two dates of one network show side by side at the same scale, with what changed (from `compare_figures`) and at least one pivotal moment.

**Independent test**: pick a network with history; its flowers on two dates appear side by side, and at least one pivotal moment is marked with what changed.

- [ ] T124 [P] [US5] [W2] Second dated NEAR validators fixture from `../research/data/near/producers-2025.json` (block 172,000,000; partial coverage declared) in `fixtures/snapshots/`. Deps: T017.
- [ ] T125 [P] [US5] [W1] `compareFigures(a, b, opts)` in `packages/core/src/figures/compare.ts`, as `FigureChanges` in tools.md: change in total, Nakamoto, HHI and top-k; who joined, who left, who moved most; ids `fig:delta.*`. Deps: T025.
- [ ] T126 [P] [US5] [W2] Pivotal moments in `packages/inputs/src/modules/pivotal.ts`: from snapshot `events[]` plus a short sourced list per network (for example the Merge, 15 Sep 2022). Deps: T035.
- [ ] T127 [P] [US5] [W4] `compare_figures` tool and `POST /api/v1/figures/compare` in `packages/tools/src/tools/compare.ts`: both snapshots the same network and population, `a` earlier than `b`; adds the pivotal moments between the dates. Contract test. Deps: T125, T126.
- [ ] T128 [US5] [W6] Two dates side by side at the same scale, with what changed and at least one pivotal moment marked (acceptance 5.1), in `apps/web/app/compare/page.tsx`. Deps: T116, T127.
- [ ] T129 [P] [US5] [W5] The agent answers "compare with <date>" quoting only `compare_figures`; recorded test in `packages/agent/test/compare.test.ts`. Deps: T127.
- [ ] T130 [P] [US5] [W2] Optional: offline NEAR delegator crawl `packages/inputs/scripts/crawl-near-delegators.ts` (963 calls, ~24 min keyless) to refresh the validators snapshot. Deps: T034.
- [ ] T131 [US5] [W6] Stretch: timeline scrubbing and animation export in `apps/web/app/compare/`. Deps: T128.

---

## Phase 10: User Story 6, share a flower (Priority: P6) · M9

**Goal**: share by link; export an image with legend and name.

**Done when (M9)**: a shared link opens the identical flower in a fresh browser; the exported image has the legend and the name.

**Independent test**: share a flower's link and open it in a fresh browser; the identical flower appears.

- [ ] T132 [P] [US6] [W1] Export SVG with legend and network name in `packages/core/src/render/export.ts`; golden `fixtures/golden/near-validators-export.svg`. Deps: T030.
- [ ] T133 [P] [US6] [W6] Share menu in `apps/web/components/ShareMenu.tsx`: copy link (`/f/[id]` or `/draft?spec=`), download SVG and PNG; link preview image in `apps/web/app/f/[id]/opengraph-image.tsx`. Deps: T132.
- [ ] T134 [US6] [W8] Playwright test `tests/e2e/share.spec.ts`: a shared link in a fresh browser gives the same `render_sha256`; the exported image has the legend and the name. Deps: T133.

**Parallel dispatch (M7, M8 and M9 together)**: W1 (T119, T120, T125, T132), W2 (T124, T126, T130), W4 (T121, T127), W5 (T129), W6 (T122, T128, T133, then T131 if there is time), lead (T123, T134). Merge order: W1 → W2 → W4 → W5 → W6 → W8. If the freeze comes first, cut from the end: T131, then T130, then M9's PNG and preview image, then M8, then M7.

---

## Phase 11: Ship: README, demo, submission · M-Ship

**Purpose**: a judge can reproduce a flower with no account (SC-009); the build is frozen, documented and submitted with Elco's OK.

**Done when (M-Ship)**: frozen on **12 Nov**; the judge path passes from a clean clone; submitted on **13 Nov** with Elco's OK.

- [ ] T135 [P] [W7] IronClaw package in `skill/ironclaw/`: an extension manifest that wraps `/mcp` over HTTP, in the format IronClaw documents at the time, plus the skill; try it in a local IronClaw. About half a day; stop if it costs more. A hedge (no commits on IronClaw's main since 2026-09-10), never on the demo's critical path. Deps: T051, T069.
- [ ] T136 [Elco] Hosting: Elco picks the host (Vercel proposed) and the lasting store for snapshots and runs (T104), and puts the NEAR AI key and the writer key in the host's secret settings, never in the repo. Blocks T137. Stand-in: the local judge path (T138). Deps: none.
- [ ] T137 [W8] [Elco OK] Deploy a hosted preview (`apps/web/vercel.json`, function max duration 300 s). Deps: T136, T090.
- [ ] T138 [W8] Judge path from a clean clone with no keys (SC-009) in `tests/e2e/judge-path.spec.ts`: `pnpm install && pnpm dev`; hero flowers open fully; `/make` replays the recorded run; `pnpm petal figures near-validators` prints the figures the flower quotes. Deps: T061, T070, T116.
- [ ] T139 [W8] **Freeze on 12 Nov**: bug fixes only from here; tag `v0.1.0-freeze` locally (no push). Deps: T090, T097, T107, T117, T123, T128, T134, T138 (or the cut list).
- [ ] T140 [P] [W8] Hardening: rate limits and budget caps checked; `scripts/check-secrets.sh`, `scripts/check-boundary.sh` and `git grep` for key prefixes find nothing; fixtures ≤ 25 MB; goldens pass twice on a clean checkout. Deps: T139.
- [ ] T141 [P] [W7] Judges' README `README.md`: what Petal is and the problem it solves; "do X, see Y" steps (judge path, the five skeleton steps, the CLI, the hosted URL if any); the five doors; for each track entered (`thesis`, `social`, `security`, `open`; `agents` only if paid agent use works) the NEAR mechanism it uses, explained, not claimed; non-NEAR alternatives kept for later; roadmap (wallet messaging and governor coordination, not built); pre-hackathon baseline disclosure (concept, constitution, spec and plan written before the code; the Python spikes stay outside the repo and are not product code; application code written after the task list was approved, as git history shows); how the tests prove determinism; MIT licence. No marketing; easy for machines to read. Deps: T138.
- [ ] T142 [P] [W7] `docs/petal-spec.md`: the Petal spec format, the primitives with their status in this build (FR-032), and `default/v1`, for human and AI judges. Deps: T139.
- [ ] T143 [P] [W7] Investment Thesis entry built from Petal's own output (NEAR validators, House of Stake, top DAOs; every figure from tools, with the `petal` CLI commands that re-run it) in `docs/thesis.md`. Deps: T139.
- [ ] T144 [P] [W8] Demo script `../submission/demo-script.md` (outside the repo): the skeleton flow, a DAO nobody prepared, one variation, a hero comparison; recorded from the frozen build. Deps: T139.
- [ ] T145 [Elco] Elco records the narrated demo video from the frozen build. Blocks T151. Deps: T144.
- [ ] T146 [P] [W8] Drafts in `../submission/` (never committed): `x-post.md` (says it was built at NEAR HACKATHON; video or screenshots) and `description.md` (20–2000 characters). Deps: T139.
- [X] T147 [Elco] Mainnet project account: Elco created `petals.near` on 4 Nov (one full-access key, no contract, 0 balance; needs ~0.5 NEAR before any mainnet write) for the payout and any later mainnet map. Can be done now. Blocks T152 and T155. Stand-in until then: the quote's `petal-demo.near`. Deps: none.
- [ ] T148 [Elco] Submission facts from Elco, never guessed: project name, lead name, email, team size, tracks, which X account posts. The payload lives in `../submission/payload.json`, never in the repo. Can be done now. Blocks T152. Deps: none.
- [ ] T149 [W8] [Elco OK] Create the remote repo (private), set `PETAL_REPO_URL` (for the correction fallback link), run `scripts/check-boundary.sh`, push. Deps: T140, T141.
- [ ] T150 [W8] [Elco OK] Make the repo public, before sending the submission. First the arrival tidy-up:
  - scrub the names of the private explorations (atlas, economy) and the "unpublished GIP-150 article" wording from `specs/`, `.specify/` and the README;
  - keep the spec's Future Ideas money sketch (Elco, 4 Nov);
  - remove the link to the private tracker from BOARD.md;
  - run `scripts/check-boundary.sh` over the whole git history (`git log -p`), because everything ever committed becomes public.
  
  Deps: T149.
- [ ] T151 [Elco OK] Post on X with the demo video, from the account Elco names. Deps: T145, T146, T150.
- [ ] T152 [Elco OK] **Send the submission on 13 Nov**: show Elco the full payload first, because it can't be edited; leave `website` empty. Deps: T147, T148, T150, T151.
- [ ] T153 [P] [W2] Stretch: The DAO hack (2016 Ethereum) pull and fixture. Deps: T017.
- [ ] T154 [P] [W3] Stretch: FastFS for snapshot bodies, if T104 did not pick it. Deps: T104.
- [ ] T155 [W3] [Elco OK] Stretch: one real 1Click quote and a ~$1 mainnet payment (mainnet spend, FR-031). Deps: T147.

**Parallel dispatch**: W7 (T135, T141–T143) and the lead (T137–T140, T144, T146) in parallel; stretch tasks only if time is left. Every outward step waits for Elco, in this order: T149 → T150 → T151 → T152.

---

## Dependencies and execution order

### Milestones

- **M0** (Phases 1–2) starts once Elco approves (T001). It blocks everything after it.
- **M1** (Phase 3, waves 1 and 2) needs T023. **M2** (Phase 3, wave 3) needs M1.
- **M3** needs M2. Then **M4 and M5** together, then **M6**, then **M7, M8 and M9** together.
- **M-Ship** needs M3–M9 or the cut list. Freeze 12 Nov, submit 13 Nov: these dates win over any milestone.

### Stories

- US1 (P1) is the core path; every other story builds on its tools.
- US2 (P2) needs US1's `propose_spec` and chat. US7 (P2) needs US1's flower and the skeleton's publish.
- US3 (P3) needs US1 and the hero modules. US5 uses US3's compare view (T116).
- US4 (P4) and US6 (P6) need only US1.

### Rules inside each milestone

- Write the test with the code, and see it fail first where you can.
- Contracts change only through the lead, with a version bump.
- Every working session ends with `scripts/check.sh` and `pnpm test:e2e` green; once the keys exist, also the live run (constitution: a working build of the core path every day).

---

## Implementation strategy

1. **Skeleton first (M0–M2)**: every part on NEAR, thin, on prepared data. Stop at T075 and show Elco.
2. **Make the core path flawless (M3)** on a network nobody prepared. This closes plan exceptions C1 and C2.
3. **Deepen in spec priority (M4–M9)**. Each milestone ends with its own end-to-end test.
4. **Freeze and ship (M-Ship)**. Never cut US1, the publish path, the hero set or the README. If behind at the freeze, cut from the end: stretch, then T131, T130, M9 extras, M8, M7.

---

## Contract changes made on 4 Nov (analyze pass; for T001 and T012)

The coordinator cleared these, and they are already applied in `contracts/`, `data-model.md`, `research.md`, `quickstart.md` and `plan.md`. Elco can still amend them at T001; T012 applies any change he asks for.

- **F1** The chat route lives in `@petal/agent` (`agentRoutes`), joined with the tool routes by `petalApp`; `httpApp` serves tool routes only. Reason: the agent imports the tools, so the chat in `httpApp` was a package cycle.
- **F2** `encodings.order` (`by`, `meaning`, `sources`) in the spec schema; `selection.order` is gone. Default: `measure_desc`, "largest first, clockwise from the top". Reason: order is a primitive with a legend line, so it needs a declared meaning and source (constitution I, FR-011).
- **F3** `GET /api/v1/attestations/:sha256` serves the attestation report behind `report_url`.
- **F4** Runs are stored and resumable: the `run` event, `GET /api/v1/agent/runs/:id`, chat with `run_id` (R19).
- **F5** `compare_figures` and `POST /api/v1/figures/compare` count what changed between two dates (US5, FR-025).
- **F6** `petals` is 5–300 everywhere, as a cap: a network with fewer included participants gets one petal each and no tail.
- **F7** One MCP install command: `claude mcp add petal -- pnpm -s --dir <repo> petal mcp`, `<repo>` being the clone's root. `-s` keeps pnpm's script banner off stdout, which would otherwise corrupt MCP over stdio (found in M0; coordinator, 4 Nov). The CLI needs Node 24 on the PATH that the MCP client spawns.
- **Also**: correction requests (FR-022) as signed map entries under `petal/v1/correction/<flower-id>/<id>` with a GitHub-issue fallback (shared-map.md, R20); five thin doors over one tools core (packages.md, R11); `PRIMITIVES` with each primitive's status in this build (FR-032); milestones instead of days (plan, Roadmap).

## Notes

- [P] means different files and no open dependency.
- `fixtures/` has one owner per folder once M0 is done: `snapshots/` W2, `golden/` W1, `transcripts/` and `map/` W5. `scripts/` stays with W0 (import and checks); package scripts live in their package.
- Agents never read raw snapshot bodies; they use `describe_snapshot` and `compute_figures`.
- Nothing public, signed or spent without Elco. T043 gives one OK for testnet signing with the writer key; every other [Elco OK] is asked at the time.
- No UI polish before the beauty pass in M6. UI comments wait in `../design/ui-notes.md`.

# Implementation Plan: Petal core

**Branch**: `001-petal-core` (no git repo yet; the setup script resolved the feature from `.specify/feature.json`) | **Date**: 2026-11-04 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/001-petal-core/spec.md`, updated 2026-11-04 (Session 2026-11-04, FR-024–FR-030, User Story 7).

## Summary

Petal draws power in a network as a flower, and people talk a flower into existence. **Phase A (milestones M0–M2)** stands up every part thin, on NEAR, and proves one flow end to end: gallery → chat with Petal's agent on NEAR AI Cloud → tools count and validate → deterministic SVG → NEP-413 publish to the shared map on FastData (testnet) → the same spec through Claude Code with the Petal skill → a dry NEAR Intents quote. **Phase B (M3–M9)** deepens each part in spec priority order. Work moves by milestones, not days: each one ends when its "done when" line is true, as fast as that happens. The only dates are the freeze (12 Nov) and the submission (13 Nov).

Every choice below is proposed; the reasons and alternatives are in [research.md](./research.md). They are reviewed at the task gate.

## Technical Context

**Language/Version**: TypeScript on Node 24 LTS, pinned with `.nvmrc` (Node 24.14.0 is installed through nvm, but the first `node` on the PATH is 22.22.3)

**Primary Dependencies**: Ajv and `json-schema-to-typescript`, RFC 8785 canonical JSON, Hono 4 with `@hono/vercel`, `@modelcontextprotocol/server` v2, the `openai` SDK pointed at NEAR AI Cloud, `near-api-js` 7, `@hot-labs/near-connect` 0.12, Next.js, vitest

**Storage**: content-addressed snapshot files (fixtures in the repo, a local cache); the shared map on FastData KV (testnet); a local mirror of every map write; a run store for chats (`.petal/runs/`). No database.

**Testing**: vitest: unit, golden SVG (bytes), contract (HTTP, MCP and CLI agree), schema, one end-to-end skeleton test (recorded and live); Playwright for the judge path in Phase B

**Target Platform**: Node 24 server (local first, then Vercel), current browsers, Agent Skills hosts (Claude Code, Codex), MCP clients, a terminal (CLI), IronClaw through its package

**Project Type**: one tools core with five thin doors (HTTP API, Agent Skill, MCP server, CLI, IronClaw package; [packages.md](./contracts/packages.md#the-five-doors)) and a web app, in one pnpm workspace. Licence: MIT.

**Performance Goals**: 300 petals render in ≤ 50 ms; a stored snapshot is reused in ≤ 300 ms; the skeleton chat takes ≤ 60 s typical (120 s cap) with progress at least every 10 s

**Constraints**: no account, key or payment to view or make (FR-030); one server inference key, capped at $0.05 per chat and $3 per day; keyless RPC limits; FastData values ≤ 256 KiB; testnet writes only; no secrets in the repo

**Scale/Scope**: up to 300 petals plus a grouped tail, legible at 1,000+ participants (SC-006); hundreds of visitors while judging; fixtures ≤ 25 MB; about six networks by the freeze

Nothing is left as NEEDS CLARIFICATION. What remains open is listed below as open decisions.

## Constitution Check

*Gate before Phase 0, re-checked after Phase 1. Constitution v1.2.1.*

| Principle | How the plan meets it | Result |
|---|---|---|
| I. Grammar | Renderer ports the polygon geometry (straight bars, stacked segments, width band ≤ 3×). The validator rejects any primitive without a meaning and a source, `order` included. Primitives not built are declared unavailable, never imitated (FR-032). One default convention. | Pass |
| II. Argued | Schema requires a source per mapping and a non-empty `unknowns`. Variations are labelled. | Pass |
| III. Spec-driven | The agent calls `propose_spec`; a pure renderer draws; golden tests check bytes. | Pass |
| IV. Everything is a DAO | One common table; no chain code in renderer or agent; NEAR first; snapshots named by SHA-256 and reused once final; labels a separate layer. | Pass, risk C3 |
| V. Evidence | Proven/inferred status on every identity, dashed outline for inferred; fusions only from evidence rules (B). | Pass |
| VI. Beauty | Beauty pass in milestone M6. UI comments wait until then. | Pass |
| VII. One path | Phase A builds thin gallery, publish and quote alongside the core path, on prepared data. | **Exception C1, C2** |
| Hackathon | Code written after planning; MIT licence in place before `git init`; a publication boundary keeps exploration and anything not approved out of the public repo; fixtures for judges; testnet only; nothing public, signed or spent without explicit approval. | Pass, pending review |

Re-check after data model, contracts and quickstart: same result. Re-checked after the analyze pass (contract changes F1–F7, corrections, doors, milestones): same result.

## Project Structure

```text
specs/001-petal-core/   plan.md research.md data-model.md quickstart.md
                        contracts/ (2 JSON Schemas; tools, http-api, shared-map, renderer, packages)

build/
├── packages/core/      schemas, types, canonical hash, validator, counting, conventions, SVG renderer
├── packages/inputs/    input modules, keyless RPC pool, content-addressed snapshot store
├── packages/near/      map/ (FastData, mirror), auth/ (NEP-413), pay/ (1Click)
├── packages/tools/     one tool registry; HTTP tool routes (Hono) and MCP (stdio, /mcp)
├── packages/agent/     loop on NEAR AI Cloud, prompt, signatures, recorded client, run store;
│                       agent routes (chat, runs, attestations) and petalApp
├── apps/web/           gallery, flower view, /make chat, publish, quote panel
├── apps/cli/           the `petal` CLI: thin, in-process tools, JSON out
├── skill/petal/        SKILL.md (Agent Skills format) for Claude Code, Codex, IronClaw
├── skill/ironclaw/     IronClaw extension manifest over /mcp, plus the skill (hedge)
├── docs/               the Petal spec format, the thesis entry
├── fixtures/           snapshots/, map/ (hero entries), golden/, transcripts/
├── scripts/            spike-data import and checks (boundary, secrets, size); package scripts live in their package
├── tests/e2e/          the skeleton test and later end-to-end tests
└── .petal/             local state, never committed: cache, mirror, drafts, runs, attestations
```

Libraries in `packages/`, the site and the CLI in `apps/`. One owner per directory. Only what is approved for publication enters the repo: a publication boundary check (`.publication-boundary`, `scripts/check-boundary.sh`) keeps exploration notes (atlas, economy) and anything not approved out.

## Roadmap

Ordered milestones. Each ends when its "done when" line is true; if a milestone takes one night, so be it. Phase A is M0–M2; Phase B is M3–M9.

| Milestone | Work | Done when |
|---|---|---|
| **M0 Foundation** | W0: workspace, Node 24, MIT licence, publication boundary, schemas as types, hashes, fixture import, stubs and fakes | `scripts/check.sh` passes; contracts frozen at `packages/v1` |
| **M1 Parts in parallel** | W1–W7 on fakes: core (figures, `buildSpec`, renderer, goldens), inputs (store, validators fixture, House of Stake live), NEAR adapters (FastData, mirror, NEP-413, dry 1Click), tools and doors (HTTP, MCP, CLI), agent (NEAR AI Cloud, signatures, runs, bake-off), web, skill | each part passes its own tests; the CLI renders the validators fixture; `/make` answers the skeleton question and draws |
| **M2 Skeleton proven** | W8: integration on testnet and NEAR AI Cloud | the [quickstart](./quickstart.md) passes live once and `pnpm test:e2e` passes |
| **M3 Core path (US1)** | any Sputnik DAO by account, live; "can't read yet"; docs and forum citations; full petal details and inner lines; runs you can come back to; correction requests | a DAO nobody prepared renders live with a cited interpretation |
| **M4 Talk to change (US2)** | variations, the figure check | one plain request redraws a labelled variation; the default is unchanged |
| **M5 Publish in full (US7)** | maker writes directly; agent keys (FR-029); labels; reuse across machines | a direct write and an agent-key write show the maker as author |
| **M6 Hero set (US3)** | hero modules and entries (R17); compare at the same scale; **beauty pass** | about five hero flowers from four kinds of systems open fully; the UI notes applied |
| **M7 Fusions (US4)** | evidence rules, fusion markings | a known cluster fuses with its evidence; look-alikes don't |
| **M8 Two dates (US5)** | `compare_figures`, pivotal moments | two dates side by side, with what changed and a pivotal moment |
| **M9 Share (US6)** | links, SVG and PNG export | a shared link opens the identical flower |
| **M-Ship** | IronClaw package; hosted preview (with OK); judge path; README; demo; submission | **freeze 12 Nov**; judge path passes from a clean clone; **submitted 13 Nov** |

Order: M0 → M1 → M2 → M3 → (M4 and M5 together) → M6 → (M7, M8, M9 together) → M-Ship. The freeze date wins: whatever is not done by 12 Nov is cut from the end (stretch, then M9 extras, M8, M7). Never cut M3, M5's publish path, M6 or the README. The repo goes public before the submission.

Stretch: The DAO hack data, FastFS for snapshot bodies, a real ~$1 payment (with OK).

## Workstreams (parallel build)

Each workstream owns one directory and builds against [contracts/packages.md](./contracts/packages.md), using its fakes until dependencies land. Contracts freeze at the end of W0; changes go through the lead.

| ID | Workstream | Owns | Needs first |
|---|---|---|---|
| W0 | Foundation (lead) | root config, MIT licence, publication boundary, schemas as code, types, canonical hash, fixture import, fakes | approved tasks |
| W1 | Core | `packages/core` | W0 |
| W2 | Inputs | `packages/inputs` (crawl script included), `fixtures/snapshots/` | W0 |
| W3 | NEAR adapters | `packages/near` | W0; testnet accounts for live |
| W4 | Tools, HTTP tool routes, MCP | `packages/tools` | W0; wires W1–W3 as they land |
| W5 | Agent and agent routes (chat, runs, attestations), `petalApp` | `packages/agent` | W4 types; NEAR AI key for live |
| W6 | Web | `apps/web` | HTTP contract (fixture mock until W4 and W5) |
| W7 | Doors and docs: skill, CLI, IronClaw package, README, docs | `skill/`, `apps/cli`, `README.md`, `docs/` | HTTP contract, tool registry |
| W8 | Integration (lead) | `tests/e2e`, golden review | all |

**Order**: W0 → W1, W2, W3 in parallel → W4 → W5, W6, W7 in parallel → W8. W4–W7 start on fakes, so nobody waits. Critical path: W0 → W1 (renderer, `buildSpec`) → W4 → W5 → W8.

## NEAR showcase

| NEAR piece | On the journey | Phase |
|---|---|---|
| Governance data: validators, delegators, House of Stake, Sputnik DAOs | the flowers | A (validators, HoS), B (DAOs) |
| NEAR AI Cloud, TEE models, signed answers | Petal's agent; a signature kept with each spec | A |
| FastData KV | the shared map: specs, snapshot fingerprints, index; labels and correction requests later | A, B |
| NEP-413 | sign-in and authorship of each published flower | A |
| Function-call keys | Petal's writer (A); agent keys on the maker's account (B) | A, B |
| NEAR Intents 1Click | "sponsor a refresh" quote | A (dry) |
| Agent Skills format (as `near/agent-skills`) | the Petal skill, the main bring-your-own-agent door | A |
| IronClaw | the skill, plus a small extension package over `/mcp` (a hedge: no commits on main since 2026-09-10) | A (skill), B (package, tried) |

## Open decisions (not blocking the plan)

1. **Licence**: decided, MIT (2026-11-04). **Publication boundary**: the allowlist of what enters the repo is approved at the task gate; additions to it are reviewed.
2. **NEAR AI Cloud key.** The key file (`near-ai.env`, outside the repo) exists, but `NEAR_AI_API_KEY` is empty (length checked only). Needed before M1 ends (the bake-off).
3. **Testnet accounts**: `petals.testnet` (receiver, no contract) and `petals-writer.testnet`, with a function-call key limited to `petals.testnet` and `__fastdata_kv` saved outside the repo; and a one-time OK for the build to sign testnet transactions with it. Needed before M2.
4. **Mainnet project account** (`petals.near` is free): payout and any later mainnet map.
5. **Hosting and any deploy** (Vercel proposed), and the lasting store for snapshot bodies and runs (C3); a hosted URL before the freeze.
6. **Any mainnet spend** (one ~$1 Intents payment). Stretch.
7. **Confirm**: hero set (R17), relayed publish (R9), the VII exception (C1).

## Open questions

- Is GLM-flash good enough? The bake-off in M1 decides; fallbacks are named (R10).
- Where do new live snapshot bodies and stored runs live on a host with no lasting disk? Chosen with hosting (C3).
- Should DAO treasuries count tokens and Intents balances? Not needed for Phase A.

## Complexity Tracking

| # | Exception | Why needed | Simpler alternative rejected because |
|---|---|---|---|
| C1 | VII: the core path must work before other features. Phase A also builds thin gallery, publish and quote. | The 2026-11-04 decision (spec clarifications): every part on NEAR, thin, then deepen. The NEAR integrations are the riskiest part and the showcase. | Core path first would leave map, accounts and Intents untested until the end. Justified by the decision of 2026-11-04: stand up every part on NEAR and prove the basic flow, then deepen each function. Kept as a recorded exception rather than an amendment; the core path is made flawless at the start of Phase B. |
| C2 | VII's path starts with a network nobody prepared; the skeleton question uses a prepared fixture. | The NEAR delegator crawl takes ~24 min keyless. Phase A still proves a live pull (House of Stake). | It is the first item of M3. |
| C3 | IV: gathered data is kept. A serverless host has no lasting disk. | Hosting is optional and late. | Fingerprints survive on the map and local runs keep everything; a lasting store is chosen in Phase B. |
| C4 | US7: written "under the maker's name". In Phase A, FastData records Petal's writer; the maker's NEP-413 signature rides inside the entry. | No funded account, gas or "failed" wallet screen for a first-time maker. | Direct maker writes come in Phase B. |

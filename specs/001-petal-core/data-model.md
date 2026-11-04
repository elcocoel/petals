# Data model: Petal core

**Feature**: `001-petal-core` | **Date**: 2026-11-04 | **Plan**: [plan.md](./plan.md)

The machine-readable versions are in [contracts/](./contracts/). This file explains the entities, how they relate, the rules the validator enforces, and how each one changes state. Field names here match the schemas.

## Layers

Petal keeps three layers apart (constitution IV, V):

1. **Facts**: data snapshots in the common table. Permanent once final. Named by their SHA-256.
2. **Labels**: identity links and tags written by someone, with evidence. Versioned and attributed. Kept in the shared map, never inside a fact snapshot.
3. **Interpretations**: specs, figures quoted from them, and the agent's written reasoning. Attributed to a maker and a model.

A flower pins all three: the snapshot by hash, the label set by hash (or `none`), and the spec by hash.

## Entities

### Network

What can be read. Comes from an input module's descriptor, not from data.

| Field | Type | Notes |
|---|---|---|
| `id` | string | Petal's id, e.g. `near-validators`, `near-house-of-stake`, `near-sputnik-dao` |
| `chain` | string | CAIP-2 id: `near:mainnet`, `bip122:000000000019d6689c085ae165831e93`, `eip155:1`; `none` for non-chain networks |
| `population` | string | `validators`, `house-of-stake`, `sputnik-dao:<account>`, `mining-pools`, ... |
| `kind` | enum | `chain`, `protocol`, `dao`, `other` |
| `title`, `description` | string | plain words |
| `params` | object | e.g. `{ "dao": "marmaj.sputnik-dao.near" }` for parameterised modules |
| `capabilities` | object | measures, segment kinds, relationship types, live or stored-only, rough cost (calls, seconds) |
| `sources` | Source[] | where the module reads from |

Rule: a network the modules can't read returns `cannot_read` with the reason and the nearest networks Petal can read (FR-001, acceptance 1.5).

### Snapshot (the common table)

The gathered data for one network population at one moment. Schema: [common-table.schema.json](./contracts/common-table.schema.json). It grows out of the spike format (`research/data/FORMAT.md`) with these changes: one canonical JSON document (no CSV sidecars), a `module` stamp, a `final` flag, declared grouping, and a `group` participant kind.

| Part | Holds |
|---|---|
| `network` | id, chain, population, title |
| `snapshot` | `as_of`, `block_height`, `window` (when reads spanned blocks), `final` |
| `coverage` | full population vs included, amount total vs included, unit, `grouped[]` rules, `partial` and failed sources |
| `sources[]` | `id`, `kind` (chain, api, docs, forum, constitution, dataset), `url`, `method`, `fetched_at` |
| `participants[]` | `id`, `label`, `kind`, `identity` (or null), `roles[]`, `count` (only for `group` rows), `source` |
| `holdings[]` | `participant`, `asset`, `measure`, `amount` (decimal string), `amount_raw`, `unit`, `as_of`, `source` |
| `relationships[]` | `from`, `to`, `type` (`delegates_to`, `owned_by`, `member_of_role`, `voted:*`, ...), `amount`, `unit`, `role`, `bps`, `as_of`, `source` |
| `events[]` | `participant`, `type`, `at`, `detail`, `source` |
| `module` | input module `id` and `version` that produced it |

Rules (validator and input modules enforce them):

- Every row's `source` matches a `sources[].id`. Every row has a date.
- Amounts are decimal strings in the human unit; `amount_raw` in base units when the source gives it.
- `kind` is one of: person, organisation, mining_pool, validator, staking_pool, staking_entity, delegator, exchange, custodian, contract, treasury, group, unknown. `unknown` unless a source says otherwise. Non-individuals are labelled as such (FR-016).
- `identity` is null unless a source names the account. Then `{ name, source, status }` with status `self-declared`, `verified` or `inferred` (FR-013).
- `coverage` always states the full population and how much is included, so a tail can be declared honestly (FR-015).
- Grouping to fit a size budget is allowed only when declared in `coverage.grouped[]` with the rule, the number of rows folded and their amount. Example for the NEAR validators fixture: delegations under 1,000 NEAR are folded into one `group` row per pool and backer class (8,319 delegations stay individual; they carry 98.76% of delegated stake).
- **Fingerprint**: `sha256` of the RFC 8785 canonical JSON bytes of the whole document, uncompressed. Stored as `<sha256>.json.gz`. The hash names the snapshot everywhere.

State:

```
requested ──► fetching ──► assembled ──► stored (cache, named by sha256)
                 │                          │
                 └─► partial / failed       ├─► final (all reads at final blocks)
                     (marked, explained)    └─► fingerprinted on the map ──► reused
```

A final snapshot is never fetched again (FR-028). A request for the same network population at the same block returns the stored one and says `reused: true`. "Latest" requests are resolved to a block first, then looked up.

### Snapshot index entry

How Petal finds "is this network at this moment mapped already?". Local: `cache/index.json`. Shared: `petal/v1/index/<caip2>/<population>/<block_height>` on the map → `{ sha256 }`.

### Figures

Counts computed by tools from a snapshot, never by the agent (FR-025). Schema: `Figures` in [tools.md](./contracts/tools.md).

| Figure | Definition |
|---|---|
| `total`, `unit` | sum of the chosen measure over all participants in coverage |
| `shares[]` | per participant: `id`, `amount`, `share`, `rank` |
| `top_k_share` | share held by the top 1, 5, 10, 100 |
| `nakamoto` | smallest number of participants whose shares sum past a threshold (1/3 by default for BFT chains, 1/2 otherwise; threshold stated) |
| `hhi` | Herfindahl index of shares (0–1) |
| `gini` | Gini coefficient over included participants (stated as "over included participants") |
| `tail` | count, amount and share folded into the "everyone else" petal for a given `petals` |
| `fusions[]` | groups with evidence, from rules such as shared `owned_by` (Phase B) |

Each figure has an id (`fig:nakamoto`, `fig:top_k_share.10`, ...) that the interpretation cites. Shares are rounded to 6 decimals; amounts stay decimal strings.

**Figure changes** (US5, Phase B; `compare_figures` in tools.md). Two snapshots of the same network and population, `a` earlier than `b`: change in total, Nakamoto, HHI and top-k; who joined, who left, who moved most (share and rank, then and now); and the pivotal moments between the two dates (snapshot `events[]` plus a short sourced list per network). Ids `fig:delta.*`. Counted by tools, never by the agent.

### Visual primitive

One drawable property. Registry in `core` (`PRIMITIVES`), with each primitive's status in this build. The hackathon build implements a subset of the vocabulary; a primitive not yet built is declared `unavailable`, never imitated (FR-032). Vocabulary v1:

| Primitive | Status in the build | What it can mean (by) |
|---|---|---|
| `width` | available (A) | share of power, compressed into a band (`max_ratio` 1.5, 2 or 3; default 2), or equal |
| `height` | available (A) | share (`sqrt`, `linear`), amount (`log`), a metric (`m:<name>`), or equal |
| `segments` | available (A: `backers`; B: `time`, `ops`, `roles`) | `backers` (who backs a NEAR pool), `time` (held then vs since), `ops` (operators in an entity), `roles`, or none |
| `colour` | available (A) | `kind` of account, `identity` (named vs anonymous), or `single` |
| `outline` | available (A) | `identity_status`: solid = self-declared or verified, dashed = inferred |
| `order` | available (A: `measure_desc`; others in B) | `measure_desc` (default: "largest first, clockwise from the top"), `measure_asc`, `id`, `join_date`, `last_active` |
| `lines` | unavailable until B | inner lines: `shared_delegators`, `delegation`, `co_vote` |
| `markings` | unavailable until B | dots: `fusion` (common control with evidence) |
| `texture`, `extrusion`, `opacity` | unavailable | declared in the vocabulary, not built; asking for them gets "not available yet" (the tail's hatch marks grouping; it is not the texture primitive) |

Rules: a primitive appears in a spec only with a `meaning` and at least one `sources[]` id, `order` included (FR-009, FR-011, constitution I). A primitive marked `unavailable` never appears in a spec or a drawing (FR-032). When a primitive is built, its status flips in `PRIMITIVES` and `describe_snapshot` reports it.

### Convention

A mapping from behaviours to primitives. `default/v1` is the sketch's defaults: width = share in a 2× band, height = sqrt share, colour = kind, outline = identity status, segments = none unless the population declares a default, order = largest first, clockwise from the top (`measure_desc`), 60 petals plus a tail. A user's change produces a **variation**: same fields, plus `variation_of` (the spec it changed) and `changes[]` (US2).

### Petal spec

The declarative description of a flower. Schema: [petal-spec.schema.json](./contracts/petal-spec.schema.json) (`$defs.spec`).

| Field | Notes |
|---|---|
| `petal` | `"spec/v1"` |
| `network` | `{ id, chain, population, params }` |
| `snapshot` | `{ sha256, as_of, block_height }` |
| `labels` | `{ sha256 }` of the label set used, or `"none"` (Phase A: none) |
| `selection` | `measure`, `petals` (5–300: the most petals before the tail; a network with fewer included participants gets one petal each and no tail), `tail` `{ group, label }` |
| `encodings` | one entry per primitive used: `{ by, scale?, max_ratio?, meaning, sources[] }`; `null` means unused. `order` is always present: `{ by, meaning, sources[] }` |
| `convention` | `{ id, variation_of, changes[] }` |

Rules (validator, FR-026):

1. The JSON matches the schema.
2. The snapshot exists (cache or map) and its hash matches.
3. `measure` exists in the snapshot's holdings; each encoding's `by` is in the network's capabilities.
4. Every primitive used, `order` included, has a `meaning` and at least one source id that exists in the snapshot's `sources` or the interpretation's document sources.
5. `width.max_ratio` ≤ 3 (the polygon keeps its shape).
6. If `petals` < participants included, the tail is grouped and declared.
7. `spec_sha256` = SHA-256 of the canonical spec. Same spec and snapshot → same SVG bytes (FR-010).
8. No encoding uses a primitive that `PRIMITIVES` marks `unavailable` in this build (FR-032).

`propose_spec` takes a small set of choices and fills every default and every standard meaning from the convention and the module descriptor. Two agents that make the same choices get byte-identical specs. This is what makes quickstart step 4 checkable.

### Interpretation

The agent's argued reading of power (constitution II, FR-008). Schema: `$defs.interpretation`.

| Field | Notes |
|---|---|
| `summary` | 2–4 plain sentences |
| `power_means[]` | `{ claim, sources[], figures[] }` |
| `mappings[]` | one per primitive used: `{ primitive, why, sources[] }` |
| `conflicts[]` | competing power sources and which one drives the flower |
| `unknowns[]` | what Petal could not determine or did not check; at least one entry (constitution II) |
| `inferred[]` | statements that are inference, not fact |
| `documents[]` | document sources: `{ id, kind, url, title, fetched_at }` |

Rules: every `mappings[]` entry cites at least one source (SC-003). Every number in `summary` and `power_means` refers to a figure id (checked in Phase B by the figure check).

### Identity link and label

A claim that an address is a person or organisation, or has a tag. Lives in the label layer. Shared-map key `petal/v1/label/<caip2>/<address>`.

`{ tag, value, status (self-declared | verified | inferred), evidence[] { kind, url, source, note }, writer, written_at }`

Rules: inferred is never shown as proven; every link shows its source; a visible "request a correction or removal" link exists (FR-022, Phase B).

### Correction request

A request to correct or remove an identity link or label (FR-022). Two channels: a **signed entry on the shared map** under `petal/v1/correction/<flower-id>/<id>` for people with a NEAR account, and a **GitHub issue** link as the fallback for people without one. Entry: `{ petal: "correction/v1", id, flower_id, target { participant, caip2, address, label_key? }, request (correct | remove), reason, evidence[] { kind, url, note }, requester, proof (NEP-413), written_at }`; `id` is the first 24 hex characters of the SHA-256 of the canonical request without `id` and `proof`. Contract: [shared-map.md](./contracts/shared-map.md#correction-requests-fr-022).

State: `open ──► accepted (a new label version says so) | declined (with a reason)`. The map is append-only: a removed label is hidden by Petal's readers, while the old row stays in FastData's history, and the page says so.

### Fusion

A group of participants judged to be under common control. `{ id, members[], evidence[] { type: shared_owner | shared_signer | funding | sync, detail, source, status } }`. Produced by a counting rule, never by the agent. No evidence, no fusion (FR-014).

### Model signature

Proof of which model wrote a response (NEAR AI Cloud). `{ provider: "near-ai-cloud", model, completion_id, signature_kind, text, signature, signing_address, signing_algo, request_sha256, response_sha256, attestation { nonce, report_sha256, report_url }, fetched_at }`. Fetched right after the completion and stored next to the spec it produced, because how long NEAR AI keeps signatures is not documented. The attestation report needs a key to fetch, so Petal keeps it and serves it to anyone at `GET /api/v1/attestations/<report_sha256>` (`report_url`).

### Maker and proof

A person or agent who publishes under a NEAR account. `{ account_id, proof }`, where `proof` is a NEP-413 signed message: `{ type: "nep413", public_key, signature, message, nonce, recipient }`. The message names the entry hash, so anyone can check authorship without trusting Petal's server.

### Flower entry (published)

The unit in the shared map and the gallery. Schema: `$defs.entry`. Key `petal/v1/spec/<id>`.

| Field | Notes |
|---|---|
| `petal` | `"flower/v1"` |
| `id` | first 24 hex characters of SHA-256 over the canonical entry without `id` |
| `spec`, `spec_sha256` | the spec and its hash |
| `interpretation` | as above |
| `snapshot` | `{ sha256, urls[] }` where the body can be fetched |
| `render_sha256` | hash of the SVG bytes the reference renderer makes |
| `provenance` | `{ maker, agent { kind, model, signature }, tools_version, created_at }` |

State:

```
proposed ──► validated ──► rendered ──► signed by maker ──► published ──► mirrored
    │            │                                            (map tx hash)
    └── invalid (errors back to the agent, who fixes and re-proposes)

changed by conversation ──► new spec with variation_of ──► (same path)
```

A published entry is immutable. Changes make a new flower that points back with `variation_of`.

### Session

Sign-in to Petal's site. `anonymous ──► nonce issued (5 min) ──► signed in (NEP-413 verified, key is a full-access key of the account) ──► expired (24 h)`. Needed only to publish (FR-030).

### Run

One chat with Petal's agent, stored so the maker can leave and come back (spec edge case: long generation). `{ run_id, status, messages[], events[], draft?, flower?, created_at, updated_at }`, kept by `RunStore` (`.petal/runs/<run_id>.json` locally). Not published; not on the map.

State: `running ──► done (flower) | failed (error, explained)`. A run keeps going when the browser disconnects; `GET /api/v1/agent/runs/:id` returns it, and a new chat with `run_id` continues from its messages and draft.

### Payment quote

`{ purpose: "sponsor_refresh" | "sponsor_coverage", amount_usd, origin_asset, dry: true, quote { amount_in, amount_in_usd, time_estimate, ... }, correlation_id, signature }` (FR-031). Phase A: dry only, no deposit address, no money. Phase B, only with Elco's OK: one real quote and payment on mainnet.

## Relationships

```
Network 1──* Snapshot 1──* (Participant, Holding, Relationship, Event)
Snapshot 1──* Figures (derived, per measure and petal count)
Spec *──1 Snapshot      Spec *──0..1 LabelSet      Spec 0..1──1 Spec (variation_of)
Entry 1──1 Spec, 1──1 Interpretation, 1──1 Provenance(Maker, ModelSignature)
Map: Entry, Snapshot fingerprint, Index entry, Label, Correction — each tied to its writer account
Correction *──1 Entry (flower_id), targets one identity link or label
Run 0..1──1 draft Spec (local only, never on the map)
```

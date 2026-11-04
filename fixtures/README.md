# fixtures/

Data checked into the repo so tests, judges and a clean clone work with no keys and no network.

**Budget: ≤ 5 MB gzipped each, ≤ 25 MB in total.** `scripts/check-fixture-size.ts` enforces it (part of `scripts/check.sh`). A `.gz` file counts as its size on disk; any other file is gzipped to measure it. MB means 1,000,000 bytes.

Agents never read raw snapshot bodies; they use `describe_snapshot` and `compute_figures`.

| Folder | What goes there | Owner after M0 |
|---|---|---|
| `snapshots/` | Content-addressed snapshots (`snapshot/v1`, `packages/core/schema/snapshot.schema.json`): `<sha256>.json.gz`, where `<sha256>` is the SHA-256 of the RFC 8785 canonical JSON of the uncompressed document. `index.json` maps (chain, population, block) to the hash. This is the first place `get_snapshot` looks. | W2 |
| `snapshots/test/` | Small, hand-sized, schema-valid snapshots for unit tests (plain `.json`, not in `index.json`). | W2 |
| `golden/` | Golden render files: `<name>.svg` plus `<name>.json` (legend and petals). `pnpm golden:update` rewrites them; a person reviews the diff. | W1 |
| `golden/inputs/` | Snapshots used only as golden-test inputs. Outside the store's lookup path, so a live pull stays live. | W1 |
| `transcripts/` | Recorded runs: agent transcripts replayed by `recordedClient`, and the recorded 1Click dry quote replayed by `fakeQuote()`. | W5 |
| `map/` | Hero flower entries (`flower/v1`) as they would sit on the shared map; the mirror for the hero set. | W5 |

Nothing under `../research/`, `../design/`, `../submission/` or `../.secrets/` is ever copied here. Fixtures are produced by scripts (`scripts/import-spike-data.ts`) that transform public data, so they can be rebuilt.

## What is here (M0)

| File | What |
|---|---|
| `snapshots/72a6d967….json.gz` | `near-validators` at block 222,915,356 (2026-11-03), imported from the step 1 crawl by `pnpm import:spike`. All 371 seated validators, 862 pools, owners and liquid-staking contracts; the 8,319 delegations of at least 1,000 NEAR stay individual (98.76% of delegated stake); the other 277,769 are folded into 565 `group` rows, one per pool and backer class, declared in `coverage.grouped`. 6.4 MB canonical, 0.83 MB gzipped. |
| `snapshots/index.json` | `{ "petal": "snapshot-index/v1", "snapshots": IndexRow[] }` (`IndexRow` in `@petal/core/types`): sha256, network, chain, population, block_height, as_of, final, bytes, gz_bytes, file, where, module. |
| `snapshots/test/two-participants.json` | The two largest seated validators, stake only (the 2-petal golden). |
| `snapshots/test/tiny-backers.json` | Five seated pools whose backers cover every class, with owners, holdings and delegations; the rest folded into declared groups. |
| `golden/inputs/house-of-stake-2026-11-04.json.gz` | `near-house-of-stake` at block 223,021,333, for goldens only (not indexed, so the quickstart's live pull stays live). |
| `map/313ced42….json` | The skeleton's fixture flower: the recorded skeleton run as an entry (`provenance.maker: null`, model `recorded`), made by `node tests/e2e/skeleton-entry.ts --write`. Listed as `fixture`, never "on NEAR". A stand-in until the hero set (T115). |
| `transcripts/skeleton.hand.json` | Hand-made agent run for "who stands behind NEAR's validators?" (`transcript/v1`, replayed by `recordedClient`). |
| `transcripts/1click-dry-quote.json` | A 1Click dry quote reconstructed from the 4 Nov measurements (`recorded-quote/v1`, replayed by `fakeQuote()`); placeholders are named in its `note`. |

Test snapshots use their own network ids (`test-*`) and no block height, so they never collide with a real store lookup.

### Backers in the NEAR validators snapshot

`backerSegments` reads classes from the snapshot alone. First match wins, computed over the whole crawl before folding:

| Class | Who | Marked on |
|---|---|---|
| `lockup` | lockup contracts (`account_type: lockup`) | delegator `detail.backer_class`, group `detail.backer_class` |
| `liquid` | liquid-staking contracts (`kind: staking_entity`) | same |
| `large` | accounts with 1,000,000+ NEAR staked across all pools | same |
| `other` | everyone else | same |

Group rows: `id` = `group:<pool>:<class>`, `kind: group`, `count` = accounts folded, `detail.pool`, and one `delegates_to` relationship to the pool carrying the summed amount (`detail.rows_folded`, `detail.unstaked`). `coverage.measure` is `delegated_stake` (the `delegates_to` amounts); the figure measure for the flower is the holding `validator_stake_current_epoch`.

### Transcript format (`transcript/v1`)

`{ petal, kind: "hand" | "recorded", title, question, model, note, turns: [{ content, tool_calls: [{ id, name, arguments }] }] }`. `turns[i]` is the model's i-th reply. Inside a reply, `{ "$from": "call_1.sha256" }` is replaced by that value from an earlier tool result, and `{{call_3.nakamoto.count}}` puts one into text, so a hand-made run never hard-codes a hash or a number.

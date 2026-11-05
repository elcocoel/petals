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
| `snapshots/c46437a2….json.gz` | `moloch-v1` with `dao` 0x1fd169a4…, at Ethereum block 13,199,430 (2021-09-10), the block before proposal 143: 70 members, 3,760 shares, read keyless by `packages/inputs/scripts/pull-module.ts`. |
| `snapshots/486ef8b7….json.gz` | `solana-spl-holders` with TRUMP's `mint`, at Solana slot 465,695,924 (2026-11-05): 691,983 wallets from 1,949,263 token accounts. The 1,000 largest stay individual; the other 690,983 are folded into rank bands, each no larger than the smallest individual wallet, declared in `coverage.grouped`. Imported from a stored answer of the same call. |
| `snapshots/3e695e66….json.gz` | `solana-spl-holders` with MELANIA's `mint`, at slot 465,695,433, the same way: 222,279 wallets from 639,927 token accounts. |
| `snapshots/1d063af1….json.gz`, `snapshots/bddcf0dd….json.gz` | `beanstalk` at Ethereum blocks 14,602,789 and 14,602,790 (2022-04-17): voting roots of 2,035 and 2,036 addresses, read keyless. The rows sum to `totalRoots()` less a remainder stated in `coverage.note`. |
| `snapshots/ad9aedfd….json.gz` | `erc20-votes` with ENS's `token`, at Ethereum block 26,348,717 (2026-11-05): all 8,561 delegates with votes, read keyless. |
| `snapshots/ebacaf5c….json.gz` | `erc20-holders` with BANK's `token`, `window_days` full, at Ethereum block 26,348,909: BANK, 5,571 holders by replay of 75,770 Transfer logs, read keyless. The 300 largest stay individual; the rest are equal slices of their total, none larger than the smallest listed holder, declared in `coverage.grouped`. A slice describes no real holder. |
| `snapshots/3f3f097d….json.gz` | `erc20-holders` with DPX's `token`, `window_days` full, at Arbitrum block 521,483,627, the same way: DPX, 262,682 holders from 2,422,221 Transfer logs, read keyless. |
| `snapshots/b82956b9….json.gz` | `erc20-holders` with SEAM's `token`, `window_days` 7, at Base block 53,548,781: addresses that moved SEAM in the last 7 days and what they hold, read keyless. Not every holder: `group:not-read` is the rest of the supply, and it is not attributed. |
| `snapshots/index.json` | Modules take their target as parameters, and a request with the same parameters reuses the fixture: rows carry `params`, and a row's `population` is built from them. `{ "petal": "snapshot-index/v1", "snapshots": IndexRow[] }` (`IndexRow` in `@petal/core/types`): sha256, network, chain, population, block_height, as_of, final, bytes, gz_bytes, file, where, module. |
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

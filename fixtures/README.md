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

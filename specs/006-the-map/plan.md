# 006 plan: milestone 2, the bench at `/lab/map`

**Created**: 2026-11-09, by LOOK.
**Scope**: the bench only (spec milestone 2). It doesn't change `packages/core/src/render`; the one look (milestone 3) gets its own plan, which goes to META first.
**Lane**: `build.fe-map`, branch `m-face/fe-map`, port 3191.

## Data, read-only from the live server

| What | From | Used for |
|---|---|---|
| Groups and pairs | `GET /api/v1/relations/overview?kind=holdings&limit=5000` | Continents (by `chain`), the force between flowers (`shared`, `weight`), roads |
| The night's views | The 203 `/d/<sha>` links in `research/mapping-run-2026-11-09/INDEX.md` | Which flowers exist |
| Each view's reading | `/d/<sha>` gives the spec; `POST /api/v1/render` with `include_reading: true` gives `{title, petals}` | The flower itself, as on `/make` |
| View to group | `spec.snapshot.sha256` = the group's `snapshot_sha256` | Joining the two |

A view's spec is content-addressed, so its reading never changes: cached for good, as the landing lane does (`lib/api.ts`, `forever`).

## Places (`places/v1`), worked out once and saved

- **A script** (`apps/web/scripts/landscape-places.ts`) reads the overview and the views, and writes `apps/web/lab/map/places.json`. That file is the address book: a version, then each flower's group, view, chain, place and size. It's checked in.
- **Pure layout** (`apps/web/landscape/places.ts`), tested without a browser and deterministic, with no randomness:
  - **Continents:** one per chain, each sized by its flowers and set apart with room between them.
  - **Inside a continent:** a force map. Linked flowers pull together by their overlap weight, and every flower pushes the others away, so nothing overlaps.
  - **A second run keeps every saved place and only places new flowers**, near their strongest links. That's what makes a place an address.
- **A flower's size on the map:** a narrow range by member count, about 1x to 2.5x. This is a lean inside the order, flagged for Elco when the bench is shown; equal size is the other way.

## The flower carries over unchanged, with one change: the camera belongs to the space

Today each flower owns its camera (`flower/live.ts` steps it in `stepLive`). On the map, one camera moves over every flower, and each flower gets a view worked out from it:

```
flower view:  k = K × s      x = X₀ + K × (fx − s × cx)      y = Y₀ + K × (fy − s × cy)
(K, X₀, Y₀ the map's camera; fx, fy, s the flower's place and size; cx, cy the flower's own centre)
```

- `stepLive` takes an optional view. Without one, it steps its own camera as today, so `/make` doesn't change. `test/flower-live.test.ts` and the others must still pass unchanged.
- `camera.ts` gets a home and limits as inputs (today they're the one flower's), with the same springs and soft edges.
- Marks, detail, hover, focus and the crossing into an account all stay as they are, because they already work from the flower's size on screen ("nothing here is a global level", `flower/detail.ts`).

## Drawing the landscape (`apps/web/landscape/`)

- **Far away, each flower is its own silhouette:** one path from its reading at rest, the same geometry the flower's own far row draws (`flower/ring.ts`). One path per flower and one per road, which is the compound way the 5 Nov proof measured.
- **Handing over:** when a flower's radius on screen reaches the point where its own petals fade in (`detail.ts`, petals from 56 px), a live flower mounts in its place, as its own full-window layer over the landscape. Its silhouette is the same shape, so the change doesn't show. It unmounts a little lower, so it doesn't flicker. Only flowers on screen and that big are live, which is a few at most.
- **Roads:** far away, one straight line per pair, its width and opacity by the shared count, thinning and fading as more lines are on screen. Up close, once both ends are big, the line fans out: one thin line from each petal in the first flower to the same account's petal in the second. Accounts outside the drawn petals go to "everyone else".
- **New detail rows,** in the same table and the same form: the flower's mark, its title under it, the roads and the fan-out. Every number starts as a guess from the 5 Nov proof and is judged by hand.
- **The pointer:** the landscape hook owns the pointer, wheel and keys, and passes the pointer on to the live flower under it. Esc and the way back fly to the landscape.

## Nothing unasked

The page shows no new words: only the flowers' own titles and the data's counts. No colour beyond today's flower, no frontier, no "around you", no panels beyond the flower's own. The lab bench stays hidden in production unless `PETAL_LAB=1`, as `/lab/flower` does.

## Tests

- `landscape/places`: same input gives the same places; no two flowers overlap; linked flowers sit closer than unlinked ones; a rerun with one new flower moves nobody else.
- `landscape/roads`: counts and weights from the pairs; fan-out ends on the same account in both flowers.
- The flower's view from the map's camera: at the hand-over, the live flower and the silhouette coincide.
- Every existing flower test passes unchanged.

## Measuring

The probe, as on the bench (`?probe=1`): frame times while zooming from the whole landscape into ENS delegates, then into one delegate, on Elco's Mac, with the CPU throttled 4x. The bar is the 5 Nov proof's: about 60 full frames a second.

## Built, 9 Nov (lane `m-face/fe-map`, `3f12193`, not merged)

What's on the bench, and where it moved from the plan above:

- **Data:** the night's 203 views, their readings and the index's pairs are copied once into `fixtures/landscape/night-2026-11-09.json.gz` (0.66 MB), by `apps/web/scripts/landscape-data.ts`. A page load can't fetch them: the server allows 60 calls a minute, and a view takes two. A rerun fetches only views it doesn't have.
- **Scripts live in `apps/web/scripts/`,** because the repo's `scripts/` can't import the web app's files.
- **Roads are same-chain matches only.** 1,060 of the index's 3,354 pairs are guessed across chains from the same EVM address (`match.status: inferred`). They're a different claim, and the map leaves them out for now.
- **Each flower pulls on its strongest three links only** (`backbone`, `ROADS_FAR`). Pulling on all of them knotted Solana, where nearly every group shares someone with every other. Far away, a flower shows those three; the rest come in with a new row, `roadMore`.
- **Flowers with no links sit on the shore,** past every linked flower.
- **The fan's rest:** ENS and Uniswap delegates share 1,731 accounts, but none of them is among either flower's 60 drawn petals. So besides the lines between shared petals, one line joins the two "everyone else" petals, weighted by the accounts left over.
- **Measured** on this Mac in Chrome, zooming from the whole map into one ENS delegate's account: 0.5 ms a frame typical, 1.1 ms at the 95th percentile, 2.4 ms worst.
- **Tests:** 15 new tests in `apps/web/test/landscape.test.ts`; the flower's 152 pass unchanged; 3,353 in all.

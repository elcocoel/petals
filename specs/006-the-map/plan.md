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

## Bench v2: one chain, simpler, elegant (Elco, 9 Nov, evening)

From "Elco on the first bench" (spec) and Elco's four answers. Lab-only, on `m-face/fe-map`. META's go, 9 Nov.

| Elco | What the bench does |
|---|---|
| "I don't think we have to see more than one chain at a time... a selector on the side... like how you would do on an exchange" | A list down the left: one `row` button per chain (`components/ui/Button.tsx`), its name (`chainLabel`) and how many flowers it has, the chosen one pressed. The map shows that chain's continent alone, fitted to the window. It starts on Ethereum (a lean: the most links). No new words. |
| Connections: "far away distance and one thicker of thinner line dictated by the amount of shared accounts - the number and details can show as you zoom or click the connection" | One straight line per connection, its width by the accounts shared. Far away, each flower's strongest three; the rest come in as you zoom (rows `road`, `roadMore`). The fan into petals goes. The number shows at the line's middle once its flowers are big enough (row `roadCount`), and a click on a line marks it and shows its number at any distance. |
| Entering: "Only the organization with 'outgoing' lines with an arrow that has the name of the neighbours (in the orientation of where they would show up if you zoom out)" | A click on a flower flies to it, filling the window as it does alone; so does zooming in until it fills most of the window. Everything else fades away. From its edge, one arrow per connection points the real way to that neighbour, its width by the accounts shared, ending near the window's edge with the neighbour's mark and name. Where two names would collide, the stronger connection keeps its name. A click on an arrow flies into that neighbour. Esc, or zooming back out, brings the map back. |
| Logos: "Real logos, symbol if none" | `apps/web/scripts/landscape-logos.ts` copies each token's logo once from Trust Wallet's public list (`trustwallet/assets`, by chain folder and checksummed address) into `fixtures/landscape/logos/`. A flower with no logo there gets a mark made from its token symbol: the first word of its title when it reads "SYM holders", "SYM active holders" or "SYM delegates". With no token, the first letter of its name. |
| Names: "Mark + short name, under" | One line under each flower, always the same size on screen: the mark, then the run's name for it without its notes in brackets, cut at 28 characters. Names never sit on a flower; when two collide, the bigger flower keeps its name and the smaller shows only its mark. On the map, a live flower draws no title of its own. |
| "the Z dimension here is confused" | One order, bottom to top: roads, flowers, live flowers, names and marks, then the notes of the one flower under the pointer (or the one you've entered). Other live flowers show no notes. |

## Drawing from the viewer's view (after seam/v1, 9 Nov)

META's go once `seam/v1` was live (`1c82b33`); the reading is SYSTEMS's, so this waits for their OK too. Lane `m-face/fe-viewdraw`.

**The change, in one line:** `readFlower(spec, snapshot, view?)`. With a view, each dimension's choice comes from the view, matched against the flower's own data (`seamOf`'s pieces); without one, nothing changes, so the golden readings stay as they are.

**How a view's choice becomes what's drawn today.** The look draws only what it already draws; a choice it can't draw yet shows nothing, and the legend leaves it out ("declared, never imitated").

| Dimension | The view names | Drawn as |
|---|---|---|
| height | `share` / `amount` / any amount or count by its name | share (its scale) / amount (log) / that piece, relative to the largest; nothing: equal heights |
| width | `share` | share in its band; anything else, or nothing: equal |
| order | anything | largest first (the only order built) |
| colour | `kind` / `identity` | kind of account / named or anonymous; anything else, or nothing: one colour |
| outline | `identity` | the identity's status; anything else, or nothing: none |
| segments | `backers` | the pool's backers; anything else, or nothing: none |
| markings, texture, lines | anything | nothing yet |

- **A pure step in core,** `encodingsOf(view, spec, seam)`, gives `spec/v1`-shaped encodings with each meaning taken from the data's own label, so the legend is exactly what's drawn. `readFlower` uses them in place of `spec.encodings`. The reading's `spec_sha256` stays the spec's: the flower is the same flower.
- **The agent's choices stay in its spec,** as its proposal (Elco: "Agent proposes, person adjusts").
- **Where the view comes from:** `render_flower` and `/api/v1/render` take an optional `view`; the web passes the viewer's. Until a person can set one (the lobby's settings, later), the viewer's view is the default.
- **A correction:** the default view turns bands on (`segments: backers`), but today's `default/v1` doesn't; the default becomes `segments: null`, so the default view changes no drawing. Its fixture and pin change with it.

**Tests:** without a view, every golden reading is byte-identical; with the default view, the default specs' readings are the same; a view naming a piece a flower lacks draws nothing in that dimension; markings, texture and lines draw nothing yet.

**Elco, 9 Nov: the default view for all.** Until people can set their own view, every flower is drawn by the default; the agent's choices stay with the flower as its proposal and don't show until a person can adopt them.

**SYSTEMS, 9 Nov: OK,** on two conditions: without a view the golden readings stay byte-identical, and with one the reading keeps `reading/v1`'s shape (same fields, only the values the view picks), so it stays v1. Height by a piece's name keeps today's path, `m:<name>` through `measureTable` on the composed snapshot. The optional `view` on `render_flower` and `/api/v1/render` is additive; SYSTEMS raises `tools_version` once for the day's tool changes, so this lane doesn't.

## Milestone 3: the one look (plan, 10 Nov)

Elco: "no second look - one first look that we improve on"; V8: "Always the latest look". Rule 11 of `design/minimally-good.md`: the same flower looks the same everywhere. Today the still pictures (the landing's Power Map, the gallery and lobby tiles, a flower's page, drafts) are `render/v1`'s bars, and `/make` and the map draw the wedge flower. This touches `packages/core/src/render`, so it goes to META first, then SYSTEMS for core.

**The change:** the wedge flower becomes the renderer's one look, `render/v2`, and `render/v1` stops being drawn.

1. **One home for the geometry.** The wedge flower's pure parts move from `apps/web/flower/` into core, under the renderer, as `packages/core/src/render/wedge/` (SYSTEMS: render/ stays the one place that draws): `ring.ts` (itself a copy of `render/geometry.ts` with wedges), `model.ts`, `detail.ts`, `marks.ts`, `words.ts`, `order.ts`, and the two constants they read (`GUTTER`, `RECEDE`). The live flower imports them from core, unchanged, so `/make` and the map draw exactly what they draw today. The DOM parts (`scene.ts`, the camera, springs, the hook) stay in the web.
2. **A still skin from the same marks.** `render/skin-v2.ts`, `render/v2`, draws the flower at rest, fitted to the requested size, by asking `marks()` what shows at that size, the same table that drives the live flower, and writing the SVG as text, with no DOM. So a tile shows what the live flower shows at a tile's size, and a page shows what it shows at a page's size.
3. **Colour from the reading.** The default view says `colour: kind`, and the legend says so, so the one look paints each petal by its kind with the palette `render/v1` already has (`style.ts`). The live flower paints it too, since it's the same look; today it's all grey, and the legend lists colours it doesn't draw. This is the one visible change on `/make`.
4. **Versions:** `RENDER_VERSION` becomes `render/v2`, and `SKINS` holds only it. A published flower stays the same flower: its id leaves the drawing out, and its page says "Same facts, today's look." `contract-surface.test.ts` pins the version; SYSTEMS raises `tools_version` with its own changes.
5. **Goldens:** the `.svg` and `.json` goldens are redrawn (`pnpm golden:update`) and reviewed; the `.reading.json` goldens stay byte-identical, which proves the facts didn't move.
6. **Caches:** the landing keeps a drawing for a year (`lib/api.ts`, `forever`). Its request names the look, so `render/v2` asks anew and nothing old stays.

**Done when:** the landing's Power Map, the gallery, the lobby's tiles, a flower's page and a draft all draw the `/make` flower; no page draws the bars; the readings are unchanged; the whole check is green.

**SYSTEMS, 10 Nov: OK** on all of it; `tools_version` stays, since no tool's shape changes. Kept as history and never rewritten: `fixtures/map/3394fb87….json` (a `flower/v1` whose signed id holds its `render_sha256`) and `packages/core/schema/fixtures/entry.v2.json` (`drawn_with: render/v1`, pinned). What changes, and is fine: the ETags of `/api/v1/render` and `/api/v1/flowers/:id/svg`; the SVG's `data-petal` mark moves with the look (the old string is only in `apps/web/lib/mock/near-validators.json`); new publishes record `drawn_with: render/v2`.

**Not in it:** marks at the tips, texture and lines (V5, V6), and the joy layer. Words stay as they are.

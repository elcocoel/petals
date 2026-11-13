# Research: where the code points for one continuous map (W9)

**Created**: 2026-11-08
**Feeds**: `spec.md`, W9's question: where the code already points, and how to expand in that direction.
**Method**: a read of `main` at `e526d5e` and the spikes and design notes, file by file. Nothing changed. The relations index was checked answering on a development server (`/api/v1/relations/overview`).

## In one paragraph

The live canvas is built for one flower at a time. Three things already point toward one map: a measured spike that drew 1,000 flowers in one zoomable space, a working index of the accounts that groups share, and zoom detail that's already worked out per flower. The biggest gap is data: the shared map holds two flowers, and both are the same NEAR validators group.

## What already points toward one map

| What | Where | What it does | State |
|---|---|---|---|
| Canvas proof (T182) | A separate spike | 40, 200 or 1,000 made-up flowers in one zoomable space, three levels each, two ways to draw lines between groups. Flowers sit on a jittered grid | Spike, made-up data |
| Relations index (T198) | `packages/relations/` | Rebuilt from stored snapshots. For each pair of groups, counts shared accounts, weighted by share. Answers: an account's groups, a group's related groups, every group and every linked pair (a ready dots-and-lines list), a path between two accounts. Each answer says its dates, marks partial data "at least", and says "shared membership is not coordination" | Live behind `/api/v1/relations/*`, for outside agents. Withheld from Petals' own agent on purpose (`packages/agent/src/tool-defs.ts`). **Nothing on screen calls it** |
| One id per account across flowers | `specs/001-petal-core/contracts/renderer.md` | An account keeps its id in every flower on one chain, so a later level can draw relations between flowers | Written and true in code |
| A flower can find its group | `packages/relations/src/queries.ts` | A flower names its snapshot, and the index finds that snapshot's main group | In code, unused by the canvas |
| Detail by distance | `apps/web/flower/detail.ts`, `feel.ts` | Each row follows that flower's own size on screen ("nothing here is a global level"). Far rows: one solid shape and its title underneath. Zoom runs 0.05 to 24, about 480x | Live on `/make` and the bench |
| The small map back | `flower/scene.ts`, `marks.ts` | The flower small in a corner with your account lit: the only "where am I" | Live, one flower |
| Explorations as a trail | `packages/tools/src/tools/explorations.ts` | A person's flowers in order, each pointing at its parent, like saved versions | Stored, never drawn |
| The vision | Design notes, T188 | A navigable atlas, "one continuous world", three levels, crossing between levels as the design problem, a campaign map | Written only |

The bench's `?relations=1` isn't relations between groups: it draws 34 random lines inside one flower, with no data behind them (`apps/web/lab/flower/illustrative.ts`).

## What makes each flower its own universe

- **The space is one flower:** 800 units across, centred at (400, 400) (`flower/ring.ts`). Geometry and the pointer test measure from that centre (`model.ts`).
- **The camera's home is that flower.** Fit, Esc and the small map fly back to it (`camera.ts`, `useFlowerCanvas.ts`). Zoom limits are fixed for that space.
- **The drawing takes one flower:** `createScene` builds one shape, outline, title and small map (`scene.ts`).
- **A new flower wipes everything:** the canvas is keyed by the flower (`InteractionSurface.tsx`), so a new one tears down the drawing and the camera. The panel holds exactly one canvas flower (`panel-view.ts`).
- **A click doesn't know which flower:** it reports a petal, the centre or the ground.
- **Loading fetches one flower** (`lib/workspace-home.ts`), and the canvas gets only a title and petals: no group, snapshot or chain.
- **The system says so:** `surface.canvas` is "One flower on the ground, filling the window" (`packages/tokens/behaviours.ts`).

## What's measured

On an M5 Max with made-up data (the canvas spike):
- **1,000 flowers held:** at 60 petals each, about 59 frames a second; 56 with the processor slowed 4x; 59 with no graphics chip. One web element per piece fell to 19 and 5.
- **Effects are the limit:** glows and moving pulses on 1,000 flowers broke the frame rate while zooming. Pixi crashes the page with no graphics chip.
- **By eye:** best was 200 flowers at 30 to 100 px radius. 1,000 flowers with 1,415 lines was a hairball. A flower reads as a rosette from about 30 px radius; lines should thin to about 1 px and fade as more are on screen.
- **Lines between groups:** 283 pairs held 60 frames a second at 200 groups, in an older drawing mode, never re-measured in the chosen one.
- **One live flower:** 58 to 60 frames a second up to 500 petals.
- **Data side** (a graph spike): today's data loads in about 150 ms; a path between two accounts takes 26 ms at 25 million made-up rows.
- **Not measured:** a cheap laptop (the biggest risk), Safari, Firefox, 120 Hz screens, the live camera with many flowers.

## Three directions the code and notes already lean toward

**A. One space, many flowers, each with its own detail.** Evidence: the canvas proof and the stack chosen from it; `detail.ts` is already per flower with far rows; the zoom range exists. Missing: a drawing and camera that hold many flowers and draw only what's on screen; a rule for where each flower sits; a home view of the whole landscape; a click that knows which flower; loading many at once.

**B. Shared accounts as the roads between flowers.** Evidence: the overview query returns every group and every pair with counts; ids hold across flowers; the proof's own conclusion, one line with a count from far away ("reads like a transit map") that fans out into the shared petals up close. Missing: anything on screen calling it; lines in the chosen drawing mode; a layout from overlaps; the fan-out crossing; a rule for accounts in almost every group.

**C. Grow outward from where you are.** Evidence: the atlas design note says fetch "only the relevant neighbourhood", names three moves (follow a relationship, enter a network, widen the context), and says the edge of what's known is part of the product, because a visible frontier is the reason to grow the map. From any petal, the index can list that account's other groups; explorations already store the trail. The doc's proposed first test: one real route, account to DAO to flower to chain, ending at a real gap in coverage, "before building an infinite canvas". Missing: any drawing of the frontier; crossing into a neighbour; positions kept apart from identity.

The order written so far: one flower alive, then what's inside a flower, then the map.

## Data that doesn't exist yet

- **The shared map has two flowers, both NEAR validators** (one fixture, one testnet row, same snapshot). A landscape of published flowers would show one group twice.
- **Relations cover stored snapshots, not published flowers.** Ten snapshots give 447 groups. Of the 36 pairs among the main groups, 9 share anyone, mostly 1 to 6 accounts; the biggest is MELANIA × TRUMP at 120. Coverage is thin (for example the top 1,000 of 222,279 holders), so every count is a lower bound.
- **NEAR's 437 per-pool groups are dense but distorted:** three delegators who back more than 50 pools make 97.7% of the 41,853 linked pool pairs.
- **No positions exist anywhere.** Entries carry no coordinates, and no layout method is chosen.
- **Lines inside a flower have no source:** `interactions` exists, and nothing fills it.
- **One snapshot can hold many groups** (NEAR validators holds 438); the flower-to-group bridge finds only the main one.

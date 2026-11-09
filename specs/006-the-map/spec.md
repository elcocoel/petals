# 006: The map

**Created**: 2026-11-09, by LOOK, after Elco's answers in chat.
**Status**: Draft for Elco. Nothing is built. Decisions below are Elco's; open questions have a lean, and Elco decides.
**Parent**: `003-target`. Where this disagrees with `003-target`, `003-target` wins until Elco says otherwise.
**Builds on**: `001-petal-core` (the reading, the recipe, the renderer), `002-system` (the relations index), `005-mapping-brain` (the data protocol, the seam, the brain).
**Takes over from `004-workspace`**: W8 (the visual protocol, questions V1 to V8), W9 (one continuous map) and B3 (one canvas for everything mapped).
**Working note**: `design/map-now.md` (what was said, where the code was on 9 Nov, the choices as asked).

## Input

> The map itself is more important than improving the flower - but they are all part of the same "thing" - the map zoomed out showing multiple things zooms into one org that zooms into accounts - we have talked on this and seen parts of it working well, so let's make sure that we are building on solid ground and doing proper knowledge management so the improvements connect into a future complete system. (Elco, 9 Nov)

> Its important that we use the architecture that we designed - as we improve this, there's a versioned data protocol and a versioned way to render it and the brain. (Elco, 9 Nov)

> I wish I could just flow through the spaces of what got mapped. (Elco, 8 Nov)

> My ideal sensation would be a ongoing canvas that you feel compelled to even make it grow more. (Elco, 8 Nov)

> If we can identify "links" between 2 investigations that bridge them, we can have a "force map" of individual universes that are connected, so it feels like an infinite canvas, but it has discreet "addresses". (Elco, 8 Nov)

> We're gonna go "full apple" on this flower thing, lots or responsiveness on hover, things growing and shrinking as people travel it should feel fun and cool. (Elco, 5 Nov)

The feel: a campaign map, "like Civilization or Napoleon: Total War", a visual feast at every zoom (Elco, 5 Nov).

## The picture

```
 THE MAP (this spec)
   the landscape    every flower in one space, on continents
   places/v1        where each flower sits, saved: its address        ◄── the relations index (002)
   roads            shared accounts between two flowers               ◄── the relations index (002)
   the crossing     landscape → one flower → one account, by zoom
        │
        │ draws each flower with
        ▼
 THE LOOK            the visual protocol, view/v1 (W8): which channel shows which measure
   the one look      the wedge flower, live and still, versioned as one look that improves
        ▲
        │ reads
 THE READING         reading/v1 (001): who, how much, what kind. No pixels
        ▲
 THE SEAM            seam/v1 (005): a view over layers
        ▲
 THE DATA PROTOCOL   layer/v1 (005): facts about an address's participants, by author
```

Each step has its own version and moves on its own. A new place doesn't touch the look; a new look doesn't touch data; new data needs no new drawing.

## The three levels

Elco's definitions (5 Nov), with the words this spec uses:

| Level | Elco's word | What you see |
|---|---|---|
| **The landscape** | "relations between groups" | Every flower, small, on its chain's continent, joined by roads |
| **A flower** | "a group", "one org" | One group of accounts that share something, usually a token: today's `/make` flower |
| **An account** | "an account" | One petal opened into a panel |

**The crossing is the design problem.** Elco, 5 Nov: the thresholds are about "crossing those boundaries elegantly. That's kind of what we have to design for."

## Elco's decisions (9 Nov)

1. **The map first, as one thing with the flower:** landscape, then one org, then its accounts.
2. **The flower is the one on `/make`:** "reactive flowers that were wedges not spikes, that we could zoom in and out from".
3. **Places are continents:** each chain a continent, and a force map inside it, so flowers that share accounts sit close. "And when appropriate, around 'you' or whatever is the center of an investigation - but for this landing page one, that is not relevant."
4. **Roads:** one line with a count from far away, fanning into the shared petals up close.
5. **The crossing is a continuous zoom:** the zoom is the only clock; stop part-way and it stays part-way.
6. **This spec is the map's home.**
7. **One look everywhere:** the `/make` flower gets a version name, and the still pictures (landing, lobby, gallery, a flower's page) are drawn by it too. Elco, on the systems check (`coordinator/systems-check-2026-11-09.md`): "no second look - one first look that we improve on".
8. **First build: a bench at `/lab/map`,** real data only. Onto pages after Elco's go on each.

## Elco on the first bench (9 Nov, evening)

> Okay, so for now, this map is a total mess. We're not in love with it. I don't think trying to convey the connections and the accurate map on on this thing is super great. Also, the Z dimension here is confused. Some stuff is on top of other stuff. I think we need one to add the fact that we grab a logo or some version of a token symbol for each of these organizations. We need a standardized way for the name to show up in a way that it doesn't sort of break the graph. I feel that we need a simplified version for connections at different levels of zoom. And this has to be elegant. I don't think we have to see more than one chain at a time. So maybe there's a selector on the side where you choose your chain, kind of like how you would do on an exchange and then resolution and detail shows up as you zoom in. We need just to work a little bit on the elegance of this zoomed out view. And ideally, there is, although it is a continuous zoom, there should be some version of a click or a moment where you do enter into a I am looking at this specific organization mode and all things else fade away. So we need to, this is a valid start, is a step in the right direction. Now we just need to make things a little simpler and figure out how to make it elegant.

What it asks of the next bench:

1. **One chain at a time,** chosen from a selector on the side, as on an exchange. Detail comes in as you zoom.
2. **A logo, or some version of a token symbol,** for each organisation.
3. **One standard way to show a name,** so it never breaks the drawing.
4. **Simpler connections,** different at each distance.
5. **One clear order of what's on top of what.**
6. **A moment of entering one organisation:** the zoom stays continuous, but a click or a moment puts you in "I'm looking at this organisation", and everything else fades.
7. **Elegance in the far view,** above all.

## The parts

### M-A. The one look

- **What:** today's live flower (`apps/web/flower/`) becomes THE look: wedges with a stable line between them, straight edges, heights true to the reading, continuous detail. It isn't a second look beside the bars. It's the one look, and it improves by versions, like the system's tokens (v1, then the joy layer).
- **One geometry, two outputs:** the live canvas and the still SVG draw from the same wedge geometry, kept in the shared renderer (`packages/core/src/render/`). Today `apps/web/flower/ring.ts` is a copy of `render/geometry.ts` with wedges added.
- **A published flower stays the same flower** when the look improves, because its id leaves the drawing out (`flower/v2`, `drawn_with`). Whether a flower can still be drawn as an older version of the look is V8, which META is asking Elco now.
- **Tests lock the reading, not the pixels** (`design/frontend-foundation.md`).
- **Shared:** every page draws flowers, so the plan goes to META before `packages/core/src/render` changes.

### M-B. Places (`places/v1`)

- **What:** each flower's continent and its spot on it. A place is neither a fact about accounts nor part of the look. It's where a flower sits, and it stays apart from the flower's identity.
- **Continents:** one per chain, since an account only matches on its own chain (`packages/relations`, one account per chain).
- **Inside a continent:** a force map, where flowers that share accounts pull together, weighted by the index's overlap.
- **Addresses:** places are worked out once and saved. A new flower takes free space near its strongest links, and nobody else moves, so a place stays the same as the map grows.
- **Around a centre** (you, or an investigation's subject): a second way to arrange, for later, as a lens over the same flowers. Not on the landing.

### M-C. Roads

- **Source:** the relations index's pairs (`/api/v1/relations/overview`): two groups and the number of accounts they share.
- **Far away:** one line between two flowers, its weight and its count showing how many accounts they share.
- **Up close:** the line fans into the shared petals, ending on the same account in both flowers.
- **No hairball:** lines thin to about 1 px and fade as more are on screen (`research/spikes/canvas/RESULTS.md`).
- **What a road says:** "same accounts", never "working together". The index's own words: "Shared membership is not coordination."

### M-D. The crossing

- **One camera for the whole landscape.** Today's camera homes on one flower (`apps/web/flower/camera.ts`).
- **Detail stays per flower, by its size on screen.** Today's table (`apps/web/flower/detail.ts`) already works this way ("nothing here is a global level"), so it carries over to many flowers. New rows come first: a flower as a mark far away, its title, roads, then the rows that exist today.
- **The way back:** the small map shows the landscape with your place lit.
- **Starting values, from the 5 Nov proof:** a flower reads as a rosette from about 30 px radius, and a petal opens into an account from side 24 to 72 px. All of them get judged by hand.

### M-E. One component

The map is one component. It goes on `/lab/map` first, then, each on Elco's go, onto the landing's Power Map, behind the chat on `/make` (B3) and into the lobby. People see "Power Map" (Elco, 9 Nov); code says `landscape`, because `map/v2` already names NEAR's shared registry of published flowers.

### M-F. The view (`view/v1`, W8)

Moved here from `004-workspace`. Elco answered V1, V3, V7 and V8 on 9 Nov (through META); the contract, in Elco's words, is `contracts/view.md`, with its schema draft `contracts/view-v1.schema.json`.

- **Dimensions are the visual primitives, a handful and fixed; data and dimensions are independent.** "the data doesn't have to know how it's being shown, the rendering doesn't need to care what data is living in which dimension". Any piece of data of a fitting kind can go in any dimension (V1, V3; V2 and V4 follow from it).
- **One view per person, for every flower, with a default:** "Agent proposes, person adjusts, settings are global" (V7). The lobby's settings come later.
- **Always the latest look** (V8).
- **Still open:** V5 (how lines inside a flower show) and V6 (how time shows), in `004-workspace/visual-protocol.md`.
- **Words, with Elco:** "data" or "a piece of data", and "dimensions"; not "measure".

### M-G. The edge of the map (later)

A flower's unmapped neighbours show at the edge, and "map this" becomes a job for Petals' agent or the person's own (`design/talk-to-the-ai.md`, C). Written down so the landscape leaves room for it.

## Versions this spec adds

| Name | What | Where |
|---|---|---|
| The look's version | The one look, the wedge, live and still; the bars stop being drawn | `packages/core/src/versions.ts`, the renderer; how it counts up follows V8 |
| `places/v1` | Continents and saved places | To be decided in the plan |
| `view/v1` | The view, as one schema under the rule SYSTEMS is writing for every protocol: a JSON Schema with its version string, pinned fixtures, a check in `scripts/check.sh`, and a rule for when it becomes v2 | Drafted 9 Nov (`contracts/`), for META's review before code |

## Milestones

Each ends when Elco has judged it by hand.

1. **The spec.** Done when Elco has read this and the open questions below are answered or parked.
2. **The bench, `/lab/map`.** Done when Elco can start from every flower the night's run saved, on their continents, and zoom without a break into ENS delegates, then into one delegate's petal. The road to Uniswap delegates should fan into the accounts they share, held at about 60 frames a second on Elco's Mac.
3. **The one look.** Done when the landing tiles, the lobby, the gallery and a flower's page draw the `/make` flower, and no page draws the bars.
4. **Onto pages,** one at a time, each with Elco's go and Elco's words.

## Open, for Elco

- **Where places are saved.** Lean: for the bench, a file worked out from the relations index and checked, like the brain's index; a stored, versioned record on the server once the map is on pages.
- **What a flower looks like far away.** A silhouette of its real shape (today's far row) or a simpler mark sized by its members. Lean: its real silhouette, so a flower is recognisable from far.
- **The look, V1 to V8** (`004-workspace/visual-protocol.md`). Lean: V3 (colour) and V5 (lines inside a flower) first.

## Rough edges

Notes to address later, not blockers.

- Many groups have raw names, such as "SPL holders rndr…HBof".
- The index's main list holds 207 of 686 groups; NEAR's 437 per-pool groups are left out, so NEAR shows two flowers.
- Most flowers have no road yet. They'll sit at the edge of their continent.
- A flower draws its top holders and "everyone else", so a road fans only into the shared accounts that have petals; the rest go to "everyone else".
- A composed view may be counted twice in the index (SYSTEMS, untested).
- Links guessed across chains (the same EVM address on two chains) aren't drawn; they could become routes over the sea, Elco's call.
- A flower's top petals often share few accounts with its neighbours' (ENS and Uniswap delegates: none of 60), so most of a fan runs between "everyone else" petals.
- A continent grows when flowers join it, and could grow into its neighbour; that isn't handled yet.
- A name sits under a flower's full reach, so under a flower with short petals it floats low.
- Faraway roads still cross the view when zoomed into one continent.
- An opened petal looks bigger than its share (5 Nov, the continuous crossing).
- Performance on a cheap laptop, in Safari and on touch is unmeasured.

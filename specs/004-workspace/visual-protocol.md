# The visual protocol (W8): options for Elco

**Created**: 2026-11-09, overnight, for Elco's morning
**Status**: Options only. Nothing is chosen or built. Each question has a lean; Elco decides.
**Feeds**: `spec.md`, W8. The data side and the seam are SYSTEMS's, in `005-mapping-brain/spec.md`. What exists today is in `research-primitives.md`.

## What it is

Elco, 9 Nov: "We need 2 different systems that shouldn't block each other - one is the data protocol and the other is "how to make it visual" protocol." And: "right now we don't have color, we don't have texture, we don't have the internal relationships inside the graph."

So there are two protocols, each with its own version:
- **The data protocol (SYSTEMS):** a petal is a dataset. Its measures come in dated layers, each with a name, a unit and a kind: amount, count, share or category. Relations between petals are a layer of their own: from, to, a kind (sent to, delegated to, voted with), a weight and a date.
- **The visual protocol (this file):** how a view turns those layers into a flower. Which channel shows which measure, how relations are drawn inside the flower, and how time shows.

**The seam between them is a list of bindings:** each channel names a measure, such as `height: shares`, `marks: proposals` or `lines: delegated_to`. SYSTEMS's check refuses a binding whose kind doesn't fit. Either side can change without breaking the other: new data needs no new drawing, and a new drawing needs no new data.

## The channels a flower has

Ranked by how accurately people read them. The ranking comes from Bertin, Mackinlay and Munzner (references below); the flower limits are ours.

| Channel | Best for | Takes | Limits in a flower |
|---|---|---|---|
| **Height** (how far a petal reaches) | The main measure | amount, count, share | Already used. Stays true to the reading: no stretching short petals (Elco, 5 Nov) |
| **Order** (where on the ring) | Rank, or grouping | any | Sorted reads as a nautilus; unsorted looks alive but is harder to compare (`flower-language.md`) |
| **Width** (the angle a petal takes) | A second amount, roughly | amount, count | Kept within 1.5 to 3×, or the shape breaks. Read poorly next to height |
| **Marks on the rim** (a dot or tick at each petal's tip) | A count or a yes/no beside the main measure | count, yes/no | Small. Clear only up to about a dozen sizes |
| **A second ring** (a track inside or outside the petals) | A second measure, read as fully as the first | amount, count, share | Busier centre. This is how genome maps carry many measures around one circle (Circos) |
| **Colour, hue** | A few categories, such as the kind of account | category, up to about 6 to 8 | Competes with attention. The calm pass took it out because it read like a spreadsheet |
| **Colour, strength** (light to dark in one hue) | A scale, such as activity | amount, count | Poor for exact values, good for "more or less" |
| **Texture** (hatching, dots, grain) | Two or three states | category, up to about 3 | Ideal for certainty: observed, declared, inferred |
| **Outline** | One yes/no | yes/no | Today: identity proven or not |
| **Bands** (a petal cut into stacked parts) | What a holding is made of | shares within a petal | Exists today, shown on hover. Two units can't share a bar |
| **Lines inside the flower** (petal to petal) | Relations: delegated to, sent to, voted with | a relation layer | A hairball fast. Bundling and showing only on focus are the known fixes (Holten) |
| **The centre** | One number for the whole group | amount, count | Holds the title today |
| **Time** | Change between dates | dated layers | A faint earlier outline, a slider, or flowers side by side |

## Questions for Elco, one at a time

**V1. How many measures can one flower show at once?**
- **A.** One main measure, plus one second measure at most. Lean: a flower stays readable at a glance.
- **B.** As many as the data has, each on its own channel.
- **C.** One per flower, and a second flower beside it for the second measure.

**V2. Where does a second measure go?** This is your live case: proposals per holder next to shares.
- **A. Marks on the rim** (lean): the shape stays a flower, and it reads as "and also this".
- **B. A second ring:** both measures read fully, but the centre gets busy.
- **C. Bands inside each petal:** only when both are parts of the same whole.

**V3. What is colour for?**
- **A. Attention by default** (one accent for what you're pointing at, grey for the rest), **with category as a lens you switch on** (lean): this keeps the calm look and gives colour back on demand.
- **B. Kind of account, always:** person, contract, exchange, DAO. The 5 Nov sketch did this.
- **C. A scale:** one hue from light to dark for a second measure.

**V4. What is texture for?**
- **A. Certainty** (lean): solid for observed in chain data, a light pattern for declared by its subject, a sparser one for inferred. These are the same three kinds claims carry in `003-target`, so the map shows how sure each petal is.
- **B. Your own notes and marks** (W7's private layer).
- **C. Not yet.**

**V5. How do relations inside a flower show?**
- **A. Lines from petal to petal, bundled, only for the petal you focus on** (lean): you see who delegates to whom without a hairball.
- **B. All lines, always, faint.**
- **C. No lines inside. Relations show only between flowers** (W9's force map).

**V6. How does time show?**
- **A. A faint outline of the flower at an earlier date** (lean): one glance shows grew or shrank. The 5 Nov sketch had this.
- **B. A slider that moves the flower through its dated layers.**
- **C. Flowers for each date, side by side.**

**V7. Who chooses the bindings?**
- **A. The agent proposes, the person adjusts in the flower's panel** (lean): as in the 5 Nov sketch's controls, and the choice is saved with the flower.
- **B. Fixed defaults per kind of network,** and the agent never chooses.
- **C. The person only.**

**V8. How does it version?**
- **A. Each flower names its visual protocol version** (`petals-visual/1`), and the renderer can draw older versions (lean). This follows your 5 Nov rule: hash the data, and keep a translator for the rendering so the look can evolve.
- **B. Always the latest look,** with no versions kept.

## Your case, written out

With the leans, a DAO's flower with shares and proposals per holder would be:

```
visual: petals-visual/1
height:  shares            (amount, the main measure)
marks:   proposals         (count, a dot at each tip sized by it)
texture: certainty         (observed / declared / inferred)
colour:  attention         (kind of account as a lens)
lines:   delegated_to      (bundled, on focus)
time:    outline at 30 days ago
```

The agent writes that in one line. The data side checks each name against the petal's layers.

## What W8 needs from SYSTEMS (to agree)

1. **Channel names in the seam,** from this file: height, width, order, marks, ring, colour, texture, outline, bands, lines, centre, time.
2. **The kind of each measure,** which SYSTEMS already has: amount, count, share, category, yes/no.
3. **A certainty on each petal,** observed, declared or inferred, if texture is to show it (V4).
4. **Dated layers,** for time (V6), which SYSTEMS already plans.

## References worth a look

- **Bertin, *Semiology of Graphics* (1967).** The original list of visual variables: position, size, value, texture, colour, orientation, shape. Where "texture" as a channel comes from.
- **Mackinlay, "Automating the Design of Graphical Presentations" (1986).** Ranks channels by how accurately people read them, separately for amounts, ordered values and categories.
- **Munzner, *Visualization Analysis and Design* (2014), chapter 5.** The modern summary of that ranking: channels for magnitudes versus channels for identity.
- **Vega-Lite, encodings** (https://vega.github.io/vega-lite/docs/encoding.html). A real grammar where a view is a list of channel-to-field bindings with types. This is the closest working model for our seam.
- **Circos** (http://circos.ca). Genome maps: many measures as concentric tracks around one circle, with links drawn inside. The nearest relative of "a second ring" and "lines inside".
- **Holten, "Hierarchical Edge Bundles" (2006).** Why links inside a circle become a hairball, and how bundling fixes it.
- **Nightingale's rose diagram (1858).** The first famous radial chart where a wedge's reach carries the measure, which is our flower's ancestor.
- **Our own 5 Nov sketch,** `research/spikes/flower/index.html`, opened straight from the folder. It has colour, outlines, inner lines and a comparison of two dates, all switchable.

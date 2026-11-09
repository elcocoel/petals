# Contract: the view (`view/v1`), how data becomes a flower

**Version**: view/v1 | **Owner**: LOOK | **Status**: reviewed by META, 9 Nov; built on `m-face/fe-view`, which merges once SYSTEMS's typed seam is on `main`. Built under the rule SYSTEMS is writing for every protocol: a JSON Schema with its version string, pinned fixtures, a check, and a rule for v2. Where SYSTEMS's rule lands differently, this follows it.
**Schema draft**: `view-v1.schema.json`, next to this file.

## Elco's words (9 Nov, through META)

> the user will be able to switch what the primitives mean - the data doesn't have to know how it's being shown, the rendering doesn't need to care what data is living in which dimension - so the user can have color mean type of wallet OR maybe, last active, or or or ... in the end it will be handful of dimensions that can be swapped around ... we just have to get organized

> Agent proposes, person adjusts, settings are global (i.e. however the user had it, all petals are shown in that setup - there will be a default and settings in the lobby, maybe it won't be a free for all but a few modes - we have to earn this level of prototyping by getting the systems in place)

> Always the latest look.

> no second look - one first look that we improve on

Words, with Elco: **data** or **a piece of data** (not "measure"), and **dimensions** for the visual primitives.

## What it is

A **view** says which piece of data each dimension shows. That's all it holds.

- **The data doesn't know how it's shown.** A flower's data (005's layers, through the seam) lists its pieces of data, each with a name and a kind. Nothing in it names a dimension.
- **The look doesn't know what data it shows.** It draws a reading: per petal, a value for each dimension, already worked out (`reading/v1` holds these today: `height`, `width`, `colour`, `outline`, `segments`). It never sees a data name.
- **The view joins the two.** For each dimension in use, it names one piece of data. Any piece of data of a fitting kind can go in any dimension that accepts its kind.
- **One view per person, for every flower.** However the person has it set, every flower they look at is drawn that way, theirs and everyone else's. Everyone who hasn't set one sees the default.
- **The agent proposes, the person adjusts.** The agent's proposal is a view, or a change to one; the person takes it or changes it. The place to change it is the lobby's settings, which come later. "A few modes" may replace a free choice; that's for later too.
- **Always the latest look.** The look improves by versions, and every flower is drawn by the latest. No older look is kept drawable. A published flower stays the same flower, because its id leaves the drawing out.

## The dimensions: a handful, fixed

The nine in today's vocabulary (`packages/core/src/primitives.ts`, `spec/v1`'s channel slots), with the kinds each accepts. 005's kinds of data: amount, count, share, category, flag (yes or no). Two more are needed here, for SYSTEMS to agree: **parts** (a petal cut into what it's made of, as backers are today) and **relation** (petal to petal, 005's relations layer).

| Dimension | Accepts | Drawn by the look today |
|---|---|---|
| **height** (how far a petal reaches) | amount, count, share | Yes |
| **width** (the angle a petal takes, kept within 1.5x to 3x) | amount, count, share | Yes |
| **order** (where on the ring) | amount, count, share, category | Yes, largest first only |
| **colour** | category (up to about 8), or amount, count or share as a scale | Not yet: the calm pass made the live flower grey |
| **outline** | flag, or a category of up to 3 | Not yet on the live flower |
| **texture** | flag, or a category of up to 3 | Not yet |
| **markings** (a mark at each petal's tip) | count, flag | Not yet |
| **segments** (bands inside a petal) | parts | Yes, on the focused petal |
| **lines** (petal to petal inside a flower) | relation | Not yet |

A dimension the look doesn't draw yet is declared, never imitated, as today (`primitives.ts`): it shows nothing, and the legend leaves it out.

## Pieces of data a view can name

- **On every flower, from the reading:** `share` (share), `amount` (amount), `kind` (category: the kind of account), `identity` (category: verified, self-declared, inferred, or none).
- **On some flowers:** `backers` (parts; NEAR pools today).
- **Anything a layer adds,** by its own name, or `<layer>:<name>` when two layers use the same name (005's seam).

**When a flower doesn't have that piece of data, or has it as a kind the dimension doesn't accept, that dimension shows nothing on that flower.** A missing fact shows nothing (`design/frontend-foundation.md`, Fire's rule 5). There's no fallback.

## The document

```json
{
  "petal": "view/v1",
  "dimensions": {
    "height": { "data": "share", "scale": "sqrt" },
    "width": { "data": "share", "scale": "log", "max_ratio": 2 },
    "order": { "data": "share" },
    "colour": { "data": "kind" },
    "outline": { "data": "identity" },
    "texture": null,
    "markings": null,
    "segments": { "data": "backers" },
    "lines": null
  }
}
```

That's the **default**: today's `default/v1` choices, written as a view. `null` means the dimension isn't in use. `scale` and `max_ratio` keep `spec/v1`'s meanings. A view names its data only; the legend's words come from the data's own label and unit, so a view brings no words of its own. Who set a view is kept by whoever stores it, outside the document, the way 005 keeps a layer's author.

**Elco's live case** (proposals per holder next to their holdings) is the default with one change: `"markings": { "data": "proposals" }`. Every flower whose data has `proposals` as a count shows it; the others show no marks.

## The rule for v2

- **It stays `view/v1`** while a change keeps every v1 document valid, with the same meaning: an optional field that old readers can ignore, or a kind that a dimension now accepts.
- **It becomes `view/v2`** when a dimension is added, removed or renamed, or a field changes meaning.
- **Old documents stay readable:** v2 comes with a written upgrade from v1 (for example, a new dimension starts not in use). Nothing is rewritten in place.
- **The look's version is separate:** the look improves and is always the latest; the view's format changes only by this rule.

## Fixtures and checks

- `fixtures/views/default.view.json`, and `fixtures/views/proposals.view.json` (Elco's case), each with its sha256 pinned in a test.
- Every fixture is checked against the schema, as part of the tests that `scripts/check.sh` runs.
- A test holds the table above: each dimension accepts exactly its kinds.
- A test holds that the look draws only what it declares, and the legend lists exactly what's drawn.

## The seam this changes (to agree with SYSTEMS and META)

Today a flower's spec carries its own encodings, and the agent chooses them for each flower (`propose_spec`, `spec/v1`). With one view per person, the view decides how every flower is drawn. The lean:

1. **`spec/v1` keeps its encodings,** as the record of what the agent proposed when it made the flower. Old flowers and their hashes don't change.
2. **Drawing reads the viewer's view** (the default for anyone without one), and `reading/v1` takes its choices from it instead of from the spec.
3. **`propose_spec`'s choices become the agent's proposal for the person's view.**

Kinds on every piece of data are what make this work, so it waits on `seam/v1` carrying each piece's kind (SYSTEMS's step 2 in `coordinator/systems-check-2026-11-09.md`). "Last active" for colour, Elco's example, needs a kind for dates that 005 doesn't have yet.

## Not in v1

The lobby's settings, modes, storing a person's view on the server, and the agent's tool for proposing one all come later. v1 is the format, the default, the fixtures and the checks.

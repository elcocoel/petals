# Contract: the view (`view/v2`), how data becomes a flower

**Version**: view/v2 since 11 Nov (labels; see "view/v2" below), view/v3 since 12 Nov for a person who chooses colour's keys (see "view/v3" below), view/v1 still read | **Owner**: the look | **Status**: v1, v2 and v3 in use. Built under `specs/protocols.md`, the one rule for every format.
**Schemas**: `view-v1.schema.json` and `view-v2.schema.json`, next to this file.

Words: **data** or **a piece of data** (not "measure"), and **dimensions** for the visual primitives.

## What it is

A **view** says which piece of data each dimension shows. That's all it holds.

- **The data doesn't know how it's shown.** A flower's data (005's layers, through the seam) lists its pieces of data, each with a name and a kind. Nothing in it names a dimension.
- **The look doesn't know what data it shows.** It draws a reading: per petal, a value for each dimension, already worked out (`reading/v1` holds these today: `height`, `width`, `colour`, `outline`, `segments`). It never sees a data name.
- **The view joins the two.** For each dimension in use, it names one piece of data. Any piece of data of a fitting kind can go in any dimension that accepts its kind.
- **One view per person, for every flower.** However the person has it set, every flower they look at is drawn that way, theirs and everyone else's. Everyone who hasn't set one sees the default.
- **The agent proposes, the person adjusts.** The agent's proposal is a view, or a change to one; the person takes it or changes it. The place to change it is the lobby's settings, which come later. A few modes may replace a free choice; that's for later too.
- **Always the latest look.** The look improves by versions, and every flower is drawn by the latest. No older look is kept drawable. A published flower stays the same flower, because its id leaves the drawing out.

## The dimensions: a handful, fixed

The nine in today's vocabulary (`packages/core/src/primitives.ts`, `spec/v1`'s channel slots), with the kinds each accepts. 005's kinds of data: amount, count, share, category, flag (yes or no). Two more are needed here, from the data side: **parts** (a petal cut into what it's made of, as backers are today) and **relation** (petal to petal, 005's relations layer).

| Dimension | Accepts | Drawn by the look today |
|---|---|---|
| **height** (how far a petal reaches) | amount, count, share | Yes |
| **width** (the angle a petal takes, kept within 1.5x to 3x) | amount, count, share | Yes |
| **order** (where on the ring) | amount, count, share, category, date | Yes: largest first (share, the default), a date newest first, a count or amount most first, a category its commonest value first (such as last active, most active); a petal with no value after those with one, everyone else last |
| **colour** | category (up to about 8); amount, count or share as a scale once the look draws one | Yes, a category: five keys, ranked once over a whole map so a value has one colour everywhere; 'never voted' and a missing value grey |
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

**When a flower doesn't have that piece of data, or has it as a kind the dimension doesn't accept, that dimension shows nothing on that flower.** A missing fact shows nothing. There's no fallback.

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
    "segments": null,
    "lines": null
  }
}
```

That's the **default**: today's `default/v1` choices, written as a view. `null` means the dimension isn't in use. `scale` and `max_ratio` keep `spec/v1`'s meanings. A view names its data only; the legend's words come from the data's own label and unit, so a view brings no words of its own. Who set a view is kept by whoever stores it, outside the document, the way 005 keeps a layer's author.

**A live case** (proposals per holder next to their holdings) is the default with one change: `"markings": { "data": "proposals" }`. Every flower whose data has `proposals` as a count shows it; the others show no marks.

## The rule for v2

It follows `specs/protocols.md`, the one rule for every format:

- **It becomes `view/v2`** when a change would make a valid v1 view invalid, change what a field means, or change a v1 view's hash. A view refuses fields it doesn't know, so a new field, or a dimension added, removed or renamed, is a new version.
- **It stays `view/v1`** when a dimension starts accepting another kind of data: every v1 view stays valid and means the same; a flower may simply show more.
- **Old views stay readable:** v1's schema, fixtures and pins stay, a reader picks by the `petal` field, and nothing is rewritten in place.
- **The look's version is separate:** the look improves and is always the latest; the view's format changes only by this rule.

## Fixtures and checks

- `packages/core/schema/fixtures/view.v1.json` (the default) and `view.v1.proposals.json` (the proposals case), pinned in `packages/core/schema/pins.json`.
- `scripts/check-protocols.ts`, run by `scripts/check.sh`, checks both against the schema and their pins.
- A test holds the table above: each dimension accepts exactly its kinds.
- A test holds that the look draws only what it declares, and the legend lists exactly what's drawn.

## The seam this changes

Today a flower's spec carries its own encodings, and the agent chooses them for each flower (`propose_spec`, `spec/v1`). With one view per person, the view decides how every flower is drawn. The lean:

1. **`spec/v1` keeps its encodings,** as the record of what the agent proposed when it made the flower. Old flowers and their hashes don't change.
2. **Drawing reads the viewer's view** (the default for anyone without one), and `reading/v1` takes its choices from it instead of from the spec.
3. **`propose_spec`'s choices become the agent's proposal for the person's view.**

Kinds on every piece of data are what make this work, so it waits on `seam/v1` carrying each piece's kind. "Last active" for colour, for example, needs a kind for dates that 005 doesn't have yet.

## view/v2: labels (11 Nov)

A person and the agent can add many annotations. A person's annotations name accounts, and the names are data like any other, so they reach a petal through the view.

- **A tenth dimension, `labels`:** which piece of data names each petal. It accepts a **category**. A new dimension is a new version, by the rule above.
- **What each choice shows:**
  - `identity`: the identity's name, unless it's only inferred, else the short address. That's every petal's name before v2.
  - `kind`: the kind of account.
  - Any other category, such as `name` from a person's annotations (`seam.ts`, `namePieces`): its value for that account.
  - None, or no value for that account: the petal's own label, its short address. No claim, no name.
  - The tail ("everyone else") keeps its own label whatever labels show.
- **Long names** are cut at 24 characters with "…" on the flower, and shown whole where they're pointed at.
- **The default** is v1's with `"labels": { "data": "identity" }` (`view.v2.json`). It draws exactly what v1's default draws. It has a new hash, and v1's default hash and its 12-character alias still mean the default.
- **A view/v1 reads as v2** with labels on identity (core's `latestView`), and keeps its own hash. A person's next choice in Settings writes v2. Nothing is rewritten in place.
- **Names from annotations** are two pieces, `name` and `name_kind` (declared, stated, sourced or inferred). The strongest word is sourced, never verified.
- **No fixed meaning for how data looks:** no piece of data has a hard-coded visual form; outlines are being designed and could mean different things, like every other visual behaviour. Outline, like any dimension, can take `name_kind` as a category, but how a category is drawn stays undecided until the look work designs it, the same for every dimension. Until then a choice the look can't draw shows nothing, and the legend leaves it out.
- **Fixtures:** `view.v2.json` (the default) and `view.v2.names.json` (labels on `name`, outline on `name_kind`), pinned.
- **Who composes:** names are the person's own, so whoever draws for a signed-in person passes their named claims through `namePieces` to the reading (`readFlower`'s `pieces`, `renderFlower`'s option `pieces`). A visitor gets none, so every petal keeps its short address under labels on `name`.

## Not in v1

The lobby's settings, modes, storing a person's view on the server, and the agent's tool for proposing one all come later. v1 is the format, the default, the fixtures and the checks.

## view/v3: colour's keys (12 Nov)

A person chooses which colour a value gets. `view/v3` is `view/v2` with one optional field on colour, `keys`: `{ [value]: 'mint' | 'blue' | 'coral' | 'apricot' | 'pink' | 'grey' }`, the key each named value of colour's piece of data takes, as the person chose it. A value not named there takes its key as before. Nothing else changes, so a v2 view is a v3 view with no keys chosen, and the default stays `view/v2` with its hash: core's `withColourKeys` writes a v3 only while a key is chosen and gives back the v2 when the last one goes. The schema is `view-v3.schema.json`, its fixture `view.v3.json`.

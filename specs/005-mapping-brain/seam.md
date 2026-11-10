# The seam between the data protocol and the visual protocol

The seam is thin on purpose. Each side improves and versions on its own, and only what's listed here crosses.

- **The data side:** `data.md`, led by SYSTEMS.
- **The visual side:** how a view turns measures into a flower (channels, encodings, relations, time). It's LOOK's, with Elco (W8).

## From data to visual: the view input

One read-only table, made from a chosen set of layers. Its version is `seam/v1`.

| Part | What it holds |
|---|---|
| `about` | The address the dataset is about |
| `layers` | The layer hashes it was made from: the dataset's version |
| `participants` | Their ids (`chain:address`). Nothing about who they are |
| `measures` | Each with a name, a unit, a kind (amount, count, share, category or flag, a yes or no), its date, its standing (verified, inferred or lead), and the layer it came from. Then a value per participant, or empty |
| `relations` | Each line with from, to, a kind, a weight, a unit, its date, its standing and its layer |
| `dates` | Every date at which a measure exists, for change over time |
| `coverage` | How many participants and how much of the total are included, so a view can say what's missing |

What it never holds: leads that aren't the viewer's own, anything about drawing, or anything about the person viewing.

### As built, 9 Nov: the document

`seam/v1` is a JSON Schema at `packages/core/schema/seam.schema.json` (`urn:petal:schema:seam:v1`), made by core's `seamOf` and handed over by `compose_view`, under `specs/protocols.md`:

- `about`, `layers` (the reading first, then each layer, by hash), `participants`, `dates`, `coverage` as above;
- `data`: each **piece of data** with its `name`, `kind`, `unit`, `standing`, the `layer` it came from and its `as_of`, then `values` (one per participant), `parts` (for `parts`: a petal cut into what it's made of) or `lines` (for `relation`: petal to petal). Relations are pieces of kind `relation`, so one list holds everything a view can name.
- **The kinds:** amount, count, share, category, flag (a yes or no), date, parts and relation (`DATA_KINDS`). The look's `DataKind` is the same list.
- **From every reading:** each of its holdings by its own name, as an amount; `amount` (its main data) and `share` (of that), computed here so the look never computes; `kind` and `identity` (categories; identity is verified, self-declared, inferred or none); and `backers` (parts, from its delegations) where it has them. These names are the reading's: a layer can't use them.
- **About the same address:** a reading is about its chain and the address it was asked for (`dao`, `token`, `mint`, `contract`, `address`, `account`), or its chain and population when it reads a whole network. Every layer, and every added reading, must be about the same, or compose refuses.
- **Not yet:** a reader's own data is all `amount` until readers say each piece's kind (a count of blocks reads as an amount today).

## From visual to data: references only

A view (what a flower's spec becomes) names three things:
- the address;
- the layer hashes it uses;
- for each channel, a measure or relation **by name**: `height: shares`, `marking: proposals`, `lines: delegated_to`.

If two layers give the same name, it's written `<layer>:<name>`. The visual side never writes data, and never asks the data side to compute anything at drawing time.

## The one rule both sides share

**The measure kinds are the contract.** The visual side decides which channel takes which kind: height takes an amount or a count, colour a category, a marking a count or a flag. The data side promises that every measure carries one of these kinds. Adding a kind is a change to the seam, `seam/v2`, and both sides agree it.

## What each side changes alone

| Changed alone by the data side | Changed alone by the visual side |
|---|---|
| A new recipe or reader shape, a new measure under an existing kind, new chains, forks and versions, where layers are stored | A new channel, a new encoding or scale, texture, how time is shown, the canvas, legends |

**Reproducible:** a flower is the view input (named by its layer hashes) plus the view plus the renderer's version. The same three draw the same flower. ("Recipe" in `data.md` means a reader's recipe, on the data side.)

## Today's code, on either side

| Today | Side |
|---|---|
| `snapshot/v1`, readers (shapes and recipes), `get_snapshot`, `compute_figures`, the relations index | Data |
| `spec/v1`'s `encodings`, `propose_spec`, `validate_spec`, `render_flower`, the canvas | Visual |
| `spec/v1`'s `snapshot` and `network` fields | The seam: they become the address and the layer hashes |
| `m:<measure>` | The seam's measure by name, for any measure of any chosen layer |

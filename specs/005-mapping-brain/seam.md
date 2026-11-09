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
| `measures` | Each with a name, a unit, a kind (amount, count, share, category or yes-no), its date, its standing (verified, inferred or lead), and the layer it came from. Then a value per participant, or empty |
| `relations` | Each line with from, to, a kind, a weight, a unit, its date, its standing and its layer |
| `dates` | Every date at which a measure exists, for change over time |
| `coverage` | How many participants and how much of the total are included, so a view can say what's missing |

What it never holds: leads that aren't the viewer's own, anything about drawing, or anything about the person viewing.

## From visual to data: references only

A view (a flower's recipe) names three things:
- the address;
- the layer hashes it uses;
- for each channel, a measure or relation **by name**: `height: shares`, `marking: proposals`, `lines: delegated_to`.

If two layers give the same name, it's written `<layer>:<name>`. The visual side never writes data, and never asks the data side to compute anything at drawing time.

## The one rule both sides share

**The measure kinds are the contract.** The visual side decides which channel takes which kind: height takes an amount or a count, colour a category, a marking a count or a yes-no. The data side promises that every measure carries one of these kinds. Adding a kind is a change to the seam, `seam/v2`, and both sides agree it.

## What each side changes alone

| Changed alone by the data side | Changed alone by the visual side |
|---|---|
| A new reader, a new measure under an existing kind, new chains, a new layer format inside, where layers are stored | A new channel, a new encoding or scale, texture, how time is shown, the canvas, legends |

**Reproducible:** a flower is the view input (named by its layer hashes) plus the recipe plus the renderer's version. The same three draw the same flower.

## Today's code, on either side

| Today | Side |
|---|---|
| `snapshot/v1`, readers, `get_snapshot`, `compute_figures`, the relations index | Data |
| `spec/v1`'s `encodings`, `propose_spec`, `validate_spec`, `render_flower`, the canvas | Visual |
| `spec/v1`'s `snapshot` and `network` fields | The seam: they become the address and the layer hashes |
| `m:<measure>` | The seam's measure by name, for any measure of any chosen layer |

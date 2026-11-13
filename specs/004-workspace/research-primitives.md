# Research: the flower's visual primitives (W8)

**Created**: 2026-11-09
**Feeds**: `spec.md`, W8. Options only.

## What exists

- **The spec names nine channels** (`packages/core/src/types/index.ts`, `PrimitiveId`): width, height, colour, outline, segments, lines, markings, order, texture. An agent's choices today: width (`r1.5`, `r2`, `r3`, `equal`), height (`sqrt`, `linear`, `log`, `equal`, or a measure `m:<name>`), colour (`kind`, `identity`, `single`), outline (`identity_status`, `none`), segments (`backers`, `time`, `ops`, `roles`), lines, markings (`fusion`), order. Texture has no encoding.
- **The 5 Nov sketch** switches width, height, colour, outline, segments, inner lines, fusions, labels, and a comparison of two dates.
- **The live canvas** (`apps/web/flower/`) draws height, width and order, and a petal's bands on hover, all in grey since the calm pass.

## The data side, 9 Nov (`005-mapping-brain/spec.md`, "How a flower points at layers")

1. **A petal's measures come in layers:** each named, with a unit, a kind (amount, count, share, category) and the layer's date. Change over time is the same measure in several dated layers; a series inside one layer is kept in reserve for counts per period.
2. **Relations are a layer too:** lines from, to, a kind (sent to, delegated to, voted with, sponsored), a weight and a date, with the same author, method and hash as any layer. A flower's lines name one.
3. **Each channel names a measure:** `height: shares`, `marking: proposals`, `lines: delegated_to`, written `<layer>:<measure>` when two layers share a name. The check refuses a mismatch: height and width take amounts or counts, colour a category or a scale, a marking a count or yes/no. It generalises today's `m:<measure>`.

## The live case: proposals per holder next to shares

Three channels fit:
- **A mark at each petal's tip,** sized by its count. Keeps the polygon; reads as "and also".
- **Bands inside the petal.** Keeps one shape; mixes two units in one bar unless they share one.
- **A second, inner ring:** shares outward, proposals inward. Two full readings, one shape; the centre gets busy.

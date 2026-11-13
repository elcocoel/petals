# Contract: the renderer

**Version**: render/v1, reading/v1 | **Owner**: workstream W1 (Core) | **Consumers**: tools (`render_flower`), web, golden tests

A pure function. Same spec and same snapshot give the same SVG bytes, on any machine running Node 24 (FR-010, SC-005).

`renderFlower` is three steps: validate, `readFlower` (the facts, no pixels), then a named skin (`SKINS['render/v1']`, the look). The look can change without the reading changing; see [The reading](#the-reading).

```ts
// packages/core/src/render/index.ts
export function renderFlower(
  spec: Spec,
  snapshot: Snapshot,
  options?: { size?: number /* default 800 */ ; thumb?: boolean }
): { svg: string; legend: LegendItem[]; petals: PetalDetail[]; render_sha256: string };
```

The renderer does not fetch, read the clock, use randomness, read the DOM or depend on locale. It never changes the spec. It refuses a spec that `validateSpec` rejects, and it never draws a primitive that `PRIMITIVES` marks `unavailable` in this build (FR-032): an unbuilt primitive is declared unavailable, never imitated.

## The reading

```ts
// packages/core/src/reading/index.ts
export function readFlower(spec: Spec, snapshot: Snapshot): Reading;   // a spec validateSpec accepted
export function readingHash(reading: Reading): string;                 // sha256 of the canonical reading
```

A `Reading` holds all a drawing needs and no pixels: no coordinate, CSS class or colour. `reading/` imports nothing from `render/`.

```ts
type Reading = {
  petal: 'reading/v1';
  spec_sha256: string;
  title: string;
  chain: string;                  // CAIP-2: with a petal's id, which account this is
  encodings: Spec['encodings'];   // what drives each primitive and what it means, as the spec says
  petals: ReadingPetal[];         // in drawing order, the tail last
  legend: ReadingLegendItem[];    // every primitive used, then the tail
  details: PetalDetail[];         // why each petal looks the way it does (FR-012)
};

type ReadingPetal = PetalRow & {  // index, id, label, kind, identity, amount, share, rank, tail?, count?
  name: string;                   // what a label calls it: the identity's name, unless only inferred
  width: number;                  // the width encoding: a factor in [1, max_ratio]
  height: number;                 // the height encoding: [0.03, 1], unrounded; a bar never vanishes
  colour: string;                 // a kind, 'named', 'anonymous' or 'single'; 'tail' for the tail
  outline: 'asserted' | 'inferred' | null;  // asserted: self-declared or verified
  segments: Segment[];            // bottom to top, as fractions of the bar; [] when not split
};

type ReadingLegendItem = {
  primitive: LegendItem['primitive'];
  meaning: string;
  sources: string[];
  keys?: { key: string; label: string }[];  // what a key stands for; the skin adds its swatch
};
```

A petal's `id` is the snapshot's account id, untouched, so the same account in two readings on one `chain` has the same `id`. That keeps a later level free to draw relations between flowers. `__tail` (`tail: true`) and `kind: 'group'` rows are folded rows, not accounts.

A skin is `(reading, { size, thumb }) => { svg, legend, petals }`. It reads nothing else: no spec, no snapshot. Polygon, bars, labels, swatches and the words `solid:` and `dashed:` on legend keys are `render/v1`'s. Geometry below is that skin's.

**Known leak, on purpose:** the words in `details` and the tail's legend line name the `render/v1` look in places ("hatched", "solid", "side"), as `spec.encodings` meanings do. A later skin returns its own `legend` and `petals`, so it can say otherwise; the reading is reworded as `reading/v2` when a second skin exists.

## Geometry (ported from the flower spike's `draw()`)

Port the geometry only, not the page or its controls.

- **Polygon**: one side per petal, inner radius `r0 = 0.32 R`. Petals run clockwise from twelve o'clock in the order `encodings.order.by` names (`default/v1`: `measure_desc`, "largest first, clockwise from the top").
- **Side length (width)**: log share mapped onto `[1, max_ratio]`, so the widest side is at most `max_ratio` times the narrowest (default 2, never more than 3). `equal` gives every side the same length. A side wider than 0.9π, and the grouped tail, are split into several sub-sides of at most 0.45 rad, so the polygon stays closed and reads as one flower.
- **Gaps**: a gap of 1.1 px (0.5 px in thumbnails) between petals, capped at 22% of the side.
- **Bars (height)**: each bar stands straight out along the side's normal. Height is `clamp(h, 0.03, 1) × (R − r0)`, with `h` from the height encoding (`sqrt` share / max share, `linear`, `log` amount between min and max, `m:<metric>`, `equal` = 0.82).
- **Segments**: a bar is a stack of bands between heights `h0` and `h1` (parallelograms on each sub-side). `backers` order: other delegators, accounts with 1M+ NEAR, liquid-staking contracts, lockups. A 0.9 px cut separates segments.
- **Outline**: solid stroke for self-declared or verified identity, dashed `3 2` for inferred, none for unknown.
- **Tail**: drawn with the hatch pattern and labelled with its count and share.
- **Lines and markings** (Phase B): inner lines from the side midpoints, 3 px inside the polygon; fusion dots 7 px inside, joined by a dashed line.
- **Straight edges only**: no curves, no rounded petals (constitution I).

## Determinism rules

- Coordinates are written with `toFixed(2)`; widths and opacities with `toFixed(2)`.
- Elements are emitted in a fixed order: `<style>`, `<defs>`, polygon, lines, bars (by petal order, then segment order), outlines, markings, labels.
- Ids are derived from the spec (`p-<index>`, `s-<index>-<segment>`), never random.
- Colours are CSS custom properties (`var(--k-pool)`), defined in an embedded `<style>` with a light set and a `.petal-dark` override. Theme is chosen by the host page with a class, so both themes share the same bytes.
- No text measurement. Label placement uses a fixed character-width estimate.
- `render_sha256` is SHA-256 of the UTF-8 SVG bytes.

## SVG structure (what the web relies on)

- Root: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" role="img" aria-label="{title}" data-petal="render/v1" data-spec="{spec_sha256}">`.
- Each bar segment: `<path class="petal-seg" data-p="{participant id}" data-i="{petal index}" data-seg="{segment key}" d="…"/>`. The web attaches hover and click by delegation on `data-p`. No script inside the SVG.
- The tail: `data-p="__tail"`.

## Legend and petal details

```ts
type LegendItem = {
  primitive: 'width' | 'height' | 'colour' | 'outline' | 'segments' | 'lines' | 'markings' | 'order' | 'tail';
  meaning: string;            // from the spec
  sources: string[];          // source ids
  keys?: { swatch: string /* css var */; label: string }[];  // e.g. colour by kind, segment classes
};

type PetalDetail = {
  index: number; id: string; label: string; kind: string;
  identity: { name: string; source: string; status: 'self-declared' | 'verified' | 'inferred' } | null;
  amount: string; share: number; rank: number;
  values: { primitive: string; value: string | number; explains: string }[];   // why it looks this way (FR-012)
  segments?: { key: string; label: string; amount: string; frac: number }[];
  interactions?: { type: string; with: string; amount?: string }[];         // Phase B
  count?: number;             // tail only
};
```

Every primitive used appears in `legend` (FR-011). `legend` and `petals` are part of the render result, so the web never re-derives them.

## Golden tests (SC-005)

- `fixtures/golden/<name>.reading.json` locks the reading (T179), so a later skin can change the drawing while the reading stays put.
- `fixtures/golden/<name>.svg` plus `<name>.json` (legend and petals) for: NEAR validators default, NEAR validators `segments=backers`, House of Stake default, a 2-participant flower (`petals` is a cap of 5–300, so two participants give two petals and no tail; each side is split into sub-sides so the polygon stays closed), a 1,000-participant flower with the tail grouped (SC-006), and a thumbnail.
- The test renders each and compares bytes. Updating a golden file is a reviewed change (`pnpm golden:update` writes them; the diff is checked by a person).
- A second test renders each twice in one process and once in a fresh process, and compares hashes.

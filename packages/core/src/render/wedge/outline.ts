// The outline, as the look draws it (annotation-layer.md, step 7; for /lab first, Elco's (b), 11 Nov). The
// view binds outline to a piece of data, a category; this gives each value of it a line round its petals.
// No value has a line of its own (Elco, 11 Nov: "dont give data hard coded use of visual manifestations"):
// the lines go to the values in the order they first appear round the flower, largest petal first, and the
// key says which is which. A category of up to three values (view.md, "The dimensions"); a value past the
// third, and a petal with none, draw no line. Pure.

/** The lines an outline can draw, as SVG dash patterns: continuous, dashed, dotted. */
export const OUTLINE_LINES: readonly string[] = ['', '5 3', '1 3'];

export interface OutlineKey {
  /** the category's value, as the data says it */
  value: string;
  /** its line, as an SVG dash pattern ('' is continuous) */
  dash: string;
}

export interface Outlines {
  /** each petal's line, by its id; a petal that has none isn't here */
  byId: Record<string, string>;
  /** the values drawn, in the order their lines were given */
  keys: OutlineKey[];
}

/** Each petal's line, for its value of the category the outline shows; petals in the flower's order. */
export function outlinesOf(
  petals: readonly { id: string; tail?: boolean | undefined }[],
  valueAt: (id: string) => string | null | undefined,
): Outlines {
  const keys: OutlineKey[] = [];
  const byId: Record<string, string> = {};
  for (const p of petals) {
    if (p.tail) continue;
    const value = valueAt(p.id);
    if (value === null || value === undefined) continue;
    let key = keys.find((k) => k.value === value);
    if (!key && keys.length < OUTLINE_LINES.length) {
      key = { value, dash: OUTLINE_LINES[keys.length] as string };
      keys.push(key);
    }
    if (key) byId[p.id] = key.dash;
  }
  return { byId, keys };
}

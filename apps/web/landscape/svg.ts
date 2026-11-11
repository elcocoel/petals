// The map's SVG hands (specs/006-the-map): an element made with its attributes, and a slot that writes an
// attribute only when it changed. Shared by the scene (scene.ts) and its names (labels.ts).
const NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number>;

export function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  parent?.appendChild(node);
  return node;
}

/** Writes an attribute only when it changed. */
export class Slot<E extends SVGElement> {
  node: E;
  private last = new Map<string, string>();
  constructor(node: E) {
    this.node = node;
  }
  set(name: string, value: string | number): void {
    const s = String(value);
    if (this.last.get(name) === s) return;
    this.last.set(name, s);
    this.node.setAttribute(name, s);
  }
  show(on: boolean): void {
    this.set('display', on ? 'inline' : 'none');
  }
}

export const slot = <E extends SVGElement>(node: E) => new Slot(node);

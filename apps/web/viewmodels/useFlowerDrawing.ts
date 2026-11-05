// A flower's SVG in the page. The SVG is parsed and cleaned before it enters, because /draft?spec=
// renders specs from anyone's link: scripts, foreignObject, event attributes and outside links are
// dropped. Used by the flower on its own page and by the flower on a stage.
import { useEffect, useRef, useState } from 'react';

const DROP = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed', 'image', 'a']);

function cleanSvg(text: string): SVGSVGElement | null {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.localName !== 'svg' || doc.getElementsByTagName('parsererror').length) return null;
  for (const el of [svg, ...Array.from(svg.querySelectorAll('*'))]) {
    if (DROP.has(el.localName.toLowerCase())) {
      el.remove();
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const outside = (name === 'href' || name.endsWith(':href')) && !attr.value.startsWith('#');
      if (name.startsWith('on') || outside) el.removeAttribute(attr.name);
    }
  }
  return document.importNode(svg, true) as unknown as SVGSVGElement;
}

export function useFlowerDrawing<T extends Element>(
  svg: string,
  selected: string | null,
  /** Inside a stage's world: the drawing keeps its own size instead of filling its box. */
  o: { inWorld?: boolean } = {},
) {
  const host = useRef<T>(null);
  const [broken, setBroken] = useState(false);
  const inWorld = o.inWorld ?? false;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const node = cleanSvg(svg);
    setBroken(!node);
    if (node && inWorld) {
      const [, , width = '0', height = '0'] = (node.getAttribute('viewBox') ?? '').split(/\s+/);
      node.setAttribute('width', width);
      node.setAttribute('height', height);
    }
    el.replaceChildren(...(node ? [node] : []));
  }, [svg, inWorld]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new drawing has to be marked again
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    for (const p of Array.from(el.querySelectorAll('[data-p]'))) {
      p.classList.toggle('petal-selected', p.getAttribute('data-p') === selected);
    }
  }, [selected, svg]);

  return { host, broken };
}

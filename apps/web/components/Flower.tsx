'use client';
// The flower (T064): the SVG the API rendered, with petal details on click through data-p
// (renderer.md: hover and click by delegation on data-p; no script inside the SVG).
// The SVG is parsed and cleaned before it enters the page, because /draft?spec= renders specs
// from anyone's link: scripts, foreignObject, event attributes and outside links are dropped.
import type { PetalDetail } from '@petal/core/types';
import { useEffect, useRef, useState } from 'react';
import { PetalDetails } from './PetalDetails.tsx';

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

export function Flower({
  svg,
  petals,
  title,
}: {
  svg: string;
  petals: PetalDetail[];
  title?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const node = cleanSvg(svg);
    setBroken(!node);
    el.replaceChildren(...(node ? [node] : []));
    const onClick = (e: Event) => {
      const hit = (e.target as Element | null)?.closest?.('[data-p]');
      setSelected(hit?.getAttribute('data-p') ?? null);
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [svg]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    for (const p of Array.from(el.querySelectorAll('[data-p]'))) {
      p.classList.toggle('petal-selected', p.getAttribute('data-p') === selected);
    }
  }, [selected]);

  const petal = petals.find((p) => p.id === selected) ?? null;
  return (
    <figure className="flower">
      <div ref={box} className="flower-svg" title={title} />
      {broken && <p className="error">The SVG could not be read.</p>}
      <figcaption>
        <PetalDetails petal={petal} />
      </figcaption>
    </figure>
  );
}

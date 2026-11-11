'use client';
// The map, live (specs/006-the-map, bench v2): one chain at a time, chosen down the left as on an exchange,
// and an empty SVG for that chain's scene and its live flowers to draw in, filling the window, or the area
// under the site's nav on the Power Map (app/(canvas)/map). Each
// flower's drawing model is made here from its reading, once. The words are the data's: each chain's name
// and how many flowers it has. On a phone the list folds to the chain on show, so it never covers the map
// (META, 11 Nov: at 390 wide it did, on the landing and the hero); pressing it opens the list, and choosing
// a chain folds it again.
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/ui/Button.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { Mono } from '../components/ui/Mono.tsx';
import { type FlowerReading, modelOf } from '../flower/model.ts';
import type { CanvasHit } from '../lib/panel-view.ts';
import type { Continent, Place } from './places.ts';
import type { Road } from './roads.ts';
import type { FarStyle, LandFlower } from './scene.ts';
import { reachOf } from './space.ts';
import { type LandscapeAt, type LandscapeData, useLandscape } from './useLandscape.ts';

export interface CanvasFlower {
  name: string;
  mark: { logo: string | null; symbol: string };
  place: Place;
  reading: FlowerReading;
}

export interface CanvasChain {
  chain: string;
  label: string;
  continent: Continent;
}

/** The chain the bench opens on: the most connected one (a lean, specs/006-the-map plan). */
const FIRST = 'eip155:1';

function Land({
  data,
  probe,
  aside,
  fill,
  focus,
  selected,
  onPick,
  inPage,
  far,
}: {
  data: LandscapeData;
  probe: boolean;
  aside: RefObject<HTMLDivElement | null>;
  fill: 'window' | 'area';
  focus: number;
  selected: string | null;
  onPick: ((hit: CanvasHit) => void) | undefined;
  inPage: boolean;
  far: FarStyle;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const at = useRef<LandscapeAt | null>(null);
  // Read by the scene when it's built and on each click, so a new pick or petal never builds it again.
  at.current = { ...at.current, focus, inPage, far, ...(onPick ? { onPick } : {}) };
  useLandscape(svg, data, probe, aside, at);
  useEffect(() => {
    at.current?.choose?.(selected);
  }, [selected]);
  return (
    // surface.canvas
    <svg
      ref={svg}
      role="img"
      aria-label="Power Map"
      className={`${fill === 'window' ? 'fixed' : 'absolute'} inset-0 block size-full ${inPage ? 'touch-pan-y' : 'touch-none'} select-none bg-surface`}
    />
  );
}

export function LandscapeCanvas({
  data,
  probe = false,
  fill = 'window',
  title,
  focus = -1,
  selected = null,
  onPick,
  inPage = false,
  far = null,
}: {
  data: { flowers: CanvasFlower[]; roads: Road[]; chains: CanvasChain[] };
  probe?: boolean;
  /** what it fills: the window, or the positioned area it's in */
  fill?: 'window' | 'area';
  /** the page's one title, over the chains */
  title?: string;
  /** the flower it opens inside, by its place in data.flowers (coordinator/one-source.md, step 6) */
  focus?: number;
  /** that flower's chosen petal, by its id */
  selected?: string | null;
  /** what a click inside that flower landed on */
  onPick?: (hit: CanvasHit) => void;
  /** inside a page that scrolls (the landing): the page keeps its wheel and its vertical swipe */
  inPage?: boolean;
  /** how a far flower is drawn: only the lab's map bench asks for the far wave (#84) until Elco has seen it */
  far?: FarStyle;
}) {
  const aside = useRef<HTMLDivElement>(null);
  const opened = data.flowers[focus]?.place.chain;
  const [chain, setChain] = useState(
    opened ?? (data.chains.some((c) => c.chain === FIRST) ? FIRST : (data.chains[0]?.chain ?? '')),
  );
  const [open, setOpen] = useState(false);
  const shown = data.chains.find((c) => c.chain === chain);
  const counts = useMemo(() => {
    const n = new Map<string, number>();
    for (const f of data.flowers) n.set(f.place.chain, (n.get(f.place.chain) ?? 0) + 1);
    return n;
  }, [data]);
  const land = useMemo<(LandscapeData & { focus: number }) | null>(() => {
    const here = data.chains.find((c) => c.chain === chain);
    if (!here) return null;
    const at = new Map<number, number>();
    const flowers: LandFlower[] = [];
    data.flowers.forEach((f, i) => {
      if (f.place.chain !== chain) return;
      at.set(i, flowers.length);
      const model = modelOf(f.reading);
      flowers.push({ name: f.name, mark: f.mark, place: f.place, model, reach: reachOf(model) });
    });
    const roads = data.roads.flatMap((r) => {
      const a = at.get(r.a);
      const b = at.get(r.b);
      return a === undefined || b === undefined ? [] : [{ ...r, a, b }];
    });
    const { x, y, r } = here.continent;
    return { flowers, roads, home: { cx: x, cy: y, r }, focus: at.get(focus) ?? -1 };
  }, [data, chain, focus]);

  return (
    <>
      {land && (
        <Land
          key={chain}
          data={land}
          probe={probe}
          aside={aside}
          fill={fill}
          focus={land.focus}
          selected={selected}
          onPick={onPick}
          inPage={inPage}
          far={far}
        />
      )}
      <div
        ref={aside}
        className={`${fill === 'window' ? 'fixed' : 'absolute'} top-space-16 left-space-16 flex w-tile-width flex-col gap-space-4`}
      >
        {title && <h1 className="type-label">{title}</h1>}
        {shown && (
          <div className="md:hidden">
            <Button variant="row" pressed={open} onClick={() => setOpen(!open)}>
              <span className="flex w-full items-center justify-between gap-text-gap">
                <span>{shown.label}</span>
                <span className="flex items-center gap-space-4">
                  <Mono as="span">{counts.get(shown.chain) ?? 0}</Mono>
                  <Icon name="chevron" small />
                </span>
              </span>
            </Button>
          </div>
        )}
        <div className={`${open ? 'flex' : 'hidden md:flex'} flex-col gap-space-4`}>
          {data.chains.map((c) => (
            <Button
              key={c.chain}
              variant="row"
              pressed={c.chain === chain}
              onClick={() => {
                setChain(c.chain);
                setOpen(false);
              }}
            >
              <span className="flex w-full items-center justify-between gap-text-gap">
                <span>{c.label}</span>
                <Mono as="span">{counts.get(c.chain) ?? 0}</Mono>
              </span>
            </Button>
          ))}
        </div>
      </div>
    </>
  );
}

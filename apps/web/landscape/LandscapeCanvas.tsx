'use client';
// The map, live (specs/006-the-map, bench v2): one chain at a time, chosen down the left as on an exchange,
// and an empty SVG for that chain's scene and its live flowers to draw in, filling the window, or the area
// under the site's nav on the Power Map (app/(canvas)/map). Each
// flower's drawing model is made here from its reading, once. The words are the data's: each chain's name
// and how many flowers it has. The chain list is one of the overlays (design/overlays.md, line 7; #95): on a
// phone it starts folded to its bar with the chain on show, so it never covers the map (META, 11 Nov: at 390
// wide it did, on the landing and the hero); pressing the bar opens it, and choosing a chain folds it again.
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { NavItem } from '../components/ui/NavItem.tsx';
import { Overlay } from '../components/ui/Overlay.tsx';
import { type FlowerReading, modelOf } from '../flower/model.ts';
import type { CanvasHit } from '../lib/panel-view.ts';
import type { Continent, Place } from './places.ts';
import type { Road } from './roads.ts';
import type { FarStyle, LandFlower, LineStyle } from './scene.ts';
import { reachOf } from './space.ts';
import { type LandscapeAt, type LandscapeData, useLandscape } from './useLandscape.ts';

export interface CanvasFlower {
  name: string;
  mark: {
    logo: string | null;
    symbol: string;
    /** what kind of thing it is, each word once (#97: its card's type_words) */
    types?: readonly string[];
  };
  place: Place;
  reading: FlowerReading;
  /** its reading's snapshot, the relations index's name for its group */
  snapshot?: string | undefined;
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
  lines,
  inside,
  clearOfChains,
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
  lines: LineStyle;
  /** told when the map goes into a flower and comes out */
  inside: (yes: boolean) => void;
  clearOfChains: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const at = useRef<LandscapeAt | null>(null);
  // Read by the scene when it's built and on each click, so a new pick or petal never builds it again.
  at.current = {
    ...at.current,
    focus,
    inPage,
    far,
    lines,
    inside,
    clearOfChains,
    ...(onPick ? { onPick } : {}),
  };
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
  far = 'wave',
  lines = 'focus',
  clearOfChains = false,
}: {
  data: { flowers: CanvasFlower[]; roads: Road[]; chains: CanvasChain[] };
  probe?: boolean;
  /** what it fills: the window, or the positioned area it's in */
  fill?: 'window' | 'area';
  /** the chain list's name, in its bar (Power Map) */
  title?: string;
  /** the flower it opens inside, by its place in data.flowers (coordinator/one-source.md, step 6) */
  focus?: number;
  /** that flower's chosen petal, by its id */
  selected?: string | null;
  /** what a click inside that flower landed on */
  onPick?: (hit: CanvasHit) => void;
  /** inside a page that scrolls (the landing): the page keeps its wheel and its vertical swipe */
  inPage?: boolean;
  /** how a far flower is drawn: the far wave (#84) on every map since 11 Nov (Elco: lab into the product) */
  far?: FarStyle;
  /** when connections show: only the pointed flower's (#87), on every map since 11 Nov */
  lines?: LineStyle;
  /** the home keeps clear of the chain list, where the map's room is narrow (/make, #78); off on /map */
  clearOfChains?: boolean;
}) {
  const aside = useRef<HTMLDivElement>(null);
  const opened = data.flowers[focus]?.place.chain;
  const [chain, setChain] = useState(
    opened ?? (data.chains.some((c) => c.chain === FIRST) ? FIRST : (data.chains[0]?.chain ?? '')),
  );
  // the overlay's fold: open where there's room, folded to its bar below md, as the phone's toggle was
  const [listOpen, setListOpen] = useState(true);
  useEffect(() => {
    if (!window.matchMedia('(min-width: 48rem)').matches) setListOpen(false);
  }, []);
  // Inside a flower the chains step aside, so they never cover it; they're back once it's left (#78, LOOK's
  // lean (a)). Invisible, not gone, so the arrows' names still keep clear of where they stand.
  const [inside, setInside] = useState(focus >= 0);
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
      flowers.push({
        name: f.name,
        mark: f.mark,
        place: f.place,
        model,
        reach: reachOf(model),
        snapshot: f.snapshot,
      });
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
          lines={lines}
          inside={setInside}
          clearOfChains={clearOfChains}
        />
      )}
      {/* One of the overlays: the aside is the Overlay's own outermost box, so its right edge, which the
          arrows' names keep clear of, is the overlay's; inside a flower it's invisible, not gone (LOOK). */}
      <div
        ref={aside}
        className={`${fill === 'window' ? 'fixed' : 'absolute'} top-space-16 left-space-16 ${inside ? 'invisible' : ''}`}
      >
        <Overlay
          title={
            !listOpen && shown ? `${title ?? 'Power Map'} · ${shown.label}` : (title ?? 'Power Map')
          }
          fold={{ open: listOpen, onToggle: () => setListOpen((now) => !now) }}
        >
          <ul className="m-0 flex list-none flex-col p-0">
            {data.chains.map((c) => (
              <li key={c.chain}>
                <NavItem
                  onClick={() => {
                    setChain(c.chain);
                    // below md the list folds back once a chain is chosen, as the toggle's did
                    if (!window.matchMedia('(min-width: 48rem)').matches) setListOpen(false);
                  }}
                  chosen={c.chain === chain}
                  label={c.label}
                  trail={String(counts.get(c.chain) ?? 0)}
                />
              </li>
            ))}
          </ul>
        </Overlay>
      </div>
    </>
  );
}

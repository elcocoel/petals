'use client';
// The map, live (specs/006-the-map, bench v2): one chain at a time, chosen down the left as on an exchange,
// and an empty SVG for that chain's scene and its live flowers to draw in, filling the window, or the area
// under the site's nav on the Power Map (app/(canvas)/map). Each
// flower's drawing model is made here from its reading, once. The words are the data's: each chain's name
// and how many flowers it has. The chain list is one of the overlays (design/overlays.md, line 7; #95): on a
// phone it starts folded to its bar with the chain on show, so it never covers the map (META, 11 Nov: at 390
// wide it did, on the landing and the hero); pressing the bar opens it, and choosing a chain folds it again.
// Where a page asks, the legend is the other overlay, under the chain list: the person's view as a key (#92);
// and inside a flower, under it, what Petals' own mapping says about that map, folded until asked.
import { EVERY_FLOWER, inUse } from '@petal/core/view';
import { flowerKeys } from '@petal/core/wedge/keys';
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapClaims } from '../components/MapClaims.tsx';
import { NavItem } from '../components/ui/NavItem.tsx';
import { Overlay } from '../components/ui/Overlay.tsx';
import { ViewLegend } from '../components/ViewLegend.tsx';
import { type FlowerReading, modelOf } from '../flower/model.ts';
import { mapClaimGroups } from '../lib/map-claims.ts';
import type { CanvasHit } from '../lib/panel-view.ts';
import { panelWords } from '../lib/panel-words.ts';
import type { LegendEdit } from '../lib/view-edit.ts';
import { useMapClaims } from '../viewmodels/useMapClaims.ts';
import { usePersonView } from '../viewmodels/usePersonView.ts';
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
  /**
   * the map it stands for, and how many proposals that map has (#93: its vote ring up close); what's said about
   * it is asked by it
   */
  map?: string | null | undefined;
  proposals?: number | undefined;
}

export interface CanvasChain {
  chain: string;
  label: string;
  continent: Continent;
}

/** Below this much room (md, 48rem) the overlays start folded to their bars. */
const ROOM = 768;

/**
 * How wide the map's own room is: the positioned area the overlays' column stands in (the column's offset
 * parent), or null where the column is fixed to the window.
 */
function roomOf(aside: HTMLElement | null): number | null {
  const area = aside?.parentElement?.offsetParent;
  return area instanceof HTMLElement ? area.clientWidth : null;
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
  inside: (yes: boolean, at: number) => void;
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
  legend = null,
}: {
  data: {
    flowers: CanvasFlower[];
    roads: Road[];
    chains: CanvasChain[];
  };
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
  /**
   * The legend (#92; design/legend.md): the person's view as a key, under the chain list, one of the overlays. Read
   * only, or changing the view where it's handed Settings' hands (/make).
   */
  legend?: 'read' | LegendEdit | null;
}) {
  const person = usePersonView();
  const aside = useRef<HTMLDivElement>(null);
  const opened = data.flowers[focus]?.place.chain;
  const [chain, setChain] = useState(
    opened ?? (data.chains.some((c) => c.chain === FIRST) ? FIRST : (data.chains[0]?.chain ?? '')),
  );
  // the overlays' folds: open where the map has room, folded to their bars where it's narrow, a phone's or
  // /make's beside the conversation (WORKSPACE's walk, 11 Nov): its own room, not the window's
  const [listOpen, setListOpen] = useState(true);
  const [legendOpen, setLegendOpen] = useState(true);
  const narrow = useCallback(() => (roomOf(aside.current) ?? window.innerWidth) < ROOM, []);
  useEffect(() => {
    if (!narrow()) return;
    setListOpen(false);
    setLegendOpen(false);
  }, [narrow]);
  // Inside a flower the chains step aside, so they never cover it; they're back once it's left (#78, LOOK's
  // lean (a)). Invisible, not gone, so the arrows' names still keep clear of where they stand.
  const [inside, setInside] = useState(focus >= 0);
  // the flower it's in, by its place on this chain's map: what's said about its map is asked for then
  const [entered, setEntered] = useState(-1);
  const toldInside = useCallback((yes: boolean, at: number) => {
    setInside(yes);
    setEntered(yes ? at : -1);
  }, []);
  const [claimsOpen, setClaimsOpen] = useState(false);
  const [openClaim, setOpenClaim] = useState<string | null>(null);
  const shown = data.chains.find((c) => c.chain === chain);
  const counts = useMemo(() => {
    const n = new Map<string, number>();
    for (const f of data.flowers) n.set(f.place.chain, (n.get(f.place.chain) ?? 0) + 1);
    return n;
  }, [data]);
  const land = useMemo<(LandscapeData & { focus: number; from: number[] }) | null>(() => {
    const here = data.chains.find((c) => c.chain === chain);
    if (!here) return null;
    const at = new Map<number, number>();
    const flowers: LandFlower[] = [];
    /** each of this chain's flowers, by its place in data.flowers */
    const from: number[] = [];
    data.flowers.forEach((f, i) => {
      if (f.place.chain !== chain) return;
      at.set(i, flowers.length);
      from.push(i);
      const model = modelOf(f.reading);
      flowers.push({
        name: f.name,
        mark: f.mark,
        place: f.place,
        model,
        reach: reachOf(model),
        snapshot: f.snapshot,
        map: f.map ?? null,
        proposals: f.proposals ?? 0,
      });
    });
    const roads = data.roads.flatMap((r) => {
      const a = at.get(r.a);
      const b = at.get(r.b);
      return a === undefined || b === undefined ? [] : [{ ...r, a, b }];
    });
    const { x, y, r } = here.continent;
    return { flowers, roads, home: { cx: x, cy: y, r }, focus: at.get(focus) ?? -1, from };
  }, [data, chain, focus]);
  // What Petals' own mapping says about the map you're in, under each petal's name (lib/map-claims.ts)
  const inFlower = land && entered >= 0 ? data.flowers[land.from[entered] ?? -1] : undefined;
  const claims = useMapClaims(legend ? (inFlower?.map ?? null) : null);
  const claimGroups = useMemo(() => {
    if (!claims || claims.length === 0 || !inFlower) return [];
    const names = new Map(
      inFlower.reading.petals.filter((p) => !p.tail).map((p) => [p.id, p.name] as const),
    );
    return mapClaimGroups(claims, names, selected);
  }, [claims, inFlower, selected]);

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
          inside={toldInside}
          clearOfChains={clearOfChains}
        />
      )}
      {/* The overlays, down the left: the chain list, then the legend under it, so they never meet. The aside is
          the chain list's own outermost box, so its right edge, which the arrows' names keep clear of, is the
          overlay's; inside a flower it's invisible, not gone (LOOK), and the legend stays, saying the flower. */}
      <div
        className={`${fill === 'window' ? 'fixed' : 'absolute'} top-space-16 left-space-16 flex flex-col items-start gap-space-8`}
      >
        {/* inside a flower, out of the column too, so the legend rises to the top in its place */}
        <div ref={aside} className={inside ? 'invisible absolute top-0 left-0' : ''}>
          <Overlay
            title={
              !listOpen && shown
                ? `${title ?? 'Power Map'} · ${shown.label}`
                : (title ?? 'Power Map')
            }
            fold={{ open: listOpen, onToggle: () => setListOpen((now) => !now) }}
          >
            <ul className="m-0 flex list-none flex-col p-0">
              {data.chains.map((c) => (
                <li key={c.chain}>
                  <NavItem
                    onClick={() => {
                      setChain(c.chain);
                      // where the room is narrow the list folds back once a chain is chosen
                      if (narrow()) setListOpen(false);
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
        {legend && (
          <ViewLegend
            view={person.view}
            drawn={inUse(person.view, EVERY_FLOWER)}
            pieces={EVERY_FLOWER}
            // each flower keys its own kinds by how common they are on it (#76): inside one, its key (core's
            // flowerKeys, what its fills paint); on the map, no one key, so it says so
            keys={inFlower ? flowerKeys(inFlower.reading.petals) : []}
            keysNote={inFlower ? undefined : panelWords.legendColours}
            edit={legend === 'read' ? undefined : legend}
            fold={{ open: legendOpen, onToggle: () => setLegendOpen((now) => !now) }}
          />
        )}
        {/* where the legend is asked for: what's said about the map you're in, folded until asked */}
        {legend && inside && claimGroups.length > 0 && (
          <MapClaims
            groups={claimGroups}
            open={openClaim}
            onOpen={(key) => setOpenClaim((now) => (now === key ? null : key))}
            fold={{ open: claimsOpen, onToggle: () => setClaimsOpen((now) => !now) }}
          />
        )}
      </div>
    </>
  );
}

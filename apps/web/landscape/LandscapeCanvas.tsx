'use client';
// The map, live (specs/006-the-map, bench v2): one chain at a time, chosen down the left as on an exchange,
// and an empty SVG for that chain's scene and its live flowers to draw in, filling the window, or the area
// under the site's nav on the Power Map (app/(canvas)/map). Each
// flower's drawing model is made here from its reading, once. The words are the data's: each chain's name
// and how many flowers it has. The chain list is one of the overlays: on a phone it starts folded to its bar
// with the chain on show, so it never covers the map (at 390 wide it would); pressing the bar opens it, and
// choosing a chain folds it again.
// Where a page asks, the legend is the other overlay, under the chain list: the person's view as a key;
// and inside a flower, under it, what Petals' own mapping says about that map, folded until asked. Where a page
// asks (the Power Map), a search field tops the chain list, and while something's typed the maps it finds stand
// in the chains' place; pressing one goes to its chain and into its flower.
import { type Proposal, redress, type SeamPiece } from '@petal/core';
import type { View } from '@petal/core/types';
import { colourKeysOf, EVERY_FLOWER, inUse, latestView } from '@petal/core/view';
import { flowerKeys, grades, KEY_BY_NAME, keyLines, mapKeys } from '@petal/core/wedge/keys';
import { floatBox } from '@petal/tokens';
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { MapClaims } from '../components/MapClaims.tsx';
import { MapLayers } from '../components/MapLayers.tsx';
import { MapProposal } from '../components/MapProposal.tsx';
import { MapSearch } from '../components/MapSearch.tsx';
import { MapStrata } from '../components/MapStrata.tsx';
import { FloatBox } from '../components/ui/FloatBox.tsx';
import { IconButton } from '../components/ui/IconButton.tsx';
import { NavItem } from '../components/ui/NavItem.tsx';
import { Overlay } from '../components/ui/Overlay.tsx';
import { SectionHead } from '../components/ui/SectionHead.tsx';
import { ViewLegend } from '../components/ViewLegend.tsx';
import { WalletFacts } from '../components/WalletFacts.tsx';
import { type FlowerReading, modelOf } from '../flower/model.ts';
import { SHAPE } from '../flower/ring.ts';
import { type BlocSpan, blocChoices, periodWords } from '../lib/bloc-words.ts';
import type { Rect, Size } from '../lib/float-box.ts';
import { mapClaimGroups, mapClaimWords } from '../lib/map-claims.ts';
import { layerWords, mapLayers } from '../lib/map-layers.ts';
import { MAP_SEARCH_ID, mapSearchWords, type SearchRow, searchRows } from '../lib/map-search.ts';
import { authorSwatches, strataOf, strataWords } from '../lib/map-strata.ts';
import type { CanvasHit } from '../lib/panel-view.ts';
import { panelWords } from '../lib/panel-words.ts';
import { CHOOSABLE } from '../lib/person-view.ts';
import { proposalView, proposalWords } from '../lib/proposal-view.ts';
import { type LegendEdit, onlyWhatDraws } from '../lib/view-edit.ts';
import { differsOf, walletView, walletWords } from '../lib/wallet-view.ts';
import { useComposed } from '../viewmodels/useComposed.ts';
import { useFloatBoxes } from '../viewmodels/useFloatBoxes.ts';
import { useLegendEdit } from '../viewmodels/useLegendEdit.ts';
import { useMapBlocs } from '../viewmodels/useMapBlocs.ts';
import { useMapCard } from '../viewmodels/useMapCard.ts';
import { useMapClaims } from '../viewmodels/useMapClaims.ts';
import { useMapSearch } from '../viewmodels/useMapSearch.ts';
import { usePersonView } from '../viewmodels/usePersonView.ts';
import {
  type Continent,
  freePlace,
  GRAVITY_DEFAULT,
  type Place,
  ringsAround,
  spreadOf,
  spreadPlace,
} from './places.ts';
import type { Road } from './roads.ts';
import type { FarStyle, LandFlower, LineStyle } from './scene.ts';
import { reachOf } from './space.ts';
import {
  idOf,
  type LandShow,
  type LandscapeAt,
  type LandscapeData,
  useLandscape,
} from './useLandscape.ts';

export interface CanvasFlower {
  name: string;
  mark: {
    logo: string | null;
    symbol: string;
    /** what kind of thing it is, each word once (its card's type_words) */
    types?: readonly string[];
  };
  place: Place;
  reading: FlowerReading;
  /** its reading's snapshot, the relations index's name for its group */
  snapshot?: string | undefined;
  /**
   * the map it stands for, and how many proposals that map has (its vote ring up close); what's said about
   * it is asked by it
   */
  map?: string | null | undefined;
  proposals?: number | undefined;
  /** its map's treasury and token price, in words, where its card has them */
  worth?: readonly string[] | undefined;
  /** the pieces of data its reading has, by name, when the live map says: what Tools offers inside it */
  pieces?: readonly string[] | undefined;
  /** the pieces its reading got, values for its drawn petals: what the browser dresses it again with */
  given?: SeamPiece[] | undefined;
}

/** A wallet chosen on the map (the wallet level): its id as its flower names it, on that flower's chain. */
/** What a page shows on the map (LandscapeCanvas `show`): a DAO, a wallet, the line between two DAOs, a proposal. */
export type MapShow =
  | { map: string }
  | { wallet: string; chain?: string | null }
  | { line: readonly [string, string] }
  | { proposal: { map: string; id: string } };

/** The strip's words while a change in Tools reads the map again. */
const UPDATING = 'Updating the map';

/**
 * Each flower dressed in a view, in the browser (core redress): where the server gave its reading's pieces; a
 * flower without them (an older server) as the server read it.
 */
function dressedIn<D extends { flowers: CanvasFlower[] }>(data: D, view: View): D {
  if (!data.flowers.some((f) => f.given)) return data;
  return {
    ...data,
    flowers: data.flowers.map((f) =>
      f.given
        ? { ...f, reading: { ...f.reading, petals: redress(f.reading.petals, view, f.given) } }
        : f,
    ),
  };
}

/**
 * A grade's legend, colour graded by a number or a date: where Colour shows a count, a date, a share
 * or an amount, its two ends over the drawn petals, in words ('fewest 3' and 'most 534', 'oldest 17 Aug 2023' and
 * 'newest 12 Nov 2026'), and the five steps' colours, lightest first; null for a category or one colour.
 */
function gradeWords(
  flowers: readonly CanvasFlower[],
  view: View,
  chosen: Readonly<Record<string, string>>,
): { from: string; to: string; fills: string[] } | null {
  const by = latestView(view).dimensions.colour?.data ?? null;
  if (!by) return null;
  const pieceKind = flowers.flatMap((f) => f.given ?? []).find((p) => p.name === by)?.kind;
  const kind = by === 'share' || by === 'amount' ? by : pieceKind;
  if (kind !== 'share' && kind !== 'amount' && kind !== 'count' && kind !== 'date') return null;
  const xs: number[] = [];
  for (const f of flowers) {
    const piece = f.given?.find((p) => p.name === by);
    for (const p of f.reading.petals) {
      if (p.tail) continue;
      if (kind === 'share') xs.push(p.share);
      else if (kind === 'amount') xs.push(Number(p.amount));
      else {
        const v =
          piece && 'values' in piece
            ? piece.values.find((x) => x.participant === p.id)?.value
            : undefined;
        const x = v === undefined ? Number.NaN : kind === 'date' ? Date.parse(v) : Number(v);
        if (Number.isFinite(x)) xs.push(x);
      }
    }
  }
  if (xs.length === 0) return null;
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const day = (t: number) =>
    new Date(t).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  const say = (x: number) =>
    kind === 'date'
      ? day(x)
      : kind === 'share'
        ? `${(x * 100).toFixed(x < 0.001 ? 3 : 1)}%`
        : Math.round(x).toLocaleString('en-US');
  // a date's ends: earliest and latest, past (last active) or still to come (an allocation's next unlock)
  const [low, high] = kind === 'date' ? ['earliest', 'latest'] : ['fewest', 'most'];
  const hue = KEY_BY_NAME.get(chosen.grade ?? '');
  return {
    from: `${kind === 'share' || kind === 'amount' ? 'least' : low} ${say(lo)}`,
    to: `${high} ${say(hi)}`,
    fills: grades(hue).map((k) => k.hex),
  };
}

/**
 * A publication that has just joined the map (the page hands it after the press: publishing is the moment a
 * layer joins the map in its author's name): which map, its hash, its author, its documents. The map reads its layers
 * and its composed reading again, and Information lights the documents it brought.
 */
export interface MapJoined {
  map: string;
  publication: string;
  author: string;
  documents: readonly { sha256: string; petal: string; what: string }[];
  at: number;
}

/** A reading just made, for the map (LandscapeCanvas `landed`; the page hands it from the conversation's turn). */
export interface MapLanded {
  /** the chain its map is on */
  chain: string;
  /** its name, as the conversation calls it */
  name: string;
  reading: FlowerReading;
  /** the map it's a new layer of, or null for a completely new map */
  map: string | null;
  /** its reading's snapshot */
  snapshot?: string | undefined;
  /** its token's symbol, and its logo, where known */
  symbol?: string | undefined;
  logo?: string | null | undefined;
  /**
   * the pieces of data it has, and the values it got, as a map's own reading carries them: what Tools offers and
   * what the browser dresses it with. A layer switched on or off hands its composed reading's own (useComposed);
   * without them it's drawn as it was read, never with the reading it replaced's.
   */
  pieces?: readonly string[] | undefined;
  given?: SeamPiece[] | undefined;
}

/** Where a new map stands on its chain before and after it's read: the first free place (places.ts freePlace). */
const placeOfNew = (
  data: { flowers: CanvasFlower[]; chains: CanvasChain[] },
  chain: string,
  id: string,
) => {
  const home = data.chains.find((c) => c.chain === chain)?.continent;
  if (!home) return null;
  const on = data.flowers.filter((f) => f.place.chain === chain).map((f) => f.place);
  return freePlace(on, home, chain, id);
};

/** The map with a reading just made: a map that's here drawn from it, a new one in its placeholder's place. */
function withLanded<D extends { flowers: CanvasFlower[]; chains: CanvasChain[] }>(
  data: D,
  landed: MapLanded | null,
): D {
  if (!landed) return data;
  const i = landed.map ? data.flowers.findIndex((f) => f.map === landed.map) : -1;
  const here = data.flowers[i];
  if (here) {
    const flowers = data.flowers.slice();
    flowers[i] = {
      ...here,
      reading: landed.reading,
      snapshot: landed.snapshot ?? here.snapshot,
      pieces: landed.pieces ?? here.pieces,
      given: landed.given,
    };
    return { ...data, flowers };
  }
  const place = placeOfNew(data, landed.chain, `new:${landed.name}`);
  if (!place) return data;
  const flower: CanvasFlower = {
    name: landed.name,
    mark: {
      logo: landed.logo ?? null,
      symbol: landed.symbol ?? (Array.from(landed.name.trim())[0] ?? '').toUpperCase(),
    },
    place,
    reading: landed.reading,
    snapshot: landed.snapshot,
    map: landed.map,
    pieces: landed.pieces,
    given: landed.given,
  };
  return { ...data, flowers: [...data.flowers, flower] };
}

export interface MapWallet {
  id: string;
  chain: string;
  /** the flower it was chosen in */
  flower: string;
}

export interface CanvasChain {
  chain: string;
  label: string;
  /** its logo, round before its name in the chain list */
  logo?: string | null | undefined;
  continent: Continent;
}

/**
 * The map's floating boxes, moved as the workspace's are: two, Tools (what the person changes by hand) and
 * Information (insights and the data layers).
 */
const PANELS = ['tools', 'info'] as const;
type Panel = (typeof PANELS)[number];
/** A panel row's height: Tools starts as tall as its rows mostly are. */
const PANEL_ROW = 32;
/** Tools' rows besides the chains: the search, the heads, the dimensions, the map's rows and the reset. */
const TOOLS_ROWS = 17;
/** Tools' width, as the column's (w-tile-width). */
export const PANEL_W = 280;
/** A floating box folded to its bar: the bar's own height and the box's edge (FloatBox's bar is a control high, padded). */
const BAR_FOLDED = 66;

/** How tall a floating box is folded to its bar: its bar as drawn, with the box's edge; or the bar's usual height. */
function barOf(box: HTMLElement | null): number {
  const bar = box?.querySelector<HTMLElement>('[data-b="box"] > :first-child');
  // a box not on the page yet (Insights before it's asked) has no height to measure
  return bar?.offsetHeight ? bar.offsetHeight + 2 : BAR_FOLDED;
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

/** The chain the bench opens on: the most connected one (specs/006-the-map plan). */
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
  onWallet,
  onCentre,
  onProposal,
  clearOfChains,
  highlight,
  go,
  worth,
  show,
  pending,
  progress,
  unlabelled,
}: {
  data: LandscapeData;
  probe: boolean;
  aside: RefObject<HTMLElement | null>;
  fill: 'window' | 'area';
  focus: number;
  selected: string | null;
  onPick: ((hit: CanvasHit) => void) | undefined;
  inPage: boolean;
  far: FarStyle;
  lines: LineStyle;
  /** told when the map goes into a flower and comes out */
  inside: (yes: boolean, at: number) => void;
  /** told when a wallet is chosen, and when it's let go */
  onWallet: (id: string | null) => void;
  /** told which DAO a click puts in the middle, by its map, or null to put the saved map back */
  onCentre: (id: string | null) => void;
  /** told which proposal a click pins, with the proposal, and when it's let go */
  onProposal: NonNullable<LandscapeAt['onProposal']>;
  clearOfChains: boolean;
  /** the chosen group's petals to highlight inside the flower you're in, or null */
  highlight: readonly string[] | null;
  /** a flower to go into, by its place on this chain's map (a search's answer, pressed), or null */
  go: { at: number } | null;
  /** treasury and token price under the names at some magnification (the legend's switch) */
  worth: boolean;
  /** what the page's conversation is about, on this chain's map (undefined: the page says nothing) */
  show: LandShow | null | undefined;
  /** a new map's placeholder on this chain's map, or null */
  pending: { x: number; y: number; s: number; name: string } | null;
  /** Labels None in the person's view: the petals say nothing, but the one pointed at */
  unlabelled: boolean;
  /** work running on this chain's map: under a flower (its place here), the placeholder or the map's foot, or null */
  progress: { at: number | 'pending' | 'map'; words: string; share: number | null } | null;
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
    onWallet,
    onCentre,
    onProposal,
    clearOfChains,
    worth,
    pending,
    progress,
    unlabelled,
    ...(onPick ? { onPick } : {}),
  };
  useLandscape(svg, data, probe, aside, at);
  // its chain left or the map gone: the wallet chosen on it goes too
  useEffect(() => () => onWallet(null), [onWallet]);
  useEffect(() => {
    at.current?.choose?.(selected);
  }, [selected]);
  useEffect(() => {
    at.current?.highlight?.(highlight);
  }, [highlight]);
  useEffect(() => {
    if (worth !== undefined) at.current?.redraw?.();
  }, [worth]);
  // after the map's own effect, so a chain built just now is there to fly into
  useEffect(() => {
    if (go) at.current?.enter?.(go.at);
  }, [go]);
  useEffect(() => {
    if (show !== undefined) at.current?.show?.(show);
  }, [show]);
  // the placeholder: the camera flies to take it in, so it reads as a recognisable state
  const pendingAt = pending ? `${pending.x},${pending.y},${pending.s}` : null;
  useEffect(() => {
    const p = at.current?.pending;
    if (!pendingAt || !p) return;
    at.current?.fit?.({ cx: p.x, cy: p.y, r: SHAPE.R * p.s * 3 });
  }, [pendingAt]);
  useEffect(() => {
    if (pending !== undefined || progress !== undefined) at.current?.redraw?.();
  }, [pending, progress]);
  useEffect(() => {
    if (unlabelled !== undefined) at.current?.redraw?.();
  }, [unlabelled]);
  return (
    // surface.canvas
    <svg
      ref={svg}
      role="img"
      aria-label="Power Map"
      // in a page it lies on the page's own ground, with no box of its own (the landing)
      className={`${fill === 'window' ? 'fixed' : 'absolute'} inset-0 block size-full ${inPage ? 'touch-pan-y' : 'touch-none bg-surface'} select-none`}
    />
  );
}

export function LandscapeCanvas({
  data: given,
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
  search = false,
  panelEdge,
  onWallet,
  onEnter,
  information,
  ownBox = false,
  show,
  placeholder = null,
  progress = null,
  landed = null,
  joined = null,
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
  /** the flower it opens inside, by its place in data.flowers */
  focus?: number;
  /** that flower's chosen petal, by its id */
  selected?: string | null;
  /** what a click inside that flower landed on */
  onPick?: (hit: CanvasHit) => void;
  /** inside a page that scrolls (the landing): the page keeps its wheel and its vertical swipe */
  inPage?: boolean;
  /** how a far flower is drawn: the far wave on every map */
  far?: FarStyle;
  /** when connections show: only the pointed flower's, on every map */
  lines?: LineStyle;
  /** the home keeps clear of the chain list, where the map's room is narrow (/make); off on /map */
  clearOfChains?: boolean;
  /**
   * The legend: the person's view as a key, under the chain list, one of the overlays. Read only; changing the
   * view where it's handed Settings' hands (/make); or 'edit', with its own (the Power Map).
   */
  legend?: 'read' | 'edit' | LegendEdit | null;
  /** a search field at the top of the chain list (the Power Map) */
  search?: boolean;
  /**
   * Where /make's side panel ends (0 with none): the map's boxes snap beside it and move with it, as every box
   * on /make does. Left out on /map, /m and /f.
   */
  panelEdge?: number | undefined;
  /**
   * Told which wallet is chosen, by a press on its petal inside a flower (the wallet level), and when it's let
   * go, its chain left or the map gone (null): /make asks Petals' agent about it, to find out more about it.
   */
  onWallet?: ((wallet: MapWallet | null) => void) | undefined;
  /** Told the map of the flower the person goes into, and null when they come out (/make's mapping state). */
  onEnter?: ((map: string | null) => void) | undefined;
  /**
   * What the page's conversation is about (on /make the map is always there, and an answer moves it): a DAO by its
   * map, flown to and entered; a wallet, lit everywhere it sits on its chain (the chosen chain, else the one on
   * screen); the line between two DAOs; a proposal pinned in its DAO. null lets go of what it lit; undefined, the
   * page says nothing.
   */
  show?: MapShow | null | undefined;
  /**
   * A completely new map on its way, its placeholder: a dashed round place on its chain's map, its name and 'new',
   * the camera taking it in.
   */
  placeholder?: { chain: string; name: string } | null | undefined;
  /** Work running (on /make): a strip under that map's flower, or under the placeholder ('new'). */
  progress?: { map: string | 'new'; words: string; share: number | null } | null | undefined;
  /**
   * A reading just made, landing on the map as a new layer: on a map that's here, its flower is drawn from it; a
   * completely new one stands where its placeholder stood.
   */
  landed?: MapLanded | null | undefined;
  /** a publication that has just joined the map: read again, and lit in Information */
  joined?: MapJoined | null | undefined;
  /** What the page says about where it is (a map's page: what it maps, its worth, its readings), first in Information. */
  information?: { title: string; body: ReactNode } | undefined;
  /**
   * The page keeps a box of its own at the top right (a flower's page; /make has its own too): Information starts
   * under Tools instead of there.
   */
  ownBox?: boolean;
}) {
  // a reading just made lands on the map: a new layer of a map that's here, or a new map in its placeholder's place
  const person = usePersonView();
  // a publication joining the map reads its layers and its composed reading again
  const version = joined?.publication ?? '';
  // the map's layers you switch, kept for the visit (layers from different people add up to fuller maps): the map
  // you're in and its layers, and the ones off; all on, the map draws its own reading
  const [strata, setStrata] = useState<{ map: string; ids: readonly string[] } | null>(null);
  const [layersOff, setLayersOff] = useState<ReadonlySet<string>>(() => new Set());
  const layersOn = useMemo(() => {
    if (!strata || layersOff.size === 0) return null;
    return strata.ids.filter((id) => !layersOff.has(id));
  }, [strata, layersOff]);
  const composed = useComposed(strata?.map ?? null, layersOn, person.hash, version);
  // the composed reading lands on its flower as a reading just made does (petals gliding)
  const composedLanded = useMemo<MapLanded | null>(() => {
    if (!composed || !strata) return null;
    const f = given.flowers.find((x) => x.map === strata.map);
    if (!f) return null;
    return {
      chain: f.place.chain,
      name: f.name,
      reading: { title: '', petals: composed.petals },
      map: strata.map,
      pieces: composed.pieces,
      given: composed.given,
    };
  }, [composed, strata, given]);
  // and dressed in the person's view in the browser, at once (core redress: after a change in Tools the map
  // redraws without the second's wait): the server's reading in that view comes after and draws the same
  const data = useMemo(
    () => dressedIn(withLanded(withLanded(given, landed), composedLanded), person.view),
    [given, landed, composedLanded, person.view],
  );
  // 'edit' (the Power Map, the legend switched live and the map adapting): Settings' own hands, for anyone: a
  // person's view is kept on the server, a visitor's by its hash in their browser
  const ownHands = useLegendEdit();
  const hands = legend === 'edit' ? ownHands : legend === 'read' ? undefined : legend;
  const aside = useRef<HTMLElement | null>(null);
  // the map's panels float, move, snap and size wherever the map fills its page; the landing's
  // map scrolls with its page, so there they stay a column
  const movable = !inPage;
  const room = useRef<HTMLDivElement>(null);
  const opened = data.flowers[focus]?.place.chain;
  const [chain, setChain] = useState(
    opened ?? (data.chains.some((c) => c.chain === FIRST) ? FIRST : (data.chains[0]?.chain ?? '')),
  );
  // what the page's conversation is about, on its chain's map (on /make an answer moves the map)
  const [shownOn, setShownOn] = useState<{ chain: string; show: LandShow | null } | null>(null);
  const flowersNow = useRef(data.flowers);
  flowersNow.current = data.flowers;
  const chainNow = useRef(chain);
  chainNow.current = chain;
  useEffect(() => {
    if (show === undefined) return;
    if (show === null) {
      setShownOn((was) => (was ? { chain: was.chain, show: null } : null));
      return;
    }
    const all = flowersNow.current;
    const byMap = (map: string) => all.findIndex((f) => f.map === map);
    // a flower's place on its own chain's map, as the map counts them
    const local = (i: number) =>
      all.slice(0, i).filter((x) => x.place.chain === all[i]?.place.chain).length;
    const on = (i: number) => all[i]?.place.chain ?? chainNow.current;
    let next: { chain: string; show: LandShow } | null = null;
    if ('map' in show) {
      const i = byMap(show.map);
      if (i >= 0) next = { chain: on(i), show: { kind: 'map', i: local(i) } };
    } else if ('proposal' in show) {
      const i = byMap(show.proposal.map);
      if (i >= 0)
        next = { chain: on(i), show: { kind: 'proposal', i: local(i), id: show.proposal.id } };
    } else if ('line' in show) {
      const a = byMap(show.line[0]);
      const b = byMap(show.line[1]);
      if (a >= 0 && b >= 0 && on(a) === on(b))
        next = { chain: on(a), show: { kind: 'line', a: local(a), b: local(b) } };
      else if (a >= 0) next = { chain: on(a), show: { kind: 'map', i: local(a) } };
    } else {
      next = { chain: show.chain ?? chainNow.current, show: { kind: 'wallet', id: show.wallet } };
    }
    if (!next) return;
    setChain(next.chain);
    setShownOn(next);
  }, [show]);
  // the placeholder, where its map will stand (the same free place its reading lands in), on its chain
  const pendingPlace = useMemo(
    () => (placeholder ? placeOfNew(given, placeholder.chain, `new:${placeholder.name}`) : null),
    [given, placeholder],
  );
  const placeholderChain = placeholder?.chain ?? null;
  useEffect(() => {
    if (placeholderChain) setChain(placeholderChain);
  }, [placeholderChain]);
  // the overlays' folds: open where the map has room, folded to their bars where it's narrow, a phone's or
  // /make's beside the conversation: its own room, not the window's (on the map's boxes the chain
  // list's fold is Tools', and Insights' is Information's)
  const [listOpen, setListOpen] = useState(true);
  // Tools' Chains section, folded under its head by hand
  const [chainsOpen, setChainsOpen] = useState(true);
  const [legendOpen, setLegendOpen] = useState(true);
  // Information opens where the page says where it is (a map's page); Insights is folded until asked
  const [claimsOpen, setClaimsOpen] = useState(movable && Boolean(information));
  // the room was narrow when the map came (a phone): Information's bar sits at the room's foot
  const [low, setLow] = useState(false);
  const narrow = useCallback(
    () =>
      ((movable ? room.current?.clientWidth : roomOf(aside.current)) ?? window.innerWidth) < ROOM,
    [movable],
  );
  // before the first paint, so a phone never sees a box open over the flower
  useLayoutEffect(() => {
    if (!narrow()) return;
    setListOpen(false);
    setLegendOpen(false);
    setClaimsOpen(false);
    setLow(true);
  }, [narrow]);
  // Inside a flower the chains step aside, so they never cover it; they're back once it's left. Invisible, not
  // gone, so the arrows' names still keep clear of where they stand.
  const [inside, setInside] = useState(focus >= 0);
  // the flower it's in, by its place on this chain's map: what's said about its map is asked for then
  const [entered, setEntered] = useState(-1);
  // the group chosen in the legend's Highlight row, lit inside the flower; leaving it clears it
  const [bloc, setBloc] = useState<string | null>(null);
  // the wallet chosen on the map (the wallet level): Insights says what's said about it
  const [wallet, setWallet] = useState<string | null>(null);
  // all their votes first: the recent ones hold no bloc on most maps
  const [span, setSpan] = useState<BlocSpan>('all');
  // the proposal a click pinned (onProposal): Information says what it's about
  const [pinned, setPinned] = useState<Proposal | null>(null);
  const toldInside = useCallback((yes: boolean, at: number) => {
    setInside(yes);
    setEntered(yes ? at : -1);
    if (!yes) {
      setBloc(null);
      setPinned(null);
    }
  }, []);
  const proposalPinned = useCallback<NonNullable<LandscapeAt['onProposal']>>((p) => {
    // the ring's own object is the server's whole proposal: its summary and link come with it
    setPinned((p?.proposal as Proposal | null | undefined) ?? null);
    // Information opens on it, as on a chosen wallet's insights
    if (p?.proposal) setClaimsOpen(true);
  }, []);
  const finding = useMapSearch();
  // the flower a search's answer goes into, by its chain and its place on that chain's map
  const [go, setGo] = useState<{ chain: string; at: number } | null>(null);
  const [openClaim, setOpenClaim] = useState<string | null>(null);
  const shown = data.chains.find((c) => c.chain === chain);
  const found = useMemo(() => {
    const body = search && finding.q.trim() ? finding.got?.body : undefined;
    if (!body) return null;
    const label = (c: string) => data.chains.find((x) => x.chain === c)?.label ?? c;
    return searchRows(body, data.flowers, label);
  }, [search, finding.q, finding.got, data]);
  const searchStatus = (() => {
    if (!finding.q.trim()) return null;
    if (finding.busy === 'ordered') return mapSearchWords.ordering;
    if (!finding.got) return mapSearchWords.searching;
    if (!finding.got.body) return mapSearchWords.failed;
    if (found && found.length === 0)
      return finding.busy ? mapSearchWords.searching : mapSearchWords.none;
    return finding.got.body.meaning === 'off' ? mapSearchWords.wordsOnly : null;
  })();
  // Cmd+K (Ctrl+K off a Mac) opens the list and puts the cursor in the search, the standard shortcut
  const [searchAsked, setSearchAsked] = useState(0);
  useEffect(() => {
    if (!search) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return;
      e.preventDefault();
      setListOpen(true);
      setSearchAsked((n) => n + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [search]);
  useEffect(() => {
    if (searchAsked) document.getElementById(MAP_SEARCH_ID)?.focus();
  }, [searchAsked]);
  const goTo = (row: SearchRow) => {
    const f = data.flowers[row.at];
    if (!f) return;
    const at = data.flowers.slice(0, row.at).filter((x) => x.place.chain === f.place.chain).length;
    setChain(f.place.chain);
    setGo({ chain: f.place.chain, at });
  };
  const counts = useMemo(() => {
    const n = new Map<string, number>();
    for (const f of data.flowers) n.set(f.place.chain, (n.get(f.place.chain) ?? 0) + 1);
    return n;
  }, [data]);
  // Gravity: how close the flowers on a chain sit (the legend's control)
  const [gravity, setGravity] = useState(GRAVITY_DEFAULT);
  // treasury and token price under the names at some magnification, switched in the legend
  const [worth, setWorth] = useState(true);
  const [insightsOn, setInsightsOn] = useState(true);
  // the chain's flowers and their drawing models, once per chain; gravity only moves their places
  // the map's keys, ranked once over every flower on it, whatever chain: a value has one colour everywhere
  // the view's chosen colours (colour.keys: { value: key }: which colour a value gets)
  const chosen = useMemo(() => colourKeysOf(person.view), [person.view]);
  const mapKeyed = useMemo(
    () =>
      mapKeys(
        data.flowers.map((f) => f.reading.petals),
        chosen,
      ),
    [data, chosen],
  );
  // a number or a date on Colour: its grade's two ends in words, and the five steps' colours (the legend draws it)
  const gradeKeys = useMemo(
    () => gradeWords(data.flowers, person.view, chosen),
    [data, person.view, chosen],
  );
  const built = useMemo<(LandscapeData & { focus: number; from: number[] }) | null>(() => {
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
        // the chain's logo for the centre of a flower with none of its own
        mark: { ...f.mark, chain: here.logo ?? null },
        place: f.place,
        model,
        reach: reachOf(model),
        snapshot: f.snapshot,
        map: f.map ?? null,
        proposals: f.proposals ?? 0,
        worth: f.worth,
      });
    });
    const roads = data.roads.flatMap((r) => {
      const a = at.get(r.a);
      const b = at.get(r.b);
      return a === undefined || b === undefined ? [] : [{ ...r, a, b }];
    });
    const { x, y, r } = here.continent;
    return {
      flowers,
      roads,
      home: { cx: x, cy: y, r },
      focus: at.get(focus) ?? -1,
      from,
      keyed: mapKeyed,
    };
  }, [data, chain, focus, mapKeyed]);
  // the DAO a click put in the middle, by its map; the rest arranged round it by the wallets they share with it
  const [centre, setCentre] = useState<string | null>(null);
  // drawn where its reading will land: spread by the gravity, as every place on the map is
  const pendingHere = useMemo(() => {
    if (!placeholder || !pendingPlace || pendingPlace.chain !== chain) return null;
    const home = data.chains.find((c) => c.chain === chain)?.continent;
    const at = home ? spreadPlace(pendingPlace, home, spreadOf(gravity)) : pendingPlace;
    return { x: at.x, y: at.y, s: at.s, name: placeholder.name };
  }, [placeholder, pendingPlace, chain, data, gravity]);
  const progressHere = useMemo(() => {
    // a change in Tools reads the map again: meanwhile a strip says so, under the DAO you're in or at the map's
    // foot, so there's visible feedback that something is being updated in the back
    if (!progress && person.busy)
      return { at: entered >= 0 ? entered : ('map' as const), words: UPDATING, share: null };
    if (!progress) return null;
    if (progress.map === 'new')
      return pendingHere
        ? { at: 'pending' as const, words: progress.words, share: progress.share }
        : null;
    const i = data.flowers.findIndex((f) => f.map === progress.map);
    const f = data.flowers[i];
    if (!f || f.place.chain !== chain) return null;
    const at = data.flowers.slice(0, i).filter((x) => x.place.chain === chain).length;
    return { at, words: progress.words, share: progress.share };
  }, [progress, pendingHere, data, chain, person.busy, entered]);
  const land = useMemo(() => {
    if (!built) return null;
    const middle = { x: built.home.cx, y: built.home.cy };
    const c = centre ? built.flowers.findIndex((f) => idOf(f) === centre) : -1;
    let places = built.flowers.map((f) => f.place);
    let reach = built.home.r;
    if (c >= 0) {
      const shared = built.flowers.map(
        (_, i) =>
          built.roads.find((r) => (r.a === c && r.b === i) || (r.a === i && r.b === c))?.shared ??
          0,
      );
      const around = ringsAround(places, shared, c, middle);
      places = around.places;
      reach = around.r;
    }
    const spread = spreadOf(gravity);
    return {
      ...built,
      flowers: built.flowers.map((f, i) => ({
        ...f,
        place: spreadPlace(places[i] as Place, middle, spread),
      })),
      home: { ...built.home, r: reach * spread },
      centre: c,
      // the camera fits a new arrangement; a gravity change keeps it where it is
      layout: c >= 0 ? `centre:${centre}` : 'saved',
    };
  }, [built, gravity, centre]);
  // What Petals' own mapping says about the map you're in, under each petal's name (lib/map-claims.ts)
  const inFlower = land && entered >= 0 ? data.flowers[land.from[entered] ?? -1] : undefined;
  // the map the person is inside, for a page that asks (/make's mapping state)
  const toldEnter = useRef(onEnter);
  toldEnter.current = onEnter;
  const enteredMap = inFlower?.map ?? null;
  useEffect(() => {
    toldEnter.current?.(enteredMap);
  }, [enteredMap]);
  // the wallet chosen, with the flower it was chosen in, for the page
  const toldWallet = useRef(onWallet);
  toldWallet.current = onWallet;
  const inNow = useRef(inFlower);
  inNow.current = inFlower;
  const walletChosen = useCallback((id: string | null) => {
    // Insights opens on what's said about it, then the page is told
    setWallet(id);
    if (id) setClaimsOpen(true);
    const f = inNow.current;
    toldWallet.current?.(id && f ? { id, chain: f.place.chain, flower: f.name } : null);
  }, []);
  const claims = useMapClaims(legend ? (inFlower?.map ?? null) : null);
  // the map's layers, each with its period and who mapped it, from its card and its insights
  const card = useMapCard(legend && movable ? (inFlower?.map ?? null) : null, version);
  // the map's layers as strata, each first author in their colour (the card's layers and authors)
  const strataLayers = useMemo(
    () => (card?.layers && card.authors ? strataOf(card.layers, card.authors) : null),
    [card],
  );
  const swatches = useMemo(
    () => (strataLayers && card?.authors ? authorSwatches(strataLayers, card.authors) : undefined),
    [strataLayers, card],
  );
  // the map you're in names the strata the switches act on
  const strataMap = inFlower?.map ?? null;
  useEffect(() => {
    const ids = strataLayers?.map((l) => l.id) ?? null;
    setStrata((now) => {
      if (!strataMap || !ids) return null;
      if (now && now.map === strataMap && now.ids.join() === ids.join()) return now;
      return { map: strataMap, ids };
    });
  }, [strataMap, strataLayers]);
  // another map, all its layers on again
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new map is what resets them
  useEffect(() => {
    setLayersOff(new Set());
  }, [strataMap]);
  // a publication that joins the map you're in opens Information on it
  useEffect(() => {
    if (joined && joined.map === strataMap) setClaimsOpen(true);
  }, [joined, strataMap]);
  // the whole map, all layers on, read once: the version you're seeing (its rule and the publications it was
  // composed from) and, where authors differ, who stated which value
  const wholeRead = useComposed(
    strata ? strataMap : null,
    strata ? strata.ids : null,
    person.hash,
    version,
  );
  const creditRead = card?.differs ? wholeRead : null;
  const joinedHere = useMemo(
    () => new Set(joined && joined.map === strataMap ? joined.documents.map((d) => d.sha256) : []),
    [joined, strataMap],
  );
  const layers = useMemo(() => (card ? mapLayers(card, claims) : []), [card, claims]);
  // the wallet chosen on the map, its own facts first in Information (the same on /make)
  const chosenWallet = wallet
    ? (inFlower?.reading.petals.find((p) => p.id === wallet) ?? null)
    : null;
  const blocs = useMapBlocs(legend ? (inFlower?.map ?? null) : null, span);
  // a bloc is offered only where its members are petals of the flower drawn
  const choices = useMemo(
    () =>
      blocs && inFlower
        ? blocChoices(
            blocs,
            inFlower.reading.petals.filter((p) => !p.tail).map((p) => p.id),
          )
        : [],
    [blocs, inFlower],
  );
  const lit = useMemo(() => choices.find((c) => c.id === bloc)?.members ?? null, [choices, bloc]);
  const claimGroups = useMemo(() => {
    if (!claims || claims.length === 0 || !inFlower) return [];
    const names = new Map(
      inFlower.reading.petals.filter((p) => !p.tail).map((p) => [p.id, p.name] as const),
    );
    // a chosen wallet's insights alone
    const about = wallet ? claims.filter((c) => c.subject === wallet) : claims;
    return mapClaimGroups(about, names, selected);
  }, [claims, inFlower, selected, wallet]);

  // the chain list's words and rows, the legend and Insights: one each, in a floating box or in the column
  const chainTitle =
    !listOpen && shown ? `${title ?? 'Power Map'} · ${shown.label}` : (title ?? 'Power Map');
  const searchRow = search && (
    <MapSearch
      q={finding.q}
      onType={finding.type}
      onOrder={finding.order}
      onClear={finding.clear}
      rows={found}
      status={searchStatus}
      onGo={goTo}
    />
  );
  // while something's typed, what it finds stands in the chains' place
  const chainList = !(search && finding.q.trim()) && (
    <ul className="m-0 flex list-none flex-col p-0">
      {data.chains.map((c) => (
        <li key={c.chain}>
          <NavItem
            onClick={() => {
              setChain(c.chain);
              setGo(null);
              // where the room is narrow the list folds back once a chain is chosen
              if (narrow()) setListOpen(false);
            }}
            chosen={c.chain === chain}
            logo={c.logo}
            label={c.label}
            trail={String(counts.get(c.chain) ?? 0)}
          />
        </li>
      ))}
    </ul>
  );
  const chainRows = (
    <>
      {searchRow}
      {chainList}
    </>
  );
  const showClaims = Boolean(legend && inside && (claimGroups.length > 0 || (wallet && claims)));
  const claimCount = claimGroups.reduce((n, g) => n + g.lines.length, 0);
  // where each box starts: Tools down the room's left, as tall as its rows or the room; Information at the top
  // right, where a page's box starts (a map's page had its readings there), or under Tools where the page keeps a
  // box of its own there (a flower's page; /make's side panel and boxes). A hand moves and sizes them for the visit.
  const chainCount = data.chains.length;
  const infoUnder = ownBox || panelEdge !== undefined;
  const toolsEl = useRef<HTMLElement | null>(null);
  const infoEl = useRef<HTMLElement | null>(null);
  const place = useCallback(
    (win: Size): Record<Panel, Rect> => {
      const r = room.current?.getBoundingClientRect() ?? null;
      const top = r?.top ?? 0;
      const left = (r?.left ?? 0) + floatBox.inset;
      const right = (r?.right ?? win.w) - floatBox.inset;
      const bottom = (r?.bottom ?? win.h) - floatBox.inset;
      const y0 = top + floatBox.inset;
      const tall = bottom - y0;
      // under Tools, Information keeps the rest: Tools takes a little over half
      const toolsH = Math.max(
        floatBox.bar,
        Math.min(
          floatBox.bar + PANEL_ROW * (chainCount + TOOLS_ROWS),
          infoUnder ? tall * 0.55 : tall,
        ),
      );
      const tools = { x: left, y: y0, w: PANEL_W, h: toolsH };
      if (infoUnder) {
        // folded, Tools is its bar alone, and Information starts right under it
        const y = y0 + (listOpen ? toolsH : barOf(toolsEl.current)) + floatBox.gap;
        return { tools, info: { x: left, y, w: PANEL_W, h: Math.max(floatBox.bar, bottom - y) } };
      }
      const w = Math.min(floatBox['panel-width'], right - left);
      const h = Math.max(floatBox.bar, Math.min(floatBox['panel-height'], tall));
      // where the room was narrow (a phone), its bar sits at the room's foot, clear of the flower and of Tools;
      // opened there, it rises from the foot
      const y = low ? bottom - (claimsOpen ? h : barOf(infoEl.current)) : y0;
      return { tools, info: { x: right - w, y, w, h } };
    },
    [chainCount, infoUnder, listOpen, claimsOpen, low],
  );
  const panels = useFloatBoxes(PANELS, place, {
    top: () => room.current?.getBoundingClientRect().top ?? 0,
    snap: true,
    edge: panelEdge,
  });
  // Tools is the box the map measures (the aside: the arrows' names keep clear of it), and both are the boxes
  // the hand holds
  const toolsRoot = useCallback(
    (el: HTMLElement | null) => {
      toolsEl.current = el;
      panels.tools.root(el);
    },
    [panels.tools],
  );
  const infoRoot = useCallback(
    (el: HTMLElement | null) => {
      infoEl.current = el;
      panels.info.root(el);
    },
    [panels.info],
  );
  useLayoutEffect(() => {
    if (movable) aside.current = toolsEl.current;
  });
  // folded, a box is its bar; open, the height it had
  useEffect(() => {
    if (movable) panels.tools.fold(listOpen ? null : barOf(toolsEl.current));
  }, [movable, panels.tools, listOpen]);
  useEffect(() => {
    if (movable) panels.info.fold(claimsOpen ? null : barOf(infoEl.current));
  }, [movable, panels.info, claimsOpen]);
  // Tools offers only what draws ('Who backs it' on a DAO with no delegations would draw nothing): the data
  // some DAOs have (who backs a wallet, its activity) only where the DAO you're in has it, or on the whole map where
  // some DAO on this chain does; what every flower has, and a person's own names, always. Unknown (an older server):
  // all of it, as before.
  const offered = useMemo(() => {
    if (!hands) return undefined;
    const here = inFlower ? [inFlower] : data.flowers.filter((f) => f.place.chain === chain);
    return {
      ...hands,
      choices: onlyWhatDraws(
        hands.choices,
        here.map((f) => f.pieces),
      ),
    };
  }, [hands, inFlower, data.flowers, chain]);
  const legendBody = (bare: boolean) => (
    <ViewLegend
      view={person.view}
      // what each dimension draws, among everything Tools offers (a map's activity, a person's names), so Colour's
      // keys list a piece's values ('voted', 'never voted'), not only the reading's own pieces'
      drawn={inUse(person.view, CHOOSABLE)}
      pieces={EVERY_FLOWER}
      // each flower keys its own kinds by how common they are on it: inside one, its key (core's
      // flowerKeys, what its fills paint); on the map, no one key, so it says so
      // one colour per value across the map (core mapKeys): inside a flower, its own values in the map's colours;
      // on the map, what each colour stands for everywhere
      keys={inFlower ? flowerKeys(inFlower.reading.petals, mapKeyed) : keyLines(mapKeyed)}
      keysNote={inFlower || mapKeyed.length > 0 ? undefined : panelWords.legendColours}
      gradeKeys={gradeKeys ?? undefined}
      // what a line between two flowers is, for anyone who doesn't know; in Information
      // on the map's boxes, as what's seen, not a tool
      between={
        bare ? undefined : { label: panelWords.legendLines, says: panelWords.legendLinesSay }
      }
      // how much the map's flowers draw together (gravity), for the visit
      gravity={{ value: gravity, onChange: setGravity }}
      worth={{ on: worth, onChange: setWorth }}
      // the map's own controls back as they came, from the same 'Put the default back' as the view's
      resetMap={
        gravity !== GRAVITY_DEFAULT || span !== 'all' || !worth || !insightsOn || bloc !== null
          ? () => {
              setGravity(GRAVITY_DEFAULT);
              setSpan('all');
              setWorth(true);
              setInsightsOn(true);
              setBloc(null);
            }
          : undefined
      }
      // Insights in Information, on or off by hand, on the map's boxes
      insights={bare ? { on: insightsOn, onChange: setInsightsOn } : undefined}
      edit={offered}
      // on the map's boxes the rows stay outside a flower too, with nothing to choose yet (one menu)
      groups={
        inFlower || bare
          ? {
              choices,
              chosen: bloc,
              span,
              period: blocs && inFlower ? periodWords(blocs) : '',
              elsewhere: !!blocs && blocs.blocs.length > 0 && choices.length === 0,
              onChoose: setBloc,
              // other votes are other blocs: the chosen one goes with them
              onSpan: (s) => {
                setSpan(s);
                setBloc(null);
              },
              away: !inFlower,
            }
          : undefined
      }
      fold={{ open: legendOpen, onToggle: () => setLegendOpen((now) => !now) }}
      bare={bare}
    />
  );
  const claimsBody = (bare: boolean) => (
    <MapClaims
      groups={claimGroups}
      open={openClaim}
      onOpen={(key) => setOpenClaim((now) => (now === key ? null : key))}
      empty={wallet ? mapClaimWords.noneAboutWallet : undefined}
      fold={{ open: claimsOpen, onToggle: () => setClaimsOpen((now) => !now) }}
      bare={bare}
    />
  );

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
          onWallet={walletChosen}
          onCentre={setCentre}
          onProposal={proposalPinned}
          clearOfChains={clearOfChains}
          highlight={lit}
          worth={worth}
          go={go?.chain === chain ? go : null}
          show={shownOn?.chain === chain ? shownOn.show : undefined}
          pending={pendingHere}
          progress={progressHere}
          unlabelled={latestView(person.view).dimensions.labels === null}
        />
      )}
      {movable ? (
        <>
          {/* the room the map's boxes stand in: its top and its size are read from here */}
          <div ref={room} aria-hidden="true" className="pointer-events-none absolute inset-0" />
          {/* The map's boxes move, snap and resize, as the workspace's do. Two boxes: Tools, all a hand
              changes, one menu the same everywhere, inside a flower or out (learnt once, the same ever
              after): the search, the chains, the dimensions, the map's own;
              and Information: what the page says about where it is, Insights, and what's seen on the map. */}
          <FloatBox
            label={panelWords.tools}
            title={listOpen || !shown ? panelWords.tools : `${panelWords.tools} · ${shown.label}`}
            hand={{ ...panels.tools, root: toolsRoot }}
            folded={!listOpen}
            control={
              <IconButton
                icon={listOpen ? 'down' : 'chevron'}
                label={listOpen ? panelWords.boxFold : panelWords.boxOpen}
                tip="right"
                expanded={listOpen}
                onClick={() => setListOpen((now) => !now)}
              />
            }
          >
            {/* the search, then the chains under their head, then the view's sections (ViewLegend) */}
            <div className="flex flex-col px-space-8 pt-space-8">
              {searchRow}
              {chainList && (
                <>
                  <SectionHead
                    size="panel"
                    title={panelWords.toolsChains}
                    fold={{ open: chainsOpen, onToggle: () => setChainsOpen((now) => !now) }}
                  />
                  {chainsOpen && <div className="py-space-4">{chainList}</div>}
                </>
              )}
            </div>
            {legend && legendBody(true)}
          </FloatBox>
          {legend && (
            <FloatBox
              label={panelWords.information}
              title={panelWords.information}
              hand={{ ...panels.info, root: infoRoot }}
              folded={!claimsOpen}
              control={
                <IconButton
                  icon={claimsOpen ? 'down' : 'chevron'}
                  label={claimsOpen ? panelWords.boxFold : panelWords.boxOpen}
                  tip={infoUnder ? 'right' : 'left'}
                  expanded={claimsOpen}
                  onClick={() => setClaimsOpen((now) => !now)}
                />
              }
            >
              {/* each part under its head, the heads edge to edge (SectionHead's panel size) */}
              <div className="flex flex-col pb-space-8">
                {chosenWallet && (
                  <div className="flex flex-col px-space-8">
                    <SectionHead size="panel" title={walletWords.title} />
                    <div className="px-space-8 py-space-8">
                      <WalletFacts
                        view={{
                          ...walletView(chosenWallet, card?.value),
                          differs: differsOf(creditRead?.credit, chosenWallet.id, (w) =>
                            panelWords.settings.piece(w),
                          ),
                        }}
                      />
                    </div>
                  </div>
                )}
                {pinned && (
                  <div className="flex flex-col px-space-8">
                    <SectionHead size="panel" title={proposalWords.title} />
                    <div className="px-space-8 py-space-8">
                      <MapProposal view={proposalView(pinned)} />
                    </div>
                  </div>
                )}
                {information && (
                  <div className="flex flex-col px-space-8">
                    <SectionHead size="panel" title={information.title} />
                    <div className="flex flex-col gap-space-4 px-space-8 py-space-8">
                      {information.body}
                    </div>
                  </div>
                )}
                {strataLayers && strataLayers.length > 0 ? (
                  // the map's layers as strata, each switchable
                  <div className="flex flex-col px-space-8">
                    <SectionHead size="panel" title={strataWords.title} />
                    <div className="px-space-8 py-space-8">
                      <MapStrata
                        layers={strataLayers}
                        on={
                          new Set(strataLayers.map((l) => l.id).filter((id) => !layersOff.has(id)))
                        }
                        onToggle={(id) =>
                          setLayersOff((now) => {
                            const next = new Set(now);
                            if (next.has(id)) next.delete(id);
                            else next.add(id);
                            return next;
                          })
                        }
                        joined={joinedHere}
                        swatches={swatches}
                        version={
                          wholeRead?.rule && wholeRead.composed_from
                            ? { rule: wholeRead.rule, from: wholeRead.composed_from }
                            : undefined
                        }
                      />
                      {card?.differs ? (
                        <p className="my-0 pt-space-8 type-ui text-muted">
                          {strataWords.differs(card.differs)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  layers.length > 0 && (
                    <div className="flex flex-col px-space-8">
                      <SectionHead size="panel" title={layerWords.title} />
                      <div className="px-space-8 py-space-8">
                        <MapLayers layers={layers} />
                      </div>
                    </div>
                  )
                )}
                {showClaims && insightsOn && (
                  <>
                    <div className="flex flex-col px-space-8">
                      <SectionHead size="panel" title={mapClaimWords.folded(claimCount)} />
                    </div>
                    {claimsBody(true)}
                  </>
                )}
                <div className="flex flex-col px-space-8">
                  <SectionHead size="panel" title={panelWords.infoSeen} />
                  {/* each mark on the map, far to near: its name, quiet, then what it is */}
                  <dl className="my-0 flex flex-col gap-space-8 px-space-8 py-space-8">
                    {panelWords.seen.map((m) => (
                      <div key={m.label} className="flex flex-col">
                        <dt className="type-ui text-muted">{m.label}</dt>
                        <dd className="m-0 type-ui text-primary">{m.says}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </FloatBox>
          )}
        </>
      ) : (
        /* The landing's map scrolls with its page, so its overlays stay a column down the left: the chain list,
           then the legend under it. The aside is the chain list's own outermost box; inside a flower it's
           invisible, not gone, and the legend rises in its place. */
        <div
          className={`${fill === 'window' ? 'fixed' : 'absolute'} top-space-16 left-space-16 flex flex-col items-start gap-space-8`}
        >
          <div
            ref={(el) => {
              aside.current = el;
            }}
            className={inside && !search ? 'invisible absolute top-0 left-0' : ''}
          >
            <Overlay
              title={chainTitle}
              fold={{ open: listOpen, onToggle: () => setListOpen((now) => !now) }}
            >
              {chainRows}
            </Overlay>
          </div>
          {legend && legendBody(false)}
          {showClaims && claimsBody(false)}
        </div>
      )}
    </>
  );
}

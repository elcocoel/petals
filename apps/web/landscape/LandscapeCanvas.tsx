'use client';
// The map, live (specs/006-the-map, bench v2): one chain at a time, chosen down the left as on an exchange,
// and an empty SVG for that chain's scene and its live flowers to draw in, filling the window, or the area
// under the site's nav on the Power Map (app/(canvas)/map). Each
// flower's drawing model is made here from its reading, once. The words are the data's: each chain's name
// and how many flowers it has. The chain list is one of the overlays (design/overlays.md, line 7; #95): on a
// phone it starts folded to its bar with the chain on show, so it never covers the map (META, 11 Nov: at 390
// wide it did, on the landing and the hero); pressing the bar opens it, and choosing a chain folds it again.
// Where a page asks, the legend is the other overlay, under the chain list: the person's view as a key (#92);
// and inside a flower, under it, what Petals' own mapping says about that map, folded until asked. Where a page
// asks (the Power Map), a search field tops the chain list, and while something's typed the maps it finds stand
// in the chains' place; pressing one goes to its chain and into its flower (board 105).
import { EVERY_FLOWER, inUse } from '@petal/core/view';
import { flowerKeys } from '@petal/core/wedge/keys';
import { floatBox } from '@petal/tokens';
import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { MapClaims } from '../components/MapClaims.tsx';
import { MapSearch } from '../components/MapSearch.tsx';
import { FloatBox } from '../components/ui/FloatBox.tsx';
import { IconButton } from '../components/ui/IconButton.tsx';
import { NavItem } from '../components/ui/NavItem.tsx';
import { Overlay } from '../components/ui/Overlay.tsx';
import { ViewLegend } from '../components/ViewLegend.tsx';
import { type FlowerReading, modelOf } from '../flower/model.ts';
import { type BlocSpan, blocChoices, periodWords } from '../lib/bloc-words.ts';
import type { Rect, Size } from '../lib/float-box.ts';
import { mapClaimGroups, mapClaimWords } from '../lib/map-claims.ts';
import { MAP_SEARCH_ID, mapSearchWords, type SearchRow, searchRows } from '../lib/map-search.ts';
import type { CanvasHit } from '../lib/panel-view.ts';
import { panelWords } from '../lib/panel-words.ts';
import type { LegendEdit } from '../lib/view-edit.ts';
import { useFloatBoxes } from '../viewmodels/useFloatBoxes.ts';
import { useLegendEdit } from '../viewmodels/useLegendEdit.ts';
import { useMapBlocs } from '../viewmodels/useMapBlocs.ts';
import { useMapClaims } from '../viewmodels/useMapClaims.ts';
import { useMapSearch } from '../viewmodels/useMapSearch.ts';
import { usePersonView } from '../viewmodels/usePersonView.ts';
import { useSession } from '../viewmodels/useSession.ts';
import {
  type Continent,
  GRAVITY_DEFAULT,
  type Place,
  ringsAround,
  spreadOf,
  spreadPlace,
} from './places.ts';
import type { Road } from './roads.ts';
import type { FarStyle, LandFlower, LineStyle } from './scene.ts';
import { reachOf } from './space.ts';
import { idOf, type LandscapeAt, type LandscapeData, useLandscape } from './useLandscape.ts';

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
  /** its map's treasury and token price, in words, where its card has them (Elco, 12 Nov walk 3) */
  worth?: readonly string[] | undefined;
}

/** A wallet chosen on the map (LOOK's wallet level): its id as its flower names it, on that flower's chain. */
export interface MapWallet {
  id: string;
  chain: string;
  /** the flower it was chosen in */
  flower: string;
}

export interface CanvasChain {
  chain: string;
  label: string;
  /** its logo, round before its name in the chain list (Elco, 11 Nov: "we need the logo of the chains") */
  logo?: string | null | undefined;
  continent: Continent;
}

/** The map's floating boxes (Elco, 12 Nov: "move these things just like we did in the workspace"). */
const PANELS = ['chains', 'legend', 'insights'] as const;
type Panel = (typeof PANELS)[number];
/** A panel row's height, and where the legend and Insights start: as tall as their rows mostly are. */
const PANEL_ROW = 32;
/** The overlays' width, as the column's (w-tile-width). */
const PANEL_W = 280;
const LEGEND_H = 440;
const INSIGHTS_H = 320;
/** The least an opened Insights takes under the legend. */
const INSIGHTS_LEAST = 200;
/** A floating box folded to its bar: the bar's own height and the box's edge (FloatBox's bar is a control high, padded). */
const BAR_FOLDED = 66;

/** How tall a floating box is folded to its bar: its bar as drawn, with the box's edge; or the bar's usual height. */
function barOf(box: HTMLElement | null): number {
  const bar = box?.querySelector<HTMLElement>('[data-b="box"] > :first-child');
  return bar ? bar.offsetHeight + 2 : BAR_FOLDED;
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
  onWallet,
  onCentre,
  clearOfChains,
  highlight,
  go,
  worth,
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
  clearOfChains: boolean;
  /** the chosen group's petals to highlight inside the flower you're in (#94), or null */
  highlight: readonly string[] | null;
  /** a flower to go into, by its place on this chain's map (a search's answer, pressed), or null */
  go: { at: number } | null;
  /** treasury and token price under the names at some magnification (the legend's switch) */
  worth: boolean;
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
    clearOfChains,
    worth,
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
  return (
    // surface.canvas
    <svg
      ref={svg}
      role="img"
      aria-label="Power Map"
      // in a page it lies on the page's own ground, with no box of its own (the landing, Elco, 12 Nov)
      className={`${fill === 'window' ? 'fixed' : 'absolute'} inset-0 block size-full ${inPage ? 'touch-pan-y' : 'touch-none bg-surface'} select-none`}
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
  search = false,
  panelEdge,
  onWallet,
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
   * only; changing the view where it's handed Settings' hands (/make); or 'edit', with its own (the Power Map).
   */
  legend?: 'read' | 'edit' | LegendEdit | null;
  /** a search field at the top of the chain list (board 105; the Power Map) */
  search?: boolean;
  /**
   * Where /make's side panel ends (0 with none): the map's boxes snap beside it and move with it, as every box
   * on /make does (WORKSPACE's room rule, Elco's walk 5). Left out on /map, /m and /f.
   */
  panelEdge?: number | undefined;
  /**
   * Told which wallet is chosen, by a press on its petal inside a flower (LOOK's wallet level), and when it's let
   * go, its chain left or the map gone (null): /make asks Petals' agent about it (Elco, 12 Nov: "a place to
   * interact with it via the agent and find out more about it").
   */
  onWallet?: ((wallet: MapWallet | null) => void) | undefined;
}) {
  const person = usePersonView();
  // 'edit' (the Power Map, Elco, 11 Nov: "switch the legends live and watching the map adapt"): Settings' own
  // hands for someone signed in, whose view is kept; a visitor's can't be, so theirs reads only
  const ownHands = useLegendEdit();
  const session = useSession(legend === 'edit');
  const hands =
    legend === 'edit'
      ? session.account
        ? ownHands
        : undefined
      : legend === 'read'
        ? undefined
        : legend;
  const aside = useRef<HTMLElement | null>(null);
  // the map's panels float, move, snap and size (Elco, 12 Nov) wherever the map fills its page; the landing's
  // map scrolls with its page, so there they stay a column
  const movable = !inPage;
  const room = useRef<HTMLDivElement>(null);
  const opened = data.flowers[focus]?.place.chain;
  const [chain, setChain] = useState(
    opened ?? (data.chains.some((c) => c.chain === FIRST) ? FIRST : (data.chains[0]?.chain ?? '')),
  );
  // the overlays' folds: open where the map has room, folded to their bars where it's narrow, a phone's or
  // /make's beside the conversation (WORKSPACE's walk, 11 Nov): its own room, not the window's
  const [listOpen, setListOpen] = useState(true);
  const [legendOpen, setLegendOpen] = useState(true);
  const narrow = useCallback(
    () =>
      ((movable ? room.current?.clientWidth : roomOf(aside.current)) ?? window.innerWidth) < ROOM,
    [movable],
  );
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
  // the group chosen in the legend's Highlight row (#94), lit inside the flower; leaving it clears it
  const [bloc, setBloc] = useState<string | null>(null);
  // the wallet chosen on the map (the wallet level, Elco, 11 Nov: "Its insights"): Insights says what's said about it
  const [wallet, setWallet] = useState<string | null>(null);
  // all their votes first: the recent ones hold no bloc on most maps (Elco, 11 Nov: "do something reasonable")
  const [span, setSpan] = useState<BlocSpan>('all');
  const toldInside = useCallback((yes: boolean, at: number) => {
    setInside(yes);
    setEntered(yes ? at : -1);
    if (!yes) {
      setBloc(null);
    }
  }, []);
  const finding = useMapSearch();
  // the flower a search's answer goes into, by its chain and its place on that chain's map
  const [go, setGo] = useState<{ chain: string; at: number } | null>(null);
  const [claimsOpen, setClaimsOpen] = useState(false);
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
  // Cmd+K (Ctrl+K off a Mac) opens the list and puts the cursor in the search (Elco, 12 Nov: "a standard shortcut")
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
  // Gravity: how close the flowers on a chain sit (OVERLAYS hands it the legend's control)
  const [gravity, setGravity] = useState(GRAVITY_DEFAULT);
  // treasury and token price under the names at some magnification (Elco, 12 Nov walk 3), switched in the legend
  const [worth, setWorth] = useState(true);
  // the chain's flowers and their drawing models, once per chain; gravity only moves their places
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
        mark: f.mark,
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
    return { flowers, roads, home: { cx: x, cy: y, r }, focus: at.get(focus) ?? -1, from };
  }, [data, chain, focus]);
  // the DAO a click put in the middle, by its map (Elco, 12 Nov walk: "one click put something in the center"); the
  // rest arranged round it by the wallets they share with it
  const [centre, setCentre] = useState<string | null>(null);
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
  // the wallet chosen, with the flower it was chosen in, for the page
  const toldWallet = useRef(onWallet);
  toldWallet.current = onWallet;
  const inNow = useRef(inFlower);
  inNow.current = inFlower;
  const walletChosen = useCallback((id: string | null) => {
    // Insights opens on what's said about it (OVERLAYS), then the page is told (WORKSPACE)
    setWallet(id);
    if (id) setClaimsOpen(true);
    const f = inNow.current;
    toldWallet.current?.(id && f ? { id, chain: f.place.chain, flower: f.name } : null);
  }, []);
  const claims = useMapClaims(legend ? (inFlower?.map ?? null) : null);
  const blocs = useMapBlocs(legend ? (inFlower?.map ?? null) : null, span);
  const choices = useMemo(() => (blocs ? blocChoices(blocs) : []), [blocs]);
  const lit = useMemo(() => choices.find((c) => c.id === bloc)?.members ?? null, [choices, bloc]);
  const claimGroups = useMemo(() => {
    if (!claims || claims.length === 0 || !inFlower) return [];
    const names = new Map(
      inFlower.reading.petals.filter((p) => !p.tail).map((p) => [p.id, p.name] as const),
    );
    // a chosen wallet's insights alone (Elco, 11 Nov: "Its insights")
    const about = wallet ? claims.filter((c) => c.subject === wallet) : claims;
    return mapClaimGroups(about, names, selected);
  }, [claims, inFlower, selected, wallet]);

  // the chain list's words and rows, the legend and Insights: one each, in a floating box or in the column
  const chainTitle =
    !listOpen && shown ? `${title ?? 'Power Map'} · ${shown.label}` : (title ?? 'Power Map');
  const chainRows = (
    <>
      {search && (
        <MapSearch
          q={finding.q}
          onType={finding.type}
          onOrder={finding.order}
          onClear={finding.clear}
          rows={found}
          status={searchStatus}
          onGo={goTo}
        />
      )}
      {/* while something's typed, what it finds stands in the chains' place */}
      {!(search && (finding.q.trim() || inside)) && (
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
      )}
    </>
  );
  const showClaims = Boolean(legend && inside && (claimGroups.length > 0 || (wallet && claims)));
  const claimCount = claimGroups.reduce((n, g) => n + g.lines.length, 0);
  // where each box starts: down the room's left, the chain list, the legend under it, Insights under that,
  // each as tall as its rows or the room leaves it; a hand moves and sizes them for the visit
  const chainCount = data.chains.length;
  const chainsClosed = inside && !search;
  const place = useCallback(
    (win: Size): Record<Panel, Rect> => {
      const r = room.current?.getBoundingClientRect() ?? null;
      const top = r?.top ?? 0;
      const left = (r?.left ?? 0) + floatBox.inset;
      const bottom = (r?.bottom ?? win.h) - floatBox.inset;
      const w = PANEL_W;
      const y0 = top + floatBox.inset;
      // inside a flower without a search the chain list is closed, and the legend starts where it stood
      const chainsH = Math.min(
        floatBox.bar + PANEL_ROW * (chainCount + 3),
        Math.max(floatBox.bar, (bottom - y0) * 0.45),
      );
      // folded, the chain list is its bar alone, and the legend starts right under it
      const legendY = chainsClosed ? y0 : y0 + (listOpen ? chainsH : BAR_FOLDED) + floatBox.gap;
      // inside a flower the legend leaves Insights room enough to open below it, inside the window; on the map
      // there's no Insights, so the legend has the room
      const legendH = Math.max(
        floatBox.bar,
        Math.min(LEGEND_H, bottom - legendY - (inside ? INSIGHTS_LEAST + floatBox.gap : 0)),
      );
      const insightsY = legendY + legendH + floatBox.gap;
      return {
        chains: { x: left, y: y0, w, h: chainsH },
        legend: { x: left, y: legendY, w, h: legendH },
        insights: {
          x: left,
          y: insightsY,
          w,
          h: Math.max(floatBox.bar, Math.min(INSIGHTS_H, bottom - insightsY)),
        },
      };
    },
    [chainCount, chainsClosed, inside, listOpen],
  );
  const panels = useFloatBoxes(PANELS, place, {
    top: () => room.current?.getBoundingClientRect().top ?? 0,
    snap: true,
    edge: panelEdge,
  });
  // the box the map measures (the aside: the arrows' names keep clear of it) is the chain list's, or the legend's
  // while the chain list is closed inside a flower; both are the boxes the hand holds
  const chainsEl = useRef<HTMLElement | null>(null);
  const legendEl = useRef<HTMLElement | null>(null);
  const chainsRoot = useCallback(
    (el: HTMLElement | null) => {
      chainsEl.current = el;
      panels.chains.root(el);
    },
    [panels.chains],
  );
  const insightsEl = useRef<HTMLElement | null>(null);
  const insightsRoot = useCallback(
    (el: HTMLElement | null) => {
      insightsEl.current = el;
      panels.insights.root(el);
    },
    [panels.insights],
  );
  const legendRoot = useCallback(
    (el: HTMLElement | null) => {
      legendEl.current = el;
      panels.legend.root(el);
    },
    [panels.legend],
  );
  useLayoutEffect(() => {
    if (movable) aside.current = chainsClosed ? legendEl.current : chainsEl.current;
  });
  // folded, a box is its bar; open, the height it had
  useEffect(() => {
    if (movable) panels.chains.fold(listOpen ? null : barOf(chainsEl.current));
  }, [movable, panels.chains, listOpen]);
  useEffect(() => {
    if (movable) panels.legend.fold(legendOpen ? null : barOf(legendEl.current));
  }, [movable, panels.legend, legendOpen]);
  useEffect(() => {
    if (movable) panels.insights.fold(claimsOpen ? null : barOf(insightsEl.current));
  }, [movable, panels.insights, claimsOpen]);
  const legendBody = (bare: boolean) => (
    <ViewLegend
      view={person.view}
      drawn={inUse(person.view, EVERY_FLOWER)}
      pieces={EVERY_FLOWER}
      // each flower keys its own kinds by how common they are on it (#76): inside one, its key (core's
      // flowerKeys, what its fills paint); on the map, no one key, so it says so
      keys={inFlower ? flowerKeys(inFlower.reading.petals) : []}
      keysNote={inFlower ? undefined : panelWords.legendColours}
      // what a line between two flowers is, for anyone who doesn't know (Elco, 12 Nov, walk 2)
      between={{ label: panelWords.legendLines, says: panelWords.legendLinesSay }}
      // how much the map's flowers draw together (Elco, 12 Nov, walk 2: "gravity"), for the visit
      gravity={{ value: gravity, onChange: setGravity }}
      worth={{ on: worth, onChange: setWorth }}
      edit={hands ?? undefined}
      groups={
        inFlower && blocs
          ? {
              choices,
              chosen: bloc,
              span,
              period: periodWords(blocs),
              onChoose: setBloc,
              // other votes are other blocs: the chosen one goes with them
              onSpan: (s) => {
                setSpan(s);
                setBloc(null);
              },
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
          clearOfChains={clearOfChains}
          highlight={lit}
          worth={worth}
          go={go?.chain === chain ? go : null}
        />
      )}
      {movable ? (
        <>
          {/* the room the map's boxes stand in: its top and its size are read from here */}
          <div ref={room} aria-hidden="true" className="pointer-events-none absolute inset-0" />
          {/* Elco, 12 Nov: "I want to be able to move these things just like we did in the workspace and they
              should snap ... I want to be able to resize them": the chain list (with the search, which never
              goes), the legend and Insights are the workspace's floating boxes. The chain list's box is the
              aside, so the arrows' names keep clear of it; inside a flower it's closed unless it holds the search. */}
          <FloatBox
            label={chainTitle}
            title={chainTitle}
            hand={{ ...panels.chains, root: chainsRoot }}
            folded={!listOpen}
            closed={chainsClosed}
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
            <div className="flex flex-col px-space-8 py-space-8">{chainRows}</div>
          </FloatBox>
          {legend && (
            <FloatBox
              label={panelWords.legend}
              title={panelWords.legend}
              hand={{ ...panels.legend, root: legendRoot }}
              folded={!legendOpen}
              control={
                <IconButton
                  icon={legendOpen ? 'down' : 'chevron'}
                  label={legendOpen ? panelWords.boxFold : panelWords.boxOpen}
                  tip="right"
                  expanded={legendOpen}
                  onClick={() => setLegendOpen((now) => !now)}
                />
              }
            >
              {legendBody(true)}
            </FloatBox>
          )}
          {legend && (
            <FloatBox
              label={mapClaimWords.title}
              title={claimsOpen ? mapClaimWords.title : mapClaimWords.folded(claimCount)}
              hand={{ ...panels.insights, root: insightsRoot }}
              folded={!claimsOpen}
              closed={!showClaims}
              control={
                <IconButton
                  icon={claimsOpen ? 'down' : 'chevron'}
                  label={claimsOpen ? panelWords.boxFold : panelWords.boxOpen}
                  tip="right"
                  expanded={claimsOpen}
                  onClick={() => setClaimsOpen((now) => !now)}
                />
              }
            >
              {claimsBody(true)}
            </FloatBox>
          )}
        </>
      ) : (
        /* The landing's map scrolls with its page, so its overlays stay a column down the left: the chain list,
           then the legend under it. The aside is the chain list's own outermost box; inside a flower it's
           invisible, not gone (LOOK), and the legend rises in its place. */
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

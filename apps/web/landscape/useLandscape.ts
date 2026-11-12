// The map's ViewModel (specs/006-the-map, bench v2): one requestAnimationFrame loop that sleeps when nothing
// moves, one camera over one chain's flowers, and the pointer, wheel and keyboard wired into it. Far flowers
// are drawn by the map's scene; a flower big enough on screen comes alive as itself (flower/drive.ts), with
// its view worked out from the map's camera. A click on a flower, or zooming in until it fills most of the
// window, enters it: everything else fades, and arrows name the ways out. Esc, or zooming back out, leaves.
// React mounts this once per chain and never renders per frame.
import { type Keyed, lookFills } from '@petal/core/wedge/keys';
import type { Proposal } from '@petal/core/wedge/votes';
import { type RefObject, useEffect, useRef } from 'react';
import {
  type Camera,
  type Clear,
  clearSides,
  fitView,
  flyTo,
  type Home,
  letGo,
  NO_CLEAR,
  newCamera,
  panBy,
  resize,
  stepCamera,
  zoomWheel,
} from '../flower/camera.ts';
import { DETAIL, fade, ramp } from '../flower/detail.ts';
import { type Driven, driveFlower, newDriven } from '../flower/drive.ts';
import {
  CLICK_LONGEST,
  CLICK_SLOP,
  FIT,
  PINCH_GAIN,
  PRESENCE,
  ZOOM_LIMITS,
} from '../flower/feel.ts';
import { clickedAt } from '../flower/live.ts';
import { SHAPE } from '../flower/ring.ts';
import type { PetalLook } from '../flower/scene.ts';
import { advance, SNAP, spring, stepOf } from '../flower/spring.ts';
import { readMapProposals, readShared } from '../lib/agent-client.ts';
import type { CanvasHit } from '../lib/panel-view.ts';
import { type VoteRing, voteRing } from '../lib/vote-ring.ts';
import { type Road, roadWidth } from './roads.ts';
import {
  type ArrowHit,
  type Box,
  createLandScene,
  type FarStyle,
  type LandFlower,
  type LineStyle,
  roadEnds,
  WALLET_AWAY,
} from './scene.ts';
import {
  ENTER_AT,
  fitScale,
  flowerAt,
  flowerView,
  LEAVE_AT,
  liveSet,
  screenCentre,
  screenRadius,
  toSegment,
} from './space.ts';

export interface LandscapeData {
  flowers: LandFlower[];
  roads: Road[];
  home: Home;
  /** the DAO in the middle, by its index here, or -1 */
  centre?: number;
  /** which arrangement the places are: a new one is fitted to, the same one keeps the camera where it is */
  layout?: string;
  /**
   * The map's keys, ranked once over every flower (core mapKeys): a value has one colour on every flower, so the
   * map's legend can say what each colour stands for (Elco, 12 Nov). Without, each flower its own.
   */
  keyed?: readonly Keyed[];
}

/**
 * A page that opens the map at one flower (coordinator/one-source.md, step 6): which flower it opens in, and
 * what a click inside that flower tells the page, as a flower's own canvas does (flower/FlowerCanvas.tsx).
 * `choose` is set by the map, so the page can mark a petal without the scene being built again.
 */
/** What the page shows on the map, by each flower's place on this chain's map (LandscapeCanvas resolves it). */
export type LandShow =
  | { kind: 'map'; i: number }
  | { kind: 'wallet'; id: string }
  | { kind: 'line'; a: number; b: number }
  | { kind: 'proposal'; i: number; id: string };

export interface LandscapeAt {
  focus: number;
  onPick?: (hit: CanvasHit) => void;
  choose?: (id: string | null) => void;
  /** Inside a page that scrolls (the landing): the wheel scrolls the page unless Ctrl or ⌘ is held, or a pinch. */
  inPage?: boolean;
  /** How a far flower is drawn: the lab's far wave (#84), or its silhouette. Read when the scene is built. */
  far?: FarStyle;
  /** When connections show: the lab's lines lean (#87), or as always. Read when the scene is built. */
  lines?: LineStyle;
  /** Told when the map goes into a flower and when it comes out of it (#78: the chains step aside inside). */
  inside?: (yes: boolean, at: number) => void;
  /**
   * The map's home keeps clear of the chain list down its left, measured from `aside` (a page where the map's
   * room is narrow: /make, #78). Off, the home fills the whole map, as on /map. Read when the scene is built.
   */
  clearOfChains?: boolean;
  /**
   * Set by the map once it's built, as `choose` is: the wallets (petal ids) to highlight inside the flower you're
   * in (#94: the chosen bloc, from the legend's Highlight row), or null for none. They stay on that flower until
   * the next call.
   */
  highlight?: (ids: readonly string[] | null) => void;
  /**
   * Set by the map once it's built, as `enter` is: shows what the page's conversation is about (Elco, 12 Nov on
   * /make: "the power map should always be there ... an answer moves the map"), with the four clicks' own states:
   * a DAO flown to and entered; a wallet lit everywhere it sits, the camera taking in the DAOs that hold it; the line
   * between two DAOs lit; a proposal pinned in its DAO. null lets go of what it lit.
   */
  show?: (s: LandShow | null) => void;
  /** A new map's placeholder on this chain's map, read on each frame (LandscapeCanvas places it). */
  pending?: { x: number; y: number; s: number; name: string } | null;
  /** Work running on a map, read on each frame: a strip under that flower, or under the placeholder. */
  progress?: { at: number | 'pending' | 'map'; words: string; share: number | null } | null;
  /** Set by the map once it's built: the camera flies to take in this room (a placeholder's). */
  fit?: (room: { cx: number; cy: number; r: number }) => void;
  /**
   * Set by the map once it's built, as `choose` is: flies to a flower, by its place on this chain's map, and
   * enters it, as a click on it does (board 105: a search's answer, pressed).
   */
  enter?: (i: number) => void;
  /**
   * The wallet level (Elco, 11 Nov: "Where it sits everywhere", "Its votes"): told when a wallet is chosen, by a
   * press on its petal inside the flower you're in, and when it's let go (null), so the page can show what's known
   * about it.
   */
  onWallet?: (id: string | null) => void;
  /**
   * Told which DAO a click puts in the middle (Elco, 12 Nov walk: "one click put something in the center"), by its
   * map, or null to put the saved map back; the page arranges the rest round it.
   */
  onCentre?: (id: string | null) => void;
  /**
   * Told which proposal a click pins, by its flower (as `onCentre` names it) and its id, with the proposal as the
   * ring read it (the server's whole object, proposals/v3's summary and link with it), and when it's let go (null),
   * so the page can say what it's about (OVERLAYS's Information box; Elco, 12 Nov walk 3 on Ref Finance).
   */
  onProposal?: (p: { flower: string; id: string; proposal: Proposal | null } | null) => void;
  /** Treasury and token price under the names at some magnification (Elco, 12 Nov walk 3); on unless off. */
  worth?: boolean;
  /** Labels None in the view: the petals say nothing, but the one pointed at (VISUAL QA, 12 Nov). */
  unlabelled?: boolean;
  /** Set by the map once it's built: draws it again, for a change it reads on each frame (`worth`). */
  redraw?: () => void;
}

const LONGEST_FRAME = 1 / 15;
const LONGEST_THROW = 2400;
/** The way out goes a little past the whole chain, so its edge shows. */
const FARTHEST = 0.6;

const quiet = () => window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * How far in from the chain's home the far wave hands over to petals, for every flower at once (Elco, 12 Nov walk:
 * "we have to hold on to the mini shape longer until I'm actually focusing on one or another group of dowels"): at
 * four times the home's zoom, over a short stretch so the mid-state where both show is brief.
 */
export const FAR_HOLD: readonly [number, number] = [3.6, 4.4];

/** The far wave's share of every flower now: 1 at the chain's home and out to FAR_HOLD, 0 past it. */
export function farOf(cam: Camera, home: Home): number {
  const k = fitView(cam.width, cam.height, home, cam.clear).k;
  return 1 - ramp(FAR_HOLD[0], FAR_HOLD[1], cam.k / (k || 1));
}

/** A flower, by the map it stands for, so it's found again in new data. */
export const idOf = (f: LandFlower | undefined): string | null =>
  f ? (f.map ?? f.snapshot ?? f.name) : null;

/** Where the map was when its scene was last taken down: the camera, the flower you were in, the page's own. */
interface Kept {
  view: { k: number; x: number; y: number };
  entered: string | null;
  focus: string | null;
  layout: string | undefined;
  /** where each flower stood, by its map, so a new arrangement glides in from there */
  places: Map<string, { x: number; y: number }>;
}

/** How long a new arrangement takes to glide in, in seconds (Elco, 12 Nov walk 3: "if it was animated"). */
const GLIDE = 0.8;

export function useLandscape(
  svg: RefObject<SVGSVGElement | null>,
  data: LandscapeData,
  probe: boolean,
  /** What sits down the window's left side, so the arrows' names keep clear of it. */
  aside?: RefObject<HTMLElement | null>,
  at?: RefObject<LandscapeAt | null>,
): void {
  // The map's data comes again when the view changes (the legend, Elco, 11 Nov: "I want to see me being able to
  // switch the legends live and watching the map adapt"): the scene is built again where you were.
  const kept = useRef<Kept | null>(null);
  useEffect(() => {
    const node = svg.current;
    if (!node) return;
    const motion = quiet();
    const box = node.getBoundingClientRect();
    const { flowers, roads, home } = data;
    // A new arrangement on the same page (a DAO put in the middle, or let go) glides in from where each flower stood
    // while the camera moves to it (Elco, 12 Nov walk 3: "the camera should move to it and the other ones should be
    // organized around it. If it was animated would be much more elegant"); with reduced motion, it's there at once.
    const prior = kept.current;
    const earlyFocus = at?.current?.focus ?? -1;
    const glideFrom =
      prior &&
      prior.layout !== data.layout &&
      prior.focus === (earlyFocus >= 0 ? idOf(flowers[earlyFocus]) : null) &&
      !quiet().matches
        ? prior.places
        : null;
    const glideTo = glideFrom ? flowers.map((f) => ({ x: f.place.x, y: f.place.y })) : [];
    if (glideFrom) {
      for (const f of flowers) {
        const was = glideFrom.get(idOf(f) ?? '');
        if (was) {
          f.place.x = was.x;
          f.place.y = was.y;
        }
      }
    }
    let glide = glideFrom ? 0 : -1;
    let flyNext: ReturnType<typeof fitView> | null = null;
    const far = fitView(box.width, box.height, home).k * FARTHEST;
    // As close as one flower alone lets you come (camera.ts ZOOM_LIMITS), for the smallest size.
    const cam = newCamera(box.width, box.height, home, [far, ZOOM_LIMITS[1]]);
    const places = flowers.map((f) => f.place);
    const reach = flowers.map((f) => f.reach);
    const ends = roads.map((r) => roadEnds(flowers[r.a] as LandFlower, flowers[r.b] as LandFlower));
    const scene = createLandScene(
      node,
      flowers,
      roads,
      at?.current?.far ?? null,
      at?.current?.lines ?? null,
      data.centre ?? -1,
      data.keyed,
    );
    const lives = new Map<number, Driven>();
    const tones = new Map<number, string>();
    let calm = motion.matches;
    let raf = 0;
    let then = 0;
    let frames = 0;
    const spent: number[] = [];
    const pointer = { x: 0, y: 0, inside: false, dragging: false };
    let under = -1;
    let entered = -1;
    let wasInside = false;
    let speaking = -1;
    let marked = -1;
    let hits: ArrowHit[] = [];
    // The lab's lines lean (#87): inside a flower, the wallets it shares with the flower you came from, or the way
    // out you point at, take the highlight (relations/shared, by each one's snapshot).
    const focusLines = at?.current?.lines === 'focus';
    let cameFrom = -1;
    let pointedWay = -1;
    let shown: { flower: number; other: number; ids: string[] } | null = null;
    let asking = '';
    // Each map's proposals on its flower's ring up close (#93), read once a flower of a map with any comes alive.
    const rings = new Map<string, VoteRing | null>();
    const ringOf = (i: number): VoteRing | null => {
      const f = flowers[i];
      if (!f?.map || !f.proposals) return null;
      const map = f.map;
      if (!rings.has(map)) {
        rings.set(map, null);
        void readMapProposals(map).then((p) => {
          rings.set(map, voteRing(p));
          flowers.forEach((g, j) => {
            if (g.map === map && lives.has(j)) remount(j);
          });
          // a proposal pinned before its ring came: the page hears it again, with the proposal now
          if (voted && flowers[voted.flower]?.map === map) tellProposal();
        });
      }
      return rings.get(map) ?? null;
    };
    // the flower's own look (core lookFills, as every flower has it), the shared wallets highlighted
    const sharedLook = (
      f: LandFlower,
      ids: readonly string[],
      ring: VoteRing | null,
    ): PetalLook => ({
      ...lookFills(f.model.petals, data.keyed),
      highlight: ids,
      // round tops on every flower, its ring or not (one look, Elco, 12 Nov walk)
      roundTops: true,
      ...(ring ? { votes: ring } : {}),
      voter: wallet,
    });
    // The wallet level (Elco, 11 Nov): one wallet chosen, lit in every flower that holds it, its votes on their
    // rings; the flowers that don't hold it recede.
    let wallet: string | null = null;
    let holds: Set<number> | null = null;
    const chooseWallet = (id: string | null) => {
      const next = id === wallet ? null : id;
      if (next === wallet) return;
      wallet = next;
      holds = wallet
        ? new Set(
            flowers.flatMap((f, i) =>
              f.model.petals.some((p) => !p.tail && p.id === wallet) ? [i] : [],
            ),
          )
        : null;
      for (const j of [...lives.keys()]) remount(j);
      at?.current?.onWallet?.(wallet);
      wake();
    };
    // Two clicks Elco named (12 Nov): a line lights, in both its flowers, the wallets it stands for ("a click on the
    // line can do is highlight the petals that hold that token"); a proposal lights the wallets that voted on it, its
    // dots for and against kept ("clicking a proposal should highlight the wallets that voted").
    let line: { a: number; b: number; ids: string[] } | null = null;
    let voted: { flower: number; id: string } | null = null;
    /** the proposal pressed, read as the press starts (the map takes the pointer after), for the click to pin */
    let pressed: { flower: number; id: string } | null = null;
    /** Each flower's opened proposal stacks, by petal (the rest stay folded into a mark with a count) */
    const opened = new Map<number, Set<number>>();
    /** the folded stack pressed, read as the press starts, for the click to open */
    let pressedStack: { flower: number; petal: number } | null = null;
    /**
     * The shared wallets' petals in a flower; those not among its own petals are in its everyone else, so it lights
     * too.
     */
    const litIn = (f: LandFlower, ids: readonly string[]): string[] => {
      // by the address alone: a petal may be named 0x…, eip155:1:0x… or as the index names it
      const bare = (id: string) => id.slice(id.lastIndexOf(':') + 1).toLowerCase();
      const want = new Set(ids.map(bare));
      const own = f.model.petals.filter((p) => !p.tail && want.has(bare(p.id))).map((p) => p.id);
      const tail = f.model.petals.find((p) => p.tail)?.id;
      return tail && own.length < want.size ? [...own, tail] : own;
    };
    /** The page told which proposal is pinned now, or none. */
    const tellProposal = () => {
      const f = voted ? idOf(flowers[voted.flower]) : null;
      const proposal = voted
        ? (ringOf(voted.flower)?.proposals.find((p) => p.id === voted?.id) ?? null)
        : null;
      at?.current?.onProposal?.(voted && f ? { flower: f, id: voted.id, proposal } : null);
    };
    /** The pinned proposal let go, its flower drawn again without its voters lit. */
    const letGoProposal = () => {
      if (!voted) return;
      const j = voted.flower;
      voted = null;
      remount(j);
      tellProposal();
    };
    /** The opened stacks folded again, their flowers drawn again (a click on empty space clears the choice). */
    const foldStacks = () => {
      const was = [...opened.keys()];
      opened.clear();
      for (const j of was) if (j !== voted?.flower) remount(j);
    };
    const votersOf = (i: number, id: string): string[] =>
      ringOf(i)
        ?.proposals.find((p) => p.id === id)
        ?.votes.map((v) => v.account) ?? [];
    // The chosen group's wallets (#94: a bloc, from the legend's Highlight row), on the flower they were chosen in.
    let groupIds: readonly string[] = [];
    let groupFlower = -1;
    /** A live flower's look: its shared wallets (#87) and its chosen group (#94) highlighted, its ring (#93). */
    const lookOf = (i: number): PetalLook => {
      const f = flowers[i] as LandFlower;
      const shared = shown && shown.flower === i ? shown.ids : [];
      const group = i === groupFlower ? groupIds : [];
      const own = wallet && holds?.has(i) ? [wallet] : [];
      const lined = line && (i === line.a || i === line.b) ? litIn(f, line.ids) : [];
      const voters = voted?.flower === i ? votersOf(i, voted.id) : [];
      const look = sharedLook(f, [...shared, ...group, ...own, ...lined, ...voters], ringOf(i));
      const open = [...(opened.get(i) ?? [])];
      // a pinned proposal's own stack stands open, so it's seen (a page's show can pin one in a folded stack)
      const pin =
        voted?.flower === i ? ringOf(i)?.proposals.find((p) => p.id === voted?.id) : undefined;
      if (pin) {
        const petal = pin.proposer ? f.model.petals.findIndex((p) => p.id === pin.proposer) : -1;
        if (!open.includes(petal)) open.push(petal);
      }
      return {
        ...look,
        ...(voted?.flower === i ? { pinned: voted.id } : {}),
        ...(open.length ? { opened: open } : {}),
      };
    };
    /** Re-mounts a live flower, so its look is read again. */
    const remount = (i: number) => {
      const d = lives.get(i);
      if (!d) return;
      d.scene.dispose();
      lives.delete(i);
      tones.delete(i);
      if (speaking === i) speaking = -1;
      wake();
    };
    /** Asks for the shared wallets of the flower you're in and the other one, when that pair changes. */
    const wantShared = () => {
      const other = pointedWay >= 0 ? pointedWay : cameFrom;
      const key = entered >= 0 && other >= 0 ? `${entered}:${other}` : '';
      if (key === asking) return;
      asking = key;
      const was = shown;
      shown = null;
      if (was) remount(was.flower);
      if (!key) return;
      const a = flowers[entered]?.snapshot;
      const b = flowers[other]?.snapshot;
      if (!a || !b) return;
      const flower = entered;
      void readShared(a, b).then((ids) => {
        if (asking !== key || ids.length === 0) return;
        shown = { flower, other, ids };
        remount(flower);
      });
    };
    const enter = spring(0);
    // Opened at a flower: the first frame is already inside it, with no flight to it.
    let arriving = false;
    let chosen: string | null = null;
    let left = 0;
    const measure = () => {
      const r = aside?.current?.getBoundingClientRect();
      left = r ? r.right - node.getBoundingClientRect().left : 0;
    };
    measure();
    /** What the chain list covers, as far again past it as it stands from the edge, when the page asks. */
    const chainsClear = (): Clear => {
      const r = aside?.current?.getBoundingClientRect();
      if (!at?.current?.clearOfChains || !r || r.width === 0) return NO_CLEAR;
      const from = node.getBoundingClientRect();
      // beside it while it's a tall column, below it while it's a bar along the top: whichever leaves the map
      // more room, so a folded box doesn't take the room's whole left (WORKSPACE, 12 Nov: on /make the map,
      // always the ground now, sat small against the right edge)
      const left = Math.max(0, r.right - from.left + (r.left - from.left));
      const top = Math.max(0, r.bottom - from.top + (r.top - from.top));
      const besideRoom = Math.min(from.width - left, from.height);
      const belowRoom = Math.min(from.width, from.height - top);
      return belowRoom > besideRoom ? { ...NO_CLEAR, top } : { ...NO_CLEAR, left };
    };
    clearSides(cam, chainsClear());

    const short = () => Math.min(cam.width, cam.height);

    /** The flower filling most of the window, nearest its middle, if any does. */
    const filling = (): number => {
      let best = -1;
      let bestR = ENTER_AT * short();
      places.forEach((p, i) => {
        const r = screenRadius(cam, p);
        const c = screenCentre(cam, p);
        const inside = c.x > 0 && c.x < cam.width && c.y > 0 && c.y < cam.height;
        if (inside && r >= bestR) {
          best = i;
          bestR = r;
        }
      });
      return best;
    };

    // the one that speaks goes over the other flowers, under the names, so no name or arrow is ever under its
    // petals or its proposals (META's QA, 12 Nov: "labels never sit on each other"); its notes keep clear of them
    const lift = (i: number, onTop: boolean) => {
      const d = lives.get(i);
      if (!d) return;
      if (onTop) node.insertBefore(d.scene.root, scene.top);
      else node.insertBefore(d.scene.root, firstLive(d));
    };
    /** The lowest live flower drawn, where a flower that stops speaking goes back under the others. */
    const firstLive = (d: Driven): Node => {
      let first: Node = scene.top;
      for (const [, o] of lives)
        if (
          o !== d &&
          o.scene.root.parentNode === node &&
          first.compareDocumentPosition(o.scene.root) & Node.DOCUMENT_POSITION_PRECEDING
        )
          first = o.scene.root;
      return first;
    };
    /** The boxes over the map (data-float: the chain list, the legend, a flower's panel), in the map's px. */
    const boxSizes = new ResizeObserver(() => wake());
    const overOf = (): Box[] => {
      const at = node.getBoundingClientRect();
      const out: Box[] = [];
      for (const b of document.querySelectorAll<HTMLElement>('section[data-float]')) {
        boxSizes.observe(b);
        if (b.hidden || !(b.checkVisibility?.({ visibilityProperty: true }) ?? true)) continue;
        const r = b.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        if (r.right < at.left || r.left > at.right || r.bottom < at.top || r.top > at.bottom)
          continue;
        out.push({
          x0: r.left - at.left,
          y0: r.top - at.top,
          x1: r.right - at.left,
          y1: r.bottom - at.top,
        });
      }
      return out;
    };
    /** What the flowers' notes gave way to on the last frame, as a key, so a change draws them once more. */
    let takenKey = '';

    const frame = (now: number) => {
      const began = probe ? performance.now() : 0;
      raf = 0;
      const dt = then ? Math.min(LONGEST_FRAME, (now - then) / 1000) : 1 / 60;
      then = now;
      frames++;
      let moving = stepCamera(cam, dt, calm || arriving);

      // Entering and leaving by zoom, while a hand drives the camera; a click's flight decides on its own.
      if (cam.mode !== 'fly') {
        if (entered >= 0) {
          const p = places[entered] as (typeof places)[number];
          if (screenRadius(cam, p) < LEAVE_AT * short()) entered = -1;
        } else entered = filling();
      }
      enter.t = entered >= 0 ? 1 : 0;
      if (focusLines) {
        if (entered < 0) cameFrom = -1;
        wantShared();
      }
      if (entered >= 0 !== wasInside) {
        wasInside = entered >= 0;
        at?.current?.inside?.(wasInside, entered);
      }
      if (advance(enter, calm || arriving ? SNAP : stepOf(PRESENCE, dt))) moving = true;
      arriving = false;
      if (flyNext) {
        flyTo(cam, flyNext);
        flyNext = null;
        moving = true;
      }
      if (glide >= 0 && glideFrom) {
        glide = Math.min(1, glide + dt / GLIDE);
        const e = glide * glide * (3 - 2 * glide);
        flowers.forEach((f, i) => {
          const from = glideFrom.get(idOf(f) ?? '');
          const to = glideTo[i];
          if (!from || !to) return;
          f.place.x = from.x + (to.x - from.x) * e;
          f.place.y = from.y + (to.y - from.y) * e;
        });
        roads.forEach((r, i) => {
          ends[i] = roadEnds(flowers[r.a] as LandFlower, flowers[r.b] as LandFlower);
        });
        scene.move();
        if (glide >= 1) glide = -1;
        else moving = true;
      }

      // Who's live: mount the new ones open, as their silhouettes already are, under the names.
      // the mini shape held for the whole chain until you're close on a group, then petals for all at once
      const waved = farOf(cam, home);
      const want = waved >= 0.99 ? new Set<number>() : liveSet(cam, places, new Set(lives.keys()));
      // a line a click lit: its two flowers alive at any zoom, so their lit petals show
      if (line) {
        want.add(line.a);
        want.add(line.b);
      }
      if (entered >= 0) want.add(entered);
      for (const [i, d] of lives) {
        if (want.has(i)) continue;
        d.scene.dispose();
        lives.delete(i);
        tones.delete(i);
        if (speaking === i) speaking = -1;
      }
      for (const i of want) {
        if (lives.has(i)) continue;
        const d = newDriven(node, (flowers[i] as LandFlower).model, {
          hover: 'dock',
          width: cam.width,
          height: cam.height,
          calm,
          relations: null,
          readout: false,
          bloom: false,
          // the art direction's colours, as the far wave's; inside a flower, the wallets it shares with the other one
          // (#87) and the chosen group's (#94) take the highlight
          look: lookOf(i),
        });
        lives.set(i, d);
        node.insertBefore(d.scene.root, scene.top);
      }

      // The one that speaks: the one you're in, or the one under the pointer. It goes above everything.
      under = pointer.inside ? flowerAt(cam, places, reach, pointer.x, pointer.y) : -1;
      const speaks = entered >= 0 ? entered : under;
      if (
        speaks !== speaking ||
        (speaks >= 0 && scene.top.previousSibling !== lives.get(speaks)?.scene.root)
      ) {
        if (speaking >= 0 && speaking !== speaks) lift(speaking, false);
        if (speaks >= 0) lift(speaks, true);
        speaking = speaks;
      }
      for (const [i, d] of lives) {
        const p = d.live.pointer;
        p.x = pointer.x;
        p.y = pointer.y;
        // on a way out, the pointer is the way's, not a petal's (META's QA, 12 Nov: a note over the way's count)
        p.inside =
          pointer.inside && i === under && (entered < 0 || i === entered) && pointedWay < 0;
        p.dragging = pointer.dragging;
        d.live.calm = calm;
        // The page's chosen petal, marked only in the flower it opened in.
        d.live.chosen =
          i === entered && i === at?.current?.focus && chosen
            ? d.live.m.petals.findIndex((petal) => petal.id === chosen)
            : -1;
        const away = holds && !holds.has(i) ? WALLET_AWAY : 1;
        const tone = String(Math.round((i === entered ? 1 : 1 - enter.x) * away * 100) / 100);
        if (tones.get(i) !== tone) {
          d.scene.root.setAttribute('opacity', tone);
          tones.set(i, tone);
        }
        const view = flowerView(cam, places[i] as (typeof places)[number]);
        const quietHere = i !== speaking || at?.current?.unlabelled === true;
        if (driveFlower(d, dt, view, quietHere, scene.taken())) moving = true;
      }
      hits = scene.draw({
        view: cam,
        live: new Set(lives.keys()),
        entered,
        enter: enter.x,
        marked,
        left,
        pointed: under,
        holds,
        only,
        way: entered >= 0 ? pointedWay : -1,
        waved,
        worth: at?.current?.worth !== false,
        pending: at?.current?.pending ?? null,
        progress: at?.current?.progress ?? null,
        over: overOf(),
      });
      // the names moved since the notes gave way to them: once more, so the notes keep clear where they settle
      const key = scene
        .taken()
        .map(
          (b) => `${Math.round(b.x0)},${Math.round(b.y0)},${Math.round(b.x1)},${Math.round(b.y1)}`,
        )
        .join(' ');
      if (key !== takenKey) {
        takenKey = key;
        moving = true;
      }
      if (moving) wake();
      else then = 0;
      if (probe) spent.push(performance.now() - began);
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const local = (e: { clientX: number; clientY: number }) => {
      const r = node.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    /** Flies to a flower, filling the window as it does alone, and enters it. */
    const enterFlower = (i: number) => {
      const p = places[i];
      if (!p) return;
      if (entered >= 0 && entered !== i) cameFrom = entered;
      const k = fitScale(p.s, cam.width, cam.height, FIT);
      flyTo(cam, { k, x: cam.width / 2 - p.x * k, y: cam.height / 2 - p.y * k });
      entered = i;
      marked = -1;
      wake();
    };
    /** The marked line's shared wallets, lit in its two flowers, which the camera takes in together. */
    const lightLine = () => {
      const was = line;
      const road = marked >= 0 ? roads[marked] : undefined;
      line = road ? { a: road.a, b: road.b, ids: [] } : null;
      for (const j of new Set([was?.a ?? -1, was?.b ?? -1])) if (j >= 0) remount(j);
      if (!road || !line) return;
      const lit = line;
      const fa = flowers[road.a] as LandFlower;
      const fb = flowers[road.b] as LandFlower;
      const pa = fa.place;
      const pb = fb.place;
      const cx = (pa.x + pb.x) / 2;
      const cy = (pa.y + pb.y) / 2;
      const r =
        Math.hypot(pb.x - pa.x, pb.y - pa.y) / 2 +
        SHAPE.R * Math.max(pa.s * fa.reach, pb.s * fb.reach);
      flyTo(cam, fitView(cam.width, cam.height, { cx, cy, r }, cam.clear));
      if (!fa.snapshot || !fb.snapshot) return;
      void readShared(fa.snapshot, fb.snapshot).then((ids) => {
        if (line !== lit) return;
        lit.ids = ids;
        remount(lit.a);
        remount(lit.b);
      });
    };
    /** The room round some flowers, their petals' reach and all, for the camera to take in. */
    const around = (is: readonly number[]) => {
      const ps = is.map((i) => flowers[i] as LandFlower);
      const cx = ps.reduce((sum, f) => sum + f.place.x, 0) / ps.length;
      const cy = ps.reduce((sum, f) => sum + f.place.y, 0) / ps.length;
      const r = Math.max(
        ...ps.map(
          (f) => Math.hypot(f.place.x - cx, f.place.y - cy) + SHAPE.R * f.place.s * f.reach,
        ),
      );
      return { cx, cy, r };
    };
    const flyHome = () => {
      entered = -1;
      if (line) {
        marked = -1;
        lightLine();
      }
      flyTo(cam, fitView(cam.width, cam.height, home, cam.clear));
      wake();
    };

    /** The connection drawn under a point on screen, or -1. */
    const roadAt = (x: number, y: number): number => {
      if (entered >= 0) return -1;
      let best = -1;
      let bestD = Number.POSITIVE_INFINITY;
      roads.forEach((r, i) => {
        const a = places[r.a] as (typeof places)[number];
        const b = places[r.b] as (typeof places)[number];
        const pair = Math.min(screenRadius(cam, a), screenRadius(cam, b));
        if (i !== marked && !r.strong && fade(DETAIL.roadMore, pair) <= 0.01) return;
        const [x1, y1, x2, y2] = ends[i] as [number, number, number, number];
        const d = toSegment(
          x,
          y,
          cam.x + cam.k * x1,
          cam.y + cam.k * y1,
          cam.x + cam.k * x2,
          cam.y + cam.k * y2,
        );
        if (d <= Math.max(6, roadWidth(r.shared) / 2 + 4) && d < bestD) {
          best = i;
          bestD = d;
        }
      });
      return best;
    };

    /** What a click at a point does: an arrow out, a flower in, a connection marked, or nothing. */
    // two DAOs chosen: the connection between them, shown alone (-2 when they share none), or -1
    let only = -1;
    const click = (x: number, y: number, add = false) => {
      if (entered >= 0) {
        for (const h of hits) {
          const onName =
            h.box !== null && x >= h.box.x0 && x <= h.box.x1 && y >= h.box.y0 && y <= h.box.y1;
          if (onName || toSegment(x, y, ...h.line) <= 8) {
            enterFlower(h.to);
            return;
          }
        }
      }
      // a folded stack pressed opens, its proposals each their own arc again (Elco, 12 Nov walk 3)
      if (pressedStack) {
        const { flower, petal } = pressedStack;
        const set = opened.get(flower) ?? new Set<number>();
        set.add(petal);
        opened.set(flower, set);
        remount(flower);
        pressedStack = null;
        wake();
        return;
      }
      // a proposal pressed: its voters lit, its dots kept; pressed again, let go
      if (pressed) {
        const was = voted;
        voted = was && was.flower === pressed.flower && was.id === pressed.id ? null : pressed;
        for (const j of new Set([was?.flower ?? -1, pressed.flower])) if (j >= 0) remount(j);
        tellProposal();
        pressed = null;
        wake();
        return;
      }
      const f = flowerAt(cam, places, reach, x, y);
      const tells = entered >= 0 && entered === at?.current?.focus ? at.current.onPick : undefined;
      // Elco, 12 Nov walk: "one click put something in the center"; with one there, Shift and a click on another
      // shows only the connection between the two; a click on the one in the middle goes into it
      const centre = data.centre ?? -1;
      const toCentre = at?.current?.onCentre;
      if (f >= 0 && entered < 0 && add && centre >= 0 && f !== centre) {
        const between = roads.findIndex(
          (r) => (r.a === centre && r.b === f) || (r.a === f && r.b === centre),
        );
        only = between >= 0 ? between : -2;
        marked = between;
        wake();
        return;
      }
      if (f >= 0 && entered < 0 && toCentre && f !== centre) {
        only = -1;
        marked = -1;
        toCentre(idOf(flowers[f]));
        return;
      }
      if (f >= 0 && (entered < 0 || f === entered)) {
        if (f !== entered) enterFlower(f);
        else {
          const d = lives.get(f);
          const hit = d ? clickedAt(d.live, x, y) : { kind: 'ground' as const };
          const pressed = hit.kind === 'petal' ? d?.live.m.petals[hit.index] : undefined;
          // the wallet level: a wallet pressed inside the flower you're in is chosen; pressed again, or the ground,
          // lets it go
          // (everyone else, or a group of accounts, isn't one wallet)
          chooseWallet(
            pressed && !pressed.tail && !pressed.id.startsWith('group:') ? pressed.id : null,
          );
          // the ground inside it lets the pinned proposal go too
          if (!pressed) {
            foldStacks();
            letGoProposal();
          }
          const petal = pressed?.id;
          tells?.(
            petal
              ? { kind: 'petal', id: petal }
              : { kind: hit.kind === 'centre' ? 'centre' : 'ground' },
          );
        }
        return;
      }
      if (tells) tells({ kind: 'ground' });
      only = -1;
      const r = roadAt(x, y);
      marked = r >= 0 && r !== marked ? r : -1;
      lightLine();
      // a click on empty space clears the choice (Elco's four clicks, 12 Nov): the wallet, the pinned proposal, the
      // line (above), and on the map the DAO in the middle
      if (r < 0) {
        chooseWallet(null);
        foldStacks();
        letGoProposal();
        if (entered < 0 && (data.centre ?? -1) >= 0) at?.current?.onCentre?.(null);
      }
      wake();
    };

    let dragFrom: {
      x: number;
      y: number;
      t: number;
      vx: number;
      vy: number;
      id: number;
      began: { x: number; y: number; t: number; far: number };
    } | null = null;

    const onMove = (e: PointerEvent) => {
      const p = local(e);
      pointer.x = p.x;
      pointer.y = p.y;
      pointer.inside = true;
      if (focusLines) {
        // the way out the pointer's on, if any: its flower is the one whose shared wallets light
        const way =
          entered >= 0
            ? hits.find(
                (h) =>
                  (h.box !== null &&
                    p.x >= h.box.x0 &&
                    p.x <= h.box.x1 &&
                    p.y >= h.box.y0 &&
                    p.y <= h.box.y1) ||
                  toSegment(p.x, p.y, ...h.line) <= 8,
              )
            : undefined;
        pointedWay = way ? way.to : -1;
        wantShared();
      }
      const over =
        (entered >= 0 && hits.some((h) => toSegment(p.x, p.y, ...h.line) <= 8)) ||
        flowerAt(cam, places, reach, p.x, p.y) >= 0 ||
        roadAt(p.x, p.y) >= 0;
      node.style.cursor = over ? 'pointer' : '';
      if (dragFrom && e.pointerId === dragFrom.id) {
        const dx = p.x - dragFrom.x;
        const dy = p.y - dragFrom.y;
        const dt = Math.max(1, e.timeStamp - dragFrom.t) / 1000;
        const { began } = dragFrom;
        began.far = Math.max(began.far, Math.hypot(p.x - began.x, p.y - began.y));
        if (dx || dy) {
          pointer.dragging = true;
          dragFrom.vx = dragFrom.vx * 0.6 + (dx / dt) * 0.4;
          dragFrom.vy = dragFrom.vy * 0.6 + (dy / dt) * 0.4;
          panBy(cam, dx, dy);
        }
        dragFrom.x = p.x;
        dragFrom.y = p.y;
        dragFrom.t = e.timeStamp;
      }
      wake();
    };
    const onLeave = () => {
      pointer.inside = false;
      wake();
    };
    const onDown = (e: PointerEvent) => {
      const p = local(e);
      pressed = null;
      pressedStack = null;
      for (const [i, d] of lives) {
        const id = d.scene.pointedProposal();
        if (id) pressed = { flower: i, id };
        const petal = d.scene.pointedStack();
        if (petal !== null) pressedStack = { flower: i, petal };
      }
      for (const [i, d] of lives) {
        if (d.last && d.scene.onMap(p.x, p.y, d.last)) {
          enterFlower(i);
          return;
        }
      }
      node.setPointerCapture(e.pointerId);
      dragFrom = {
        x: p.x,
        y: p.y,
        t: e.timeStamp,
        vx: 0,
        vy: 0,
        id: e.pointerId,
        began: { x: p.x, y: p.y, t: e.timeStamp, far: 0 },
      };
    };
    const onUp = (e: PointerEvent) => {
      if (!dragFrom || e.pointerId !== dragFrom.id) return;
      const { began } = dragFrom;
      const isClick =
        e.type === 'pointerup' && began.far <= CLICK_SLOP && e.timeStamp - began.t <= CLICK_LONGEST;
      const stale = e.timeStamp - dragFrom.t > 60;
      if (pointer.dragging && !stale && !isClick) {
        const speed = Math.hypot(dragFrom.vx, dragFrom.vy) || 1;
        const cap = Math.min(1, LONGEST_THROW / speed);
        letGo(cam, dragFrom.vx * cap, dragFrom.vy * cap);
      }
      pointer.dragging = false;
      dragFrom = null;
      if (isClick) {
        const p = local(e);
        click(p.x, p.y, e.shiftKey);
      }
      wake();
    };
    const onWheel = (e: WheelEvent) => {
      if (at?.current?.inPage && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const p = local(e);
      pointer.x = p.x;
      pointer.y = p.y;
      pointer.inside = true;
      zoomWheel(cam, {
        deltaY: e.deltaY,
        deltaMode: e.deltaMode,
        ctrlKey: e.ctrlKey,
        sx: p.x,
        sy: p.y,
      });
      wake();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // a chosen wallet goes first, then the map goes home
        if (wallet) {
          chooseWallet(null);
          return;
        }
        // then two DAOs chosen, then the one in the middle (the saved map comes back), then home
        if (only !== -1) {
          only = -1;
          marked = -1;
          wake();
          return;
        }
        if ((data.centre ?? -1) >= 0 && entered < 0) {
          at?.current?.onCentre?.(null);
          return;
        }
        marked = -1;
        flyHome();
      }
    };
    const onMotion = () => {
      calm = motion.matches;
      wake();
    };
    const watch = new ResizeObserver(() => {
      const r = node.getBoundingClientRect();
      resize(cam, r.width, r.height);
      measure();
      clearSides(cam, chainsClear());
      wake();
    });

    const focus = at?.current?.focus ?? -1;
    const focusId = focus >= 0 ? idOf(flowers[focus]) : null;
    const was = kept.current;
    kept.current = null;
    if (was && was.focus === focusId && was.layout === data.layout) {
      // the same page with new data: where you were, at once, inside the flower you were in
      const j = was.entered ? flowers.findIndex((f) => idOf(f) === was.entered) : -1;
      // the flower you're in (or the DAO in the middle) stays where it was on screen when the places move under it
      // (a gravity change: VISUAL QA, 12 Nov, the DAO you were in went off the window)
      const anchor = j >= 0 ? j : (data.centre ?? -1);
      const moved = anchor >= 0 ? flowers[anchor] : undefined;
      const from = moved ? was.places.get(idOf(moved) ?? '') : undefined;
      flyTo(
        cam,
        moved && from
          ? {
              ...was.view,
              x: was.view.x - (moved.place.x - from.x) * was.view.k,
              y: was.view.y - (moved.place.y - from.y) * was.view.k,
            }
          : was.view,
      );
      if (j >= 0) entered = j;
      arriving = true;
      cam.touched = true;
    } else if (glideFrom && was) {
      // from where you were, then the camera moves to the new arrangement as it glides in
      flyTo(cam, was.view);
      arriving = true;
      cam.touched = true;
      flyNext = fitView(cam.width, cam.height, home, cam.clear);
    } else if (focus >= 0 && flowers[focus]) {
      enterFlower(focus);
      arriving = true;
      // Placed on purpose: the first size the window reports must keep it there, not fit the chain again.
      cam.touched = true;
    }
    if (at?.current) {
      at.current.choose = (id) => {
        chosen = id;
        wake();
      };
      at.current.highlight = (ids) => {
        const was = groupFlower;
        groupIds = ids ?? [];
        groupFlower = groupIds.length > 0 ? entered : -1;
        for (const j of new Set([was, groupFlower])) if (j >= 0 && lives.has(j)) remount(j);
        wake();
      };
      at.current.redraw = wake;
      at.current.enter = (i) => {
        if (!flowers[i]) return;
        enterFlower(i);
        // placed on purpose, as the flower it opens in is: the window's next size keeps it there
        cam.touched = true;
      };
      at.current.fit = (room) => {
        entered = -1;
        flyTo(cam, fitView(cam.width, cam.height, room, cam.clear));
        cam.touched = true;
        wake();
      };
      at.current.show = (s) => {
        if (!s) {
          chooseWallet(null);
          letGoProposal();
          if (marked >= 0) {
            marked = -1;
            lightLine();
          }
          wake();
          return;
        }
        if (s.kind === 'map' || s.kind === 'proposal') {
          if (!flowers[s.i]) return;
          enterFlower(s.i);
          if (s.kind === 'proposal' && (voted?.flower !== s.i || voted.id !== s.id)) {
            const was = voted;
            voted = { flower: s.i, id: s.id };
            for (const j of new Set([was?.flower ?? -1, s.i])) if (j >= 0) remount(j);
            tellProposal();
          }
        } else if (s.kind === 'wallet') {
          // the petal's own id, however the page names it (0x…, eip155:1:0x…)
          const bare = (id: string) => id.slice(id.lastIndexOf(':') + 1).toLowerCase();
          const id =
            flowers.flatMap((f) => f.model.petals).find((p) => !p.tail && bare(p.id) === bare(s.id))
              ?.id ?? s.id;
          if (wallet !== id) chooseWallet(id);
          const held = [...(holds ?? [])];
          if (held.length > 0) {
            entered = -1;
            flyTo(cam, fitView(cam.width, cam.height, around(held), cam.clear));
          }
        } else {
          const r = roads.findIndex(
            (road) => (road.a === s.a && road.b === s.b) || (road.a === s.b && road.b === s.a),
          );
          entered = -1;
          if (r >= 0) {
            marked = r;
            lightLine();
          } else flyTo(cam, fitView(cam.width, cam.height, around([s.a, s.b]), cam.clear));
        }
        // placed on purpose: the window's next size keeps it there
        cam.touched = true;
        wake();
      };
    }

    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerleave', onLeave);
    node.addEventListener('pointerdown', onDown);
    // a box over the map that grows, folds or is put down somewhere else: drawn once more, so the names and notes
    // keep clear of where it is now
    window.addEventListener('pointerup', wake);
    node.addEventListener('pointerup', onUp);
    node.addEventListener('pointercancel', onUp);
    node.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    motion.addEventListener('change', onMotion);
    watch.observe(node);
    wake();

    const probeHost = window as unknown as { landscapeProbe?: unknown };
    if (probe) {
      probeHost.landscapeProbe = {
        state: () => ({
          k: cam.k,
          x: cam.x,
          y: cam.y,
          live: [...lives.keys()],
          under,
          entered,
          enter: enter.x,
          marked,
          arrows: hits.length,
          frames,
          sleeping: raf === 0,
          nodes: node.querySelectorAll('*').length,
        }),
        spent: () => spent.splice(0),
        flowers: flowers.map((f, i) => ({
          i,
          name: f.name,
          x: f.place.x,
          y: f.place.y,
          s: f.place.s,
        })),
        hits: () => hits,
        /** A test's hand: zoom by a factor at a point on screen, or click at one. */
        zoomAt: (sx: number, sy: number, factor: number) => {
          zoomWheel(cam, {
            deltaY: -Math.log(factor) / PINCH_GAIN,
            deltaMode: 0,
            ctrlKey: true,
            sx,
            sy,
          });
          wake();
        },
        click,
        enterFlower,
        flyHome,
      };
    }

    return () => {
      // the map taken down: nothing's pinned on it any more
      if (voted) at?.current?.onProposal?.(null);
      // kept once it has drawn (React's second mount in development takes it down before any frame)
      if (frames > 0) {
        kept.current = {
          view: { k: cam.k, x: cam.x, y: cam.y },
          entered: entered >= 0 ? idOf(flowers[entered]) : null,
          focus: focusId,
          layout: data.layout,
          places: new Map(flowers.map((f) => [idOf(f) ?? '', { x: f.place.x, y: f.place.y }])),
        };
      }
      if (raf) cancelAnimationFrame(raf);
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerleave', onLeave);
      node.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', wake);
      boxSizes.disconnect();
      node.removeEventListener('pointerup', onUp);
      node.removeEventListener('pointercancel', onUp);
      node.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      motion.removeEventListener('change', onMotion);
      watch.disconnect();
      for (const d of lives.values()) d.scene.dispose();
      scene.dispose();
      delete probeHost.landscapeProbe;
    };
  }, [svg, data, probe, aside, at]);
}

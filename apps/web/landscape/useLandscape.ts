// The map's ViewModel (specs/006-the-map, bench v2): one requestAnimationFrame loop that sleeps when nothing
// moves, one camera over one chain's flowers, and the pointer, wheel and keyboard wired into it. Far flowers
// are drawn by the map's scene; a flower big enough on screen comes alive as itself (flower/drive.ts), with
// its view worked out from the map's camera. A click on a flower, or zooming in until it fills most of the
// window, enters it: everything else fades, and arrows name the ways out. Esc, or zooming back out, leaves.
// React mounts this once per chain and never renders per frame.
import { lookFills } from '@petal/core/wedge/keys';
import { type RefObject, useEffect, useRef } from 'react';
import {
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
import { DETAIL, fade } from '../flower/detail.ts';
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
import type { PetalLook } from '../flower/scene.ts';
import { advance, SNAP, spring, stepOf } from '../flower/spring.ts';
import { readMapProposals, readShared } from '../lib/agent-client.ts';
import type { CanvasHit } from '../lib/panel-view.ts';
import { type VoteRing, voteRing } from '../lib/vote-ring.ts';
import { type Road, roadWidth } from './roads.ts';
import {
  type ArrowHit,
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
}

/**
 * A page that opens the map at one flower (coordinator/one-source.md, step 6): which flower it opens in, and
 * what a click inside that flower tells the page, as a flower's own canvas does (flower/FlowerCanvas.tsx).
 * `choose` is set by the map, so the page can mark a petal without the scene being built again.
 */
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
}

const LONGEST_FRAME = 1 / 15;
const LONGEST_THROW = 2400;
/** The way out goes a little past the whole chain, so its edge shows. */
const FARTHEST = 0.6;

const quiet = () => window.matchMedia('(prefers-reduced-motion: reduce)');

/** A flower, by the map it stands for, so it's found again in new data. */
const idOf = (f: LandFlower | undefined): string | null =>
  f ? (f.map ?? f.snapshot ?? f.name) : null;

/** Where the map was when its scene was last taken down: the camera, the flower you were in, the page's own. */
interface Kept {
  view: { k: number; x: number; y: number };
  entered: string | null;
  focus: string | null;
}

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
      ...lookFills(f.model.petals),
      highlight: ids,
      ...(ring ? { roundTops: true, votes: ring } : {}),
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
    // The chosen group's wallets (#94: a bloc, from the legend's Highlight row), on the flower they were chosen in.
    let groupIds: readonly string[] = [];
    let groupFlower = -1;
    /** A live flower's look: its shared wallets (#87) and its chosen group (#94) highlighted, its ring (#93). */
    const lookOf = (i: number): PetalLook => {
      const f = flowers[i] as LandFlower;
      const shared = shown && shown.flower === i ? shown.ids : [];
      const group = i === groupFlower ? groupIds : [];
      const own = wallet && holds?.has(i) ? [wallet] : [];
      return sharedLook(f, [...shared, ...group, ...own], ringOf(i));
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
      const from = node.getBoundingClientRect().left;
      return { ...NO_CLEAR, left: Math.max(0, r.right - from + (r.left - from)) };
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

    const lift = (i: number, onTop: boolean) => {
      const d = lives.get(i);
      if (!d) return;
      if (onTop) node.appendChild(d.scene.root);
      else node.insertBefore(d.scene.root, scene.top);
    };

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

      // Who's live: mount the new ones open, as their silhouettes already are, under the names.
      const want = liveSet(cam, places, new Set(lives.keys()));
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
        (speaks >= 0 && node.lastChild !== lives.get(speaks)?.scene.root)
      ) {
        if (speaking >= 0 && speaking !== speaks) lift(speaking, false);
        if (speaks >= 0) lift(speaks, true);
        speaking = speaks;
      }
      for (const [i, d] of lives) {
        const p = d.live.pointer;
        p.x = pointer.x;
        p.y = pointer.y;
        p.inside = pointer.inside && i === under && (entered < 0 || i === entered);
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
        if (driveFlower(d, dt, view, i !== speaking)) moving = true;
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
      });
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
    const flyHome = () => {
      entered = -1;
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
    const click = (x: number, y: number) => {
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
      const f = flowerAt(cam, places, reach, x, y);
      const tells = entered >= 0 && entered === at?.current?.focus ? at.current.onPick : undefined;
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
          const petal = pressed?.id;
          tells?.(
            petal
              ? { kind: 'petal', id: petal }
              : { kind: hit.kind === 'centre' ? 'centre' : 'ground' },
          );
        }
        return;
      }
      if (entered >= 0) chooseWallet(null);
      if (tells) tells({ kind: 'ground' });
      const r = roadAt(x, y);
      marked = r >= 0 && r !== marked ? r : -1;
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
        click(p.x, p.y);
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
    if (was && was.focus === focusId) {
      // the same page with new data: where you were, at once, inside the flower you were in
      flyTo(cam, was.view);
      const j = was.entered ? flowers.findIndex((f) => idOf(f) === was.entered) : -1;
      if (j >= 0) entered = j;
      arriving = true;
      cam.touched = true;
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
      at.current.enter = (i) => {
        if (!flowers[i]) return;
        enterFlower(i);
        // placed on purpose, as the flower it opens in is: the window's next size keeps it there
        cam.touched = true;
      };
    }

    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerleave', onLeave);
    node.addEventListener('pointerdown', onDown);
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
      // kept once it has drawn (React's second mount in development takes it down before any frame)
      if (frames > 0) {
        kept.current = {
          view: { k: cam.k, x: cam.x, y: cam.y },
          entered: entered >= 0 ? idOf(flowers[entered]) : null,
          focus: focusId,
        };
      }
      if (raf) cancelAnimationFrame(raf);
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerleave', onLeave);
      node.removeEventListener('pointerdown', onDown);
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

// The live flower's ViewModel: one requestAnimationFrame loop that sleeps when nothing moves, and the
// pointer, wheel and keyboard wired into it. All the state is in live.ts, the choices in marks.ts and
// the drawing in scene.ts. React mounts this once and never renders per frame.
import { type RefObject, useEffect, useRef } from 'react';
import type { CanvasHit } from '../lib/panel-view.ts';
import type { VoteRing } from '../lib/vote-ring.ts';
import {
  type Clear,
  clearSides,
  fitView,
  flyTo,
  letGo,
  panBy,
  resize,
  zoomWheel,
} from './camera.ts';
import { driveFlower, newDriven } from './drive.ts';
import { CLICK_LONGEST, CLICK_SLOP } from './feel.ts';
import type { HoverWay } from './hover.ts';
import { clickedAt } from './live.ts';
import { type FlowerReading, modelOf } from './model.ts';
import { scatter } from './order.ts';
import type { FakeRelations, PetalLook } from './scene.ts';

export interface CanvasOptions {
  /** With none, there's nothing to draw and nothing to move. */
  reading: FlowerReading | null;
  hover: HoverWay;
  relations: FakeRelations | null;
  /** A look of the page's own (the lab's benches); with none, the flower's own (core lookFills). */
  look?: PetalLook | null;
  /** its map's proposals on the ring */
  votes?: VoteRing | null;
  scatter: boolean;
  probe: boolean;
  readout: boolean;
}

/**
 * What the page holds on the flower while it runs. A stream of renders passes through here, so none of
 * this may ever rebuild the scene: the handler is read when a click needs it, and the selection goes into
 * the running loop.
 */
export interface CanvasHands {
  /** The petal that stays marked, by id. A reading's order can change, its ids don't. */
  selected?: string | null | undefined;
  /** What a click landed on. Without it, a press is only ever the start of a pan. */
  onPick?: ((hit: CanvasHit) => void) | undefined;
  /** The sides something covers (camera.ts Clear): the flower fits beside them. */
  clear?: Clear | undefined;
}

/** A frame is never longer than this for the springs, so a stall doesn't fling anything. */
const LONGEST_FRAME = 1 / 15;
/** The fastest a drag can throw the camera, in px/s. */
const LONGEST_THROW = 2400;

const quiet = () => window.matchMedia('(prefers-reduced-motion: reduce)');

export function useFlowerCanvas(
  svg: RefObject<SVGSVGElement | null>,
  options: CanvasOptions,
  hands: CanvasHands = {},
): void {
  const held = useRef(hands);
  held.current = hands;
  const choose = useRef<((id: string | null | undefined) => void) | null>(null);
  const clearTo = useRef<((clear: Clear | undefined) => void) | null>(null);

  useEffect(() => {
    const node = svg.current;
    const { reading } = options;
    if (!node || !reading) return;
    const m = modelOf(options.scatter ? { ...reading, petals: scatter(reading.petals) } : reading);
    const motion = quiet();
    const box = node.getBoundingClientRect();
    const d = newDriven(node, m, {
      hover: options.hover,
      width: box.width,
      height: box.height,
      calm: motion.matches,
      relations: options.relations,
      look: options.look ?? null,
      votes: options.votes ?? null,
      readout: options.readout,
    });
    const { live, scene } = d;
    let raf = 0;
    let then = 0;
    let frames = 0;
    const spent: number[] = [];

    const frame = (now: number) => {
      const began = options.probe ? performance.now() : 0;
      raf = 0;
      const dt = then ? Math.min(LONGEST_FRAME, (now - then) / 1000) : 1 / 60;
      then = now;
      frames++;
      if (driveFlower(d, dt)) wake();
      else then = 0;
      if (options.probe) spent.push(performance.now() - began);
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const local = (e: { clientX: number; clientY: number }) => {
      const r = node.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    let dragFrom: {
      x: number;
      y: number;
      t: number;
      vx: number;
      vy: number;
      id: number;
      /** figure.pick: where and when it began, and the furthest it has been from there. */
      began: { x: number; y: number; t: number; far: number } | null;
    } | null = null;

    choose.current = (id) => {
      live.chosen = id ? m.petals.findIndex((p) => p.id === id) : -1;
      wake();
    };
    choose.current(held.current.selected);
    clearTo.current = (clear) => {
      if (!clear) return;
      clearSides(live.camera, clear);
      wake();
    };
    clearTo.current(held.current.clear);

    const onMove = (e: PointerEvent) => {
      const p = local(e);
      live.pointer.x = p.x;
      live.pointer.y = p.y;
      live.pointer.inside = true;
      const onMap = d.last && scene.onMap(p.x, p.y, d.last);
      const takes = held.current.onPick && clickedAt(live, p.x, p.y).kind !== 'ground';
      node.style.cursor = onMap || takes ? 'pointer' : '';
      if (dragFrom && e.pointerId === dragFrom.id) {
        const dx = p.x - dragFrom.x;
        const dy = p.y - dragFrom.y;
        const dt = Math.max(1, e.timeStamp - dragFrom.t) / 1000;
        const { began } = dragFrom;
        if (began) began.far = Math.max(began.far, Math.hypot(p.x - began.x, p.y - began.y));
        if (dx || dy) {
          live.pointer.dragging = true;
          // Smoothed a little, so one slow last event doesn't kill the throw.
          dragFrom.vx = dragFrom.vx * 0.6 + (dx / dt) * 0.4;
          dragFrom.vy = dragFrom.vy * 0.6 + (dy / dt) * 0.4;
          panBy(live.camera, dx, dy);
        }
        dragFrom.x = p.x;
        dragFrom.y = p.y;
        dragFrom.t = e.timeStamp;
      }
      wake();
    };
    const onLeave = () => {
      live.pointer.inside = false;
      wake();
    };
    const onDown = (e: PointerEvent) => {
      const p = local(e);
      if (d.last && scene.onMap(p.x, p.y, d.last)) {
        flyBack();
        return;
      }
      node.setPointerCapture(e.pointerId);
      dragFrom = {
        x: p.x,
        y: p.y,
        t: e.timeStamp,
        vx: 0,
        vy: 0,
        id: e.pointerId,
        began: e.button === 0 ? { x: p.x, y: p.y, t: e.timeStamp, far: 0 } : null,
      };
    };
    const onUp = (e: PointerEvent) => {
      if (!dragFrom || e.pointerId !== dragFrom.id) return;
      // figure.pick
      // A press that stayed put and didn't last is a click. Anything else was a drag, and a drag never picks.
      const { onPick } = held.current;
      const { began } = dragFrom;
      const click =
        onPick &&
        e.type === 'pointerup' &&
        began &&
        began.far <= CLICK_SLOP &&
        e.timeStamp - began.t <= CLICK_LONGEST;
      // A hand that stopped before it lifted throws nothing.
      const stale = e.timeStamp - dragFrom.t > 60;
      if (live.pointer.dragging && !stale && !click) {
        const speed = Math.hypot(dragFrom.vx, dragFrom.vy) || 1;
        const cap = Math.min(1, LONGEST_THROW / speed);
        letGo(live.camera, dragFrom.vx * cap, dragFrom.vy * cap);
      }
      live.pointer.dragging = false;
      dragFrom = null;
      if (click) {
        const p = local(e);
        const hit = clickedAt(live, p.x, p.y);
        onPick(
          hit.kind === 'petal' ? { kind: 'petal', id: m.petals[hit.index]?.id as string } : hit,
        );
      }
      wake();
    };
    const onWheel = (e: WheelEvent) => {
      // Chrome's pinch would zoom the page.
      e.preventDefault();
      const p = local(e);
      live.pointer.x = p.x;
      live.pointer.y = p.y;
      live.pointer.inside = true;
      zoomWheel(live.camera, {
        deltaY: e.deltaY,
        deltaMode: e.deltaMode,
        ctrlKey: e.ctrlKey,
        sx: p.x,
        sy: p.y,
      });
      wake();
    };
    const flyBack = () => {
      flyTo(
        live.camera,
        fitView(live.camera.width, live.camera.height, live.camera.home, live.camera.clear),
      );
      wake();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') flyBack();
    };
    const onMotion = () => {
      live.calm = motion.matches;
      wake();
    };
    const watch = new ResizeObserver(() => {
      const r = node.getBoundingClientRect();
      resize(live.camera, r.width, r.height);
      wake();
    });

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

    const probeHost = window as unknown as { flowerProbe?: unknown };
    if (options.probe) {
      probeHost.flowerProbe = {
        state: () => ({
          k: live.camera.k,
          x: live.camera.x,
          y: live.camera.y,
          focus: live.focusIndex,
          chosen: live.chosen,
          presence: live.presence.x,
          open: live.open.x[live.focusIndex],
          locked: live.locked,
          rotation: live.rotation.x,
          frames,
          sleeping: raf === 0,
          notes: d.last?.notes.length ?? 0,
          labels: d.last?.labels.length ?? 0,
          nodes: node.querySelectorAll('*').length,
          petalHeight: live.ring.h[live.focusIndex],
          petalLen: live.ring.len[live.focusIndex],
          calm: live.calm,
        }),
        marks: () => d.last,
        spent: () => spent.splice(0),
        focusName: () => m.petals[live.focusIndex]?.name,
        idOf: (i: number) => m.petals[i]?.id,
        count: m.n,
        toScreen: (i: number) => {
          const { camera: c, ring } = live;
          const up = (ring.h[i] as number) * 0.6;
          const x =
            ((ring.ax[i] as number) + (ring.bx[i] as number)) / 2 + (ring.nx[i] as number) * up;
          const y =
            ((ring.ay[i] as number) + (ring.by[i] as number)) / 2 + (ring.ny[i] as number) * up;
          return { x: (x + ring.ox) * c.k + c.x, y: (y + ring.oy) * c.k + c.y };
        },
      };
    }

    return () => {
      choose.current = null;
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
      scene.dispose();
      delete probeHost.flowerProbe;
    };
  }, [svg, options]);

  const { selected, clear } = hands;
  useEffect(() => {
    choose.current?.(selected);
  }, [selected]);
  const left = clear?.left;
  const right = clear?.right;
  const top = clear?.top;
  const bottom = clear?.bottom;
  useEffect(() => {
    if (left === undefined || right === undefined || top === undefined || bottom === undefined)
      return;
    clearTo.current?.({ left, right, top, bottom });
  }, [left, right, top, bottom]);
}

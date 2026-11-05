// The bench's ViewModel: one requestAnimationFrame loop that sleeps when nothing moves, and the
// pointer, wheel and keyboard wired into it. All the state is in live.ts, the choices in marks.ts and
// the drawing in scene.ts. React mounts this once and never renders per frame.
import { type RefObject, useEffect } from 'react';
import { fitView, flyTo, letGo, panBy, resize, zoomWheel } from './camera.ts';
import type { HoverWay } from './hover.ts';
import { fakeRelations } from './illustrative.ts';
import { newLive, stepLive } from './live.ts';
import { type Focus, type Marks, marks } from './marks.ts';
import { type FlowerReading, modelOf } from './model.ts';
import { createScene } from './scene.ts';

export interface BenchOptions {
  reading: FlowerReading;
  hover: HoverWay;
  relations: boolean;
  probe: boolean;
}

/** A frame is never longer than this for the springs, so a stall doesn't fling anything. */
const LONGEST_FRAME = 1 / 15;

const quiet = () => window.matchMedia('(prefers-reduced-motion: reduce)');

export function useFlowerBench(svg: RefObject<SVGSVGElement | null>, options: BenchOptions): void {
  useEffect(() => {
    const node = svg.current;
    if (!node) return;
    const m = modelOf(options.reading);
    const motion = quiet();
    const box = node.getBoundingClientRect();
    const live = newLive(m, options.hover, box.width, box.height, motion.matches);
    const relations = options.relations ? fakeRelations(m.n) : null;
    const scene = createScene(node, m, relations);
    const scratch = new Float64Array(m.n);
    let last: Marks | null = null;
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
      const stepped = stepLive(live, dt);
      const presence = live.presence.x;
      const focus: Focus | null =
        presence > 0.001
          ? {
              index: live.focusIndex,
              presence,
              open: live.open.x[live.focusIndex] as number,
              chase: { x: live.noteX.x, y: live.noteY.x },
              side: live.noteSide.x,
            }
          : null;
      const mk = marks(m, live.camera, focus, live.ring, scratch);
      scene.draw({
        marks: mk,
        ring: live.ring,
        view: live.camera,
        accent: live.accent,
        ringMoved: stepped.ringMoved || last === null,
        accentMoved: stepped.accentMoved,
        focusIndex: focus ? live.focusIndex : -1,
      });
      last = mk;
      if (stepped.moving) wake();
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

    let dragFrom: { x: number; y: number; t: number; vx: number; vy: number; id: number } | null =
      null;

    const onMove = (e: PointerEvent) => {
      const p = local(e);
      live.pointer.x = p.x;
      live.pointer.y = p.y;
      live.pointer.inside = true;
      if (dragFrom && e.pointerId === dragFrom.id) {
        const dx = p.x - dragFrom.x;
        const dy = p.y - dragFrom.y;
        const dt = Math.max(1, e.timeStamp - dragFrom.t) / 1000;
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
      if (last && scene.onMap(p.x, p.y, last)) {
        flyBack();
        return;
      }
      node.setPointerCapture(e.pointerId);
      dragFrom = { x: p.x, y: p.y, t: e.timeStamp, vx: 0, vy: 0, id: e.pointerId };
    };
    const onUp = (e: PointerEvent) => {
      if (!dragFrom || e.pointerId !== dragFrom.id) return;
      // A hand that stopped before it lifted throws nothing.
      const stale = e.timeStamp - dragFrom.t > 60;
      if (live.pointer.dragging && !stale) letGo(live.camera, dragFrom.vx, dragFrom.vy);
      live.pointer.dragging = false;
      dragFrom = null;
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
      flyTo(live.camera, fitView(live.camera.width, live.camera.height));
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
          presence: live.presence.x,
          open: live.open.x[live.focusIndex],
          locked: live.locked,
          rotation: live.rotation.x,
          frames,
          sleeping: raf === 0,
          notes: last?.notes.length ?? 0,
          labels: last?.labels.length ?? 0,
          nodes: node.querySelectorAll('*').length,
          petalHeight: live.ring.h[live.focusIndex],
          petalLen: live.ring.len[live.focusIndex],
          calm: live.calm,
        }),
        marks: () => last,
        spent: () => spent.splice(0),
        focusName: () => m.petals[live.focusIndex]?.name,
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
}

// The map's ViewModel (specs/006-the-map): one requestAnimationFrame loop that sleeps when nothing moves,
// one camera over every flower, and the pointer, wheel and keyboard wired into it. Far flowers are drawn
// by the map's scene; a flower big enough on screen comes alive as itself (flower/drive.ts), with its view
// worked out from the map's camera, and gets the pointer while it's under it. React mounts this once and
// never renders per frame.
import type { ReadingPetal } from '@petal/core/types';
import { type RefObject, useEffect } from 'react';
import type { View } from '../flower/camera.ts';
import {
  fitView,
  flyTo,
  type Home,
  letGo,
  newCamera,
  panBy,
  resize,
  stepCamera,
  zoomWheel,
} from '../flower/camera.ts';
import { DETAIL, fade } from '../flower/detail.ts';
import { type Driven, driveFlower, newDriven } from '../flower/drive.ts';
import { FIT, PINCH_GAIN, ZOOM_LIMITS } from '../flower/feel.ts';
import type { Ring } from '../flower/ring.ts';
import type { Continent } from './places.ts';
import { fanPairs, type Road, restOf, tailOf } from './roads.ts';
import { createLandScene, type Fan, type LandFlower } from './scene.ts';
import { fitScale, flowerAt, flowerView, liveSet, screenRadius } from './space.ts';

export interface LandscapeData {
  flowers: LandFlower[];
  roads: Road[];
  continents: Continent[];
  continentNames: string[];
  home: Home;
}

const LONGEST_FRAME = 1 / 15;
const LONGEST_THROW = 2400;
/** The way out goes a little past the whole map, so the edge of it shows. */
const FARTHEST = 0.6;

const quiet = () => window.matchMedia('(prefers-reduced-motion: reduce)');

/** Where a petal's tip is on screen, for a flower drawn with this view. */
function tipOnScreen(ring: Ring, i: number, v: View): [number, number] {
  const h = ring.h[i] as number;
  const x = ((ring.ax[i] as number) + (ring.bx[i] as number)) / 2 + (ring.nx[i] as number) * h;
  const y = ((ring.ay[i] as number) + (ring.by[i] as number)) / 2 + (ring.ny[i] as number) * h;
  return [(x + ring.ox) * v.k + v.x, (y + ring.oy) * v.k + v.y];
}

export function useLandscape(
  svg: RefObject<SVGSVGElement | null>,
  data: LandscapeData,
  probe: boolean,
): void {
  useEffect(() => {
    const node = svg.current;
    if (!node) return;
    const motion = quiet();
    const box = node.getBoundingClientRect();
    const home = data.home;
    const far = fitView(box.width, box.height, home).k * FARTHEST;
    // As close as one flower alone lets you come (camera.ts ZOOM_LIMITS), for the smallest size.
    const cam = newCamera(box.width, box.height, home, [far, ZOOM_LIMITS[1]]);
    const places = data.flowers.map((f) => f.place);
    const scene = createLandScene(
      node,
      data.flowers,
      data.roads,
      data.continents,
      data.continentNames,
    );
    const lives = new Map<number, Driven>();
    let calm = motion.matches;
    let raf = 0;
    let then = 0;
    let frames = 0;
    const spent: number[] = [];
    const pointer = { x: 0, y: 0, inside: false, dragging: false };
    let under = -1;

    const fansNow = (): Fan[] => {
      const fans: Fan[] = [];
      for (const r of data.roads) {
        const a = lives.get(r.a);
        const b = lives.get(r.b);
        if (!a || !b) continue;
        const pa = places[r.a];
        const pb = places[r.b];
        if (!pa || !pb) continue;
        const opacity = fade(
          DETAIL.roadFan,
          Math.min(screenRadius(cam, pa), screenRadius(cam, pb)),
        );
        if (opacity <= 0.01) continue;
        const va = a.live.camera;
        const vb = b.live.camera;
        const pairs = fanPairs(a.m.petals as ReadingPetal[], b.m.petals as ReadingPetal[]);
        const lines = pairs.map(
          ([i, j]) =>
            [...tipOnScreen(a.live.ring, i, va), ...tipOnScreen(b.live.ring, j, vb)] as [
              number,
              number,
              number,
              number,
            ],
        );
        const ta = tailOf(a.m.petals);
        const tb = tailOf(b.m.petals);
        const left = restOf(r.shared, pairs.length);
        const rest =
          left > 0 && ta >= 0 && tb >= 0
            ? {
                line: [
                  ...tipOnScreen(a.live.ring, ta, va),
                  ...tipOnScreen(b.live.ring, tb, vb),
                ] as [number, number, number, number],
                shared: left,
              }
            : null;
        fans.push({ lines, rest, opacity });
      }
      return fans;
    };

    const frame = (now: number) => {
      const began = probe ? performance.now() : 0;
      raf = 0;
      const dt = then ? Math.min(LONGEST_FRAME, (now - then) / 1000) : 1 / 60;
      then = now;
      frames++;
      let moving = stepCamera(cam, dt, calm);

      // Who's live: mount the new ones open, as their silhouettes already are; let the others go.
      const want = liveSet(cam, places, new Set(lives.keys()));
      for (const [i, d] of lives) {
        if (want.has(i)) continue;
        d.scene.dispose();
        lives.delete(i);
      }
      for (const i of want) {
        if (lives.has(i)) continue;
        const f = data.flowers[i] as LandFlower;
        lives.set(
          i,
          newDriven(node, f.model, {
            hover: 'dock',
            width: cam.width,
            height: cam.height,
            calm,
            relations: null,
            readout: false,
            bloom: false,
          }),
        );
      }
      under = pointer.inside ? flowerAt(cam, places, pointer.x, pointer.y) : -1;
      for (const [i, d] of lives) {
        const p = d.live.pointer;
        p.x = pointer.x;
        p.y = pointer.y;
        p.inside = pointer.inside && i === under;
        p.dragging = pointer.dragging;
        d.live.calm = calm;
        if (driveFlower(d, dt, flowerView(cam, places[i] as (typeof places)[number])))
          moving = true;
      }
      scene.draw(cam, new Set(lives.keys()), fansNow());
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

    let dragFrom: { x: number; y: number; t: number; vx: number; vy: number; id: number } | null =
      null;

    /** The way back into a flower from its small map: the flower filling the window, as alone. */
    const flyInto = (i: number) => {
      const p = places[i];
      if (!p) return;
      const k = fitScale(p.s, cam.width, cam.height, FIT);
      flyTo(cam, { k, x: cam.width / 2 - p.x * k, y: cam.height / 2 - p.y * k });
      wake();
    };
    const flyHome = () => {
      flyTo(cam, fitView(cam.width, cam.height, home));
      wake();
    };

    const onMove = (e: PointerEvent) => {
      const p = local(e);
      pointer.x = p.x;
      pointer.y = p.y;
      pointer.inside = true;
      if (dragFrom && e.pointerId === dragFrom.id) {
        const dx = p.x - dragFrom.x;
        const dy = p.y - dragFrom.y;
        const dt = Math.max(1, e.timeStamp - dragFrom.t) / 1000;
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
          flyInto(i);
          return;
        }
      }
      node.setPointerCapture(e.pointerId);
      dragFrom = { x: p.x, y: p.y, t: e.timeStamp, vx: 0, vy: 0, id: e.pointerId };
    };
    const onUp = (e: PointerEvent) => {
      if (!dragFrom || e.pointerId !== dragFrom.id) return;
      const stale = e.timeStamp - dragFrom.t > 60;
      if (pointer.dragging && !stale) {
        const speed = Math.hypot(dragFrom.vx, dragFrom.vy) || 1;
        const cap = Math.min(1, LONGEST_THROW / speed);
        letGo(cam, dragFrom.vx * cap, dragFrom.vy * cap);
      }
      pointer.dragging = false;
      dragFrom = null;
      wake();
    };
    const onWheel = (e: WheelEvent) => {
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
      if (e.key === 'Escape') flyHome();
    };
    const onMotion = () => {
      calm = motion.matches;
      wake();
    };
    const watch = new ResizeObserver(() => {
      const r = node.getBoundingClientRect();
      resize(cam, r.width, r.height);
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

    const probeHost = window as unknown as { landscapeProbe?: unknown };
    if (probe) {
      probeHost.landscapeProbe = {
        state: () => ({
          k: cam.k,
          x: cam.x,
          y: cam.y,
          live: [...lives.keys()],
          under,
          frames,
          sleeping: raf === 0,
          nodes: node.querySelectorAll('*').length,
        }),
        spent: () => spent.splice(0),
        flowers: data.flowers.map((f, i) => ({
          i,
          title: f.title,
          x: f.place.x,
          y: f.place.y,
          s: f.place.s,
        })),
        /** A test's hand: zoom the camera by a factor at a point on screen. */
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
        flyInto,
        flyHome,
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
      for (const d of lives.values()) d.scene.dispose();
      scene.dispose();
      delete probeHost.landscapeProbe;
    };
  }, [svg, data, probe]);
}

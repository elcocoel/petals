// One flower, one frame: step its state, choose what shows, draw it. The same few lines whether the flower
// is alone (useFlowerCanvas, on /make and the bench) or one of many on the map (landscape/), so a flower
// behaves the same everywhere. Needs a DOM only through its scene.
import type { View } from './camera.ts';
import type { HoverWay } from './hover.ts';
import { type Live, newLive, noteAt, stepLive } from './live.ts';
import { type Focus, type Marks, marks } from './marks.ts';
import type { Model } from './model.ts';
import { createScene, type FakeRelations, type PetalLook, type Scene } from './scene.ts';

export interface Driven {
  m: Model;
  live: Live;
  scene: Scene;
  scratch: Float64Array;
  readout: boolean;
  /** What the last frame drew, or null before the first. */
  last: Marks | null;
}

export function newDriven(
  svg: SVGSVGElement,
  m: Model,
  o: {
    hover: HoverWay;
    width: number;
    height: number;
    calm: boolean;
    relations: FakeRelations | null;
    readout: boolean;
    bloom?: boolean;
    /** the lab's look (#76): colours, bands at rest, the highlight */
    look?: PetalLook | null;
  },
): Driven {
  return {
    m,
    live: newLive(m, o.hover, o.width, o.height, o.calm, o.bloom ?? true),
    scene: createScene(svg, m, o.relations, o.look ?? null),
    scratch: new Float64Array(m.n),
    readout: o.readout,
    last: null,
  };
}

/**
 * One frame. With a view, the camera is the map's (live.ts stepLive). Quiet, it draws no notes or band
 * names: on the map, only the flower you're pointing at or have entered speaks. True while anything moves.
 */
export function driveFlower(d: Driven, dt: number, view?: View, quiet = false): boolean {
  const { m, live, scene } = d;
  const stepped = stepLive(live, dt, view);
  const presence = live.presence.x;
  const focus: Focus | null =
    presence > 0.001
      ? {
          index: live.noteIndex,
          presence,
          open: live.open.x[live.noteIndex] as number,
          chase: noteAt(live),
          side: live.noteSide.x,
          band: live.noteIndex === live.focusIndex ? live.band : -1,
          named: live.named.x,
        }
      : null;
  const said = marks(m, live.camera, focus, live.ring, d.scratch, d.readout, live.chosen);
  const mk = quiet ? { ...said, notes: [], labels: [] } : said;
  scene.draw({
    marks: mk,
    ring: live.ring,
    view: live.camera,
    accent: live.accent,
    ringMoved: stepped.ringMoved || d.last === null,
    accentMoved: stepped.accentMoved,
    focusIndex: focus ? live.noteIndex : -1,
    raised: focus ? live.focusIndex : -1,
    bandsMoved: stepped.bandsMoved,
    band: focus ? (focus.band ?? -1) : -1,
  });
  d.last = mk;
  return stepped.moving;
}

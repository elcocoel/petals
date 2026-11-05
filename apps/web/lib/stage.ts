// The stage's arithmetic, with no DOM: how far it can zoom, when a press is a click, and the view that
// fits a box in the window. viewmodels/useStage.ts does the wiring.
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StageView {
  k: number;
  x: number;
  y: number;
}

/** Wider than one flower needs: fit stays well inside, and the canvas proof will set the real range. */
export const STAGE_ZOOM: [number, number] = [0.1, 128];

/** A press that travels further than this, in pixels, is a drag. */
export const CLICK_SLOP = 4;

export const FIT_INSET = 12;
export const FLY_MS = 240;

/** The view that shows the whole box, centred; null while either has no size. */
export function fitView(box: Box, port: { width: number; height: number }): StageView | null {
  if (box.width <= 0 || box.height <= 0 || port.width <= 0 || port.height <= 0) return null;
  const k = Math.min(
    Math.max(port.width - 2 * FIT_INSET, 1) / box.width,
    Math.max(port.height - 2 * FIT_INSET, 1) / box.height,
  );
  return {
    k,
    x: (port.width - box.width * k) / 2 - box.x * k,
    y: (port.height - box.height * k) / 2 - box.y * k,
  };
}

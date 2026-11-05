// The stage's camera: d3-zoom, writing one world transform straight to the DOM, outside React state, so
// a pan or a zoom renders nothing. An SVG attribute, not a CSS transform, so the browser redraws the
// vectors at each scale and it stays crisp at any zoom. The stage knows nothing of what's in the world.
import { select } from 'd3-selection';
import 'd3-transition';
import { type ZoomBehavior, zoom, zoomIdentity } from 'd3-zoom';
import { useCallback, useEffect, useRef } from 'react';
import { CLICK_SLOP, FLY_MS, fitView, STAGE_ZOOM } from '../lib/stage.ts';

const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useStage({
  fitKey,
  pickAttribute,
  onPick,
}: {
  /** A new key means new content: the stage fits it. */
  fitKey?: string | undefined;
  /** Which attribute names a pickable thing in the world. */
  pickAttribute?: string | undefined;
  /** A click: the value of what was under it, or null for the empty stage. A drag isn't a click. */
  onPick?: ((value: string | null) => void) | undefined;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const world = useRef<SVGGElement>(null);
  const camera = useRef<ZoomBehavior<SVGSVGElement, unknown>>(null);
  // once the person has moved the camera, a resize leaves it where they put it
  const moved = useRef(false);
  const pick = useRef({ pickAttribute, onPick });
  pick.current = { pickAttribute, onPick };

  const fit = useCallback((fly: boolean) => {
    const el = svg.current;
    const inner = world.current;
    const behaviour = camera.current;
    if (!el || !inner || !behaviour) return;
    const view = fitView(inner.getBBox(), el.getBoundingClientRect());
    if (!view) return;
    const target = zoomIdentity.translate(view.x, view.y).scale(view.k);
    const stage = select(el);
    if (fly && !calm()) stage.transition().duration(FLY_MS).call(behaviour.transform, target);
    else stage.call(behaviour.transform, target);
  }, []);

  useEffect(() => {
    const el = svg.current;
    const inner = world.current;
    if (!el || !inner) return;
    const behaviour = zoom<SVGSVGElement, unknown>()
      .scaleExtent(STAGE_ZOOM)
      .clickDistance(CLICK_SLOP)
      .on('zoom', (e) => {
        inner.setAttribute('transform', e.transform.toString());
        if (e.sourceEvent) moved.current = true;
      });
    camera.current = behaviour;
    const stage = select(el);
    stage.call(behaviour);
    // d3's double-click zooms in; here it fits
    stage.on('dblclick.zoom', null);
    const onDouble = () => {
      moved.current = false;
      fit(true);
    };
    // d3-zoom swallows the click that ends a drag, so what arrives here was a click
    const onClick = (e: MouseEvent) => {
      const { pickAttribute: attribute, onPick: picked } = pick.current;
      if (!attribute || !picked) return;
      const hit = (e.target as Element | null)?.closest?.(`[${attribute}]`);
      picked(hit?.getAttribute(attribute) ?? null);
    };
    el.addEventListener('dblclick', onDouble);
    el.addEventListener('click', onClick);
    const watch = new ResizeObserver(() => {
      if (!moved.current) fit(false);
    });
    watch.observe(el);
    return () => {
      watch.disconnect();
      el.removeEventListener('dblclick', onDouble);
      el.removeEventListener('click', onClick);
      stage.on('.zoom', null);
      camera.current = null;
    };
  }, [fit]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the key is what asks for the fit
  useEffect(() => {
    moved.current = false;
    fit(false);
  }, [fitKey, fit]);

  return {
    svg,
    world,
    fit: () => {
      moved.current = false;
      fit(true);
    },
  };
}

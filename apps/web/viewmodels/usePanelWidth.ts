// The side panel's width, sized by a hand at its edge, as VS Code's sash does: dragging writes the width
// straight to the panel, so a drag never renders; letting go keeps it, in this browser, so a reload brings it
// back; double-clicking puts the usual width back. The bounds are lib/panel-width.ts's.
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { PANEL_WIDTH, panelWidth } from '../lib/panel-width.ts';

const KEPT = 'petals:panel-width';

function kept(): number {
  try {
    const raw = window.localStorage.getItem(KEPT);
    return raw === null ? PANEL_WIDTH.usual : panelWidth(raw);
  } catch {
    return PANEL_WIDTH.usual;
  }
}

function keep(width: number) {
  try {
    window.localStorage.setItem(KEPT, String(width));
  } catch {
    // a browser that keeps nothing keeps the usual width
  }
}

/** The width, written straight to the panel's column, so a drag never renders. */
function writeTo(el: { current: HTMLElement | null }, now: { current: number }, w: number) {
  now.current = w;
  if (el.current) el.current.style.width = `${w}px`;
}

/** The sash's hands, and the panel's own: what SideRail puts on its edge and on its column. */
export interface WidthHand {
  /** The panel's column: its width is written here. */
  panel: (el: HTMLElement | null) => void;
  sash: {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
    onDoubleClick: () => void;
  };
}

export function usePanelWidth(): { width: number; hand: WidthHand } {
  const [width, setWidth] = useState<number>(PANEL_WIDTH.usual);
  const el = useRef<HTMLElement | null>(null);
  const drag = useRef<{ x: number; from: number } | null>(null);
  const now = useRef(width);
  const write = (w: number) => writeTo(el, now, w);
  // the kept width, once the browser can say it
  useEffect(() => {
    const w = kept();
    setWidth(w);
    writeTo(el, now, w);
  }, []);
  const panel = useCallback((node: HTMLElement | null) => {
    el.current = node;
    if (node) node.style.width = `${now.current}px`;
  }, []);
  const settle = (w: number) => {
    setWidth(w);
    keep(w);
  };
  const hand: WidthHand = {
    panel,
    sash: {
      onPointerDown: (e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, from: now.current };
      },
      onPointerMove: (e) => {
        if (!drag.current) return;
        write(panelWidth(drag.current.from + e.clientX - drag.current.x));
      },
      onPointerUp: () => {
        if (!drag.current) return;
        drag.current = null;
        settle(now.current);
      },
      onPointerCancel: () => {
        if (!drag.current) return;
        write(drag.current.from);
        drag.current = null;
      },
      onDoubleClick: () => {
        write(PANEL_WIDTH.usual);
        settle(PANEL_WIDTH.usual);
      },
    },
  };
  return { width, hand };
}

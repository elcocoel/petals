'use client';
import { floatBox } from '@petal/tokens';
// A map's page and a flower's page are the Power Map zoomed in (coordinator/one-source.md, step 6; Elco,
// 10 Nov: "It's always the same continuous map"). The map opens already inside that flower, under the site's
// nav, with a box beside it: a map's readings, or the flower's own box as on /make. Zooming out, Escape or an
// arrow goes on into the rest of the map. This only wires the ViewModels to the views.
import type { ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/ui/Button.tsx';
import { FloatBox } from '../components/ui/FloatBox.tsx';
import { IconButton } from '../components/ui/IconButton.tsx';
import {
  barOf,
  type CanvasChain,
  type CanvasFlower,
  LandscapeCanvas,
  ROOM,
} from '../landscape/LandscapeCanvas.tsx';
import type { Road } from '../landscape/roads.ts';
import { boxUnder, type Size } from '../lib/float-box.ts';
import type { PanelFlower } from '../lib/panel-view.ts';
import { panelWords } from '../lib/panel-words.ts';
import { useFloatBoxes } from '../viewmodels/useFloatBoxes.ts';
import { useFlowerPage } from '../viewmodels/useFlowerPage.ts';
import { FlowerPanel } from './FlowerPanel.tsx';

export interface Land {
  flowers: CanvasFlower[];
  roads: Road[];
  chains: CanvasChain[];
}

const BOXES = ['panel'] as const;

/** The one box, at the top right under the nav, as a flower's own page has it. */
function useBox() {
  const area = useRef<HTMLDivElement>(null);
  const place = useCallback(
    (win: Size) => ({ panel: boxUnder(win, area.current?.getBoundingClientRect().top ?? 0) }),
    [],
  );
  return { area, hand: useFloatBoxes(BOXES, place).panel };
}

/**
 * A map's box, which folds to its bar as the map's panels do (PM's sweep, 12 Nov: on a phone it covered the
 * flower and the legend with no way to close it). Where the map's room is narrow, a phone's, it starts folded,
 * and its bar sits at the room's foot, clear of the flower and the panels at the top; opened there, it rises
 * from the foot. Elsewhere it opens at the top right, as a flower's box does, and folds where it is.
 */
function useMapBox() {
  const area = useRef<HTMLDivElement>(null);
  const el = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(true);
  const [low, setLow] = useState(false);
  const place = useCallback(
    (win: Size) => {
      const box = boxUnder(win, area.current?.getBoundingClientRect().top ?? 0);
      if (!low) return { panel: box };
      const shown = open ? box.h : barOf(el.current);
      return { panel: { ...box, y: win.h - floatBox.inset - shown } };
    },
    [low, open],
  );
  const hand = useFloatBoxes(BOXES, place).panel;
  // before the first paint, so a phone never sees it open over the flower
  useLayoutEffect(() => {
    if ((area.current?.clientWidth ?? window.innerWidth) >= ROOM) return;
    setLow(true);
    setOpen(false);
  }, []);
  // folded, the box is its bar; open, the height it had
  useEffect(() => {
    hand.fold(open ? null : barOf(el.current));
  }, [hand, open]);
  const root = useCallback(
    (node: HTMLElement | null) => {
      el.current = node;
      hand.root(node);
    },
    [hand],
  );
  return { area, hand: { ...hand, root }, open, toggle: () => setOpen((now) => !now) };
}

/** A map's page: the map opened inside its flower, its readings in the box. */
export function MapAt({
  land,
  focus,
  title,
  children,
}: {
  land: Land;
  focus: number;
  title: string;
  children: ReactNode;
}) {
  const { area, hand, open, toggle } = useMapBox();
  return (
    <div ref={area} className="absolute inset-0">
      <LandscapeCanvas data={land} fill="area" title="Power Map" focus={focus} legend="read" />
      <FloatBox
        label="Map"
        title={title}
        surface="ground"
        hand={hand}
        folded={!open}
        control={
          <IconButton
            icon={open ? 'down' : 'chevron'}
            label={open ? panelWords.boxFold : panelWords.boxOpen}
            expanded={open}
            onClick={toggle}
          />
        }
      >
        <div className="flex flex-col gap-text-gap p-block-gap">{children}</div>
      </FloatBox>
    </div>
  );
}

/**
 * A flower's page, when its reading is on the map: the map opened inside it, this flower drawn at its map's
 * place in the person's view, and its box as /make's: a petal does the same things here as there.
 */
export function FlowerAt({
  land,
  focus,
  flower,
  note,
  about,
}: {
  land: Land;
  focus: number;
  flower: PanelFlower;
  note?: ReactNode;
  about?: ReactNode;
}) {
  const { state, actions } = useFlowerPage(flower);
  const { area, hand } = useBox();
  const reading = state.canvas?.reading;
  // This flower stands where its map does; it draws no title, as every flower on the map.
  const data = useMemo(
    () =>
      reading
        ? {
            ...land,
            flowers: land.flowers.map((f, i) =>
              i === focus ? { ...f, reading: { title: '', petals: reading.petals } } : f,
            ),
          }
        : null,
    [land, focus, reading],
  );
  const { panel } = state;
  return (
    <div ref={area} className="absolute inset-0">
      {data && (
        <LandscapeCanvas
          data={data}
          fill="area"
          title="Power Map"
          focus={focus}
          selected={state.selected}
          onPick={actions.pick}
          legend="read"
        />
      )}
      <FloatBox
        label="Flower"
        title={panel.kind === 'flower' ? panel.title : undefined}
        surface="ground"
        hand={hand}
        closed={!state.boxOpen}
        control={
          <Button variant="link" onClick={actions.closeBox}>
            Close
          </Button>
        }
      >
        {state.boxOpen && (
          <FlowerPanel
            view={panel}
            petal={state.petal}
            unit={state.unit || undefined}
            worth={state.worth}
            section={state.section}
            actions={{ onCloseDetail: actions.closeDetail, onSection: actions.setSection }}
            note={note}
            about={about}
          />
        )}
      </FloatBox>
    </div>
  );
}

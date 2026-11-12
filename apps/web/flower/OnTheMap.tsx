'use client';
// A map's page and a flower's page are the Power Map zoomed in (coordinator/one-source.md, step 6; Elco,
// 10 Nov: "It's always the same continuous map"). The map opens already inside that flower, under the site's
// nav, with a box beside it: a map's readings, or the flower's own box as on /make. Zooming out, Escape or an
// arrow goes on into the rest of the map. This only wires the ViewModels to the views.
import type { ReactNode } from 'react';
import { useCallback, useMemo, useRef } from 'react';
import { Button } from '../components/ui/Button.tsx';
import { FloatBox } from '../components/ui/FloatBox.tsx';
import {
  type CanvasChain,
  type CanvasFlower,
  LandscapeCanvas,
} from '../landscape/LandscapeCanvas.tsx';
import type { Road } from '../landscape/roads.ts';
import { boxUnder, type Size } from '../lib/float-box.ts';
import type { PanelFlower } from '../lib/panel-view.ts';
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
 * A map's page: the map opened inside its flower, and what the page says about the map (what it maps, its
 * worth, its readings) first in the map's Information box (Elco's walk 3: two boxes, Tools and Information).
 */
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
  return (
    <div className="absolute inset-0">
      <LandscapeCanvas
        data={land}
        fill="area"
        title="Power Map"
        focus={focus}
        legend="edit"
        search
        information={{ title, body: children }}
      />
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
          legend="edit"
          search
          // the flower's own box stands at the top right: Information starts under Tools
          ownBox
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

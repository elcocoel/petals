'use client';
// A flower on its own page (coordinator/one-source.md, step 4): the live flower fills the area under the
// site's nav, as /make's fills the window, with the flower's own box beside it, so a petal does the same
// things here as there. No conversation. This only wires the ViewModel to the views.
import type { ReactNode } from 'react';
import { useCallback, useRef } from 'react';
import { Button } from '../components/ui/Button.tsx';
import { FloatBox } from '../components/ui/FloatBox.tsx';
import { conversationBoxes, type Size } from '../lib/float-box.ts';
import type { PanelFlower } from '../lib/panel-view.ts';
import { useFloatBoxes } from '../viewmodels/useFloatBoxes.ts';
import { useFlowerPage } from '../viewmodels/useFlowerPage.ts';
import { FlowerCanvas } from './FlowerCanvas.tsx';
import { FlowerPanel } from './FlowerPanel.tsx';

const BOXES = ['panel'] as const;

export function FlowerPage({
  flower,
  note,
  about,
}: {
  flower: PanelFlower;
  note?: ReactNode;
  about?: ReactNode;
}) {
  const { state, actions } = useFlowerPage(flower);
  const area = useRef<HTMLDivElement>(null);
  // The box starts where /make's does, at the top right, under the nav.
  const place = useCallback((win: Size) => {
    const top = area.current?.getBoundingClientRect().top ?? 0;
    const { panel } = conversationBoxes({ w: win.w, h: win.h - top });
    return { panel: { ...panel, y: panel.y + top } };
  }, []);
  const hands = useFloatBoxes(BOXES, place);
  const { panel } = state;
  return (
    <div ref={area} className="absolute inset-0">
      <FlowerCanvas
        key={state.canvas?.key ?? 'ground'}
        fill="area"
        reading={state.canvas?.reading ?? null}
        selected={state.selected}
        onPick={actions.pick}
      />
      <FloatBox
        label="Flower"
        title={panel.kind === 'flower' ? panel.title : undefined}
        surface="ground"
        hand={hands.panel}
        closed={!state.boxOpen}
        control={
          <Button variant="link" onClick={actions.closeBox}>
            Close detail
          </Button>
        }
      >
        {state.boxOpen && (
          <FlowerPanel
            view={panel}
            petal={state.petal}
            unit={state.unit || undefined}
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

'use client';
// The page where people work (design/interaction-surface.md): the live flower fills the window, and the
// conversation floats above it, one box a hand can move and size: its thread a light sheet rising out of the
// dark base its input is (design/conversation.md). Another, the same box, shows the flower's own details
// once something asks for them. This only wires the ViewModels to the views. The canvas starts at the side
// panel's edge, and the camera fits the flower beside the conversation, not under it (#78, 11 Nov). Until
// the conversation has a flower, and when a link in it opens a map, the Power Map stands beside the
// conversation, the same live map as /map (#78), with no flower of the conversation's hard-coded in.
import type { SurfaceName } from '@petal/tokens';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Composer } from '../components/chat/Composer.tsx';
import { ConnectWallet } from '../components/chat/ConnectWallet.tsx';
import { ConversationThread } from '../components/chat/ConversationThread.tsx';
import { ModelOptions } from '../components/chat/ModelOptions.tsx';
import { useFollowScroll } from '../components/chat/useFollowScroll.ts';
import { Button } from '../components/ui/Button.tsx';
import { FloatBox } from '../components/ui/FloatBox.tsx';
import { LandscapeCanvas } from '../landscape/LandscapeCanvas.tsx';
import type { Catalogue } from '../lib/composer-options.ts';
import {
  besidePanel,
  clearOfConversation,
  conversationBoxes,
  overThread,
  recordedBoxes,
  type Size,
} from '../lib/float-box.ts';
import type { MapCard } from '../lib/maps.ts';
import type { Opened } from '../lib/thread.ts';
import { useFloatBoxes } from '../viewmodels/useFloatBoxes.ts';
import { useGroundMap } from '../viewmodels/useGroundMap.ts';
import { useWorkspace } from '../viewmodels/useWorkspace.ts';
import type { Clear } from './camera.ts';
import { FlowerCanvas } from './FlowerCanvas.tsx';
import { FlowerPanel } from './FlowerPanel.tsx';

const BOXES = ['conversation', 'panel', 'options'] as const;

export function InteractionSurface({
  scatter,
  probe,
  surface,
  ...workspace
}: {
  scatter: boolean;
  probe: boolean;
  surface: SurfaceName;
  initialRun?: string | undefined;
  /** The conversation this page follows, from the address (`?elsewhere=`). */
  initialElsewhere?: string | undefined;
  catalogue?: Catalogue | null;
  initialQuestion: string | null;
  recorded: boolean;
  opening: string;
  shelf: MapCard[];
  initialOpen: Opened;
  initialPetal: string | null;
}) {
  const { state, actions, refs } = useWorkspace(workspace);
  useFollowScroll(refs.thread, refs.following);
  // The boxes start past the side panel when it's there (the layout's, app/(work)/WorkPanel.tsx), and follow
  // its edge when it's sized or folded, until a hand moves them (design/side-panel.md, line 21).
  const from = state.menuShown ? besidePanel(state.panelEdge) : undefined;
  // The flower's box opens over the thread, not over the flower (lib/float-box.ts overThread).
  const place = useMemo(
    () => (win: Size) => {
      const boxes = workspace.recorded
        ? recordedBoxes(win, from)
        : conversationBoxes(win, undefined, from);
      return { ...boxes, panel: overThread(boxes.conversation) };
    },
    [from, workspace.recorded],
  );
  const hands = useFloatBoxes(BOXES, place);
  // What the conversation covers of the canvas, where it starts, so the flower is drawn beside it.
  const area = useRef<HTMLDivElement>(null);
  const [clear, setClear] = useState<Clear | undefined>(undefined);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const measure = () => {
      const win = { w: window.innerWidth, h: window.innerHeight };
      const r = el.getBoundingClientRect();
      setClear(clearOfConversation(place(win).conversation, r.left, r.width));
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [place]);
  const raisePanel = hands.panel.raise;
  useEffect(() => {
    if (state.boxOpen) raisePanel();
  }, [state.boxOpen, raisePanel]);
  const raiseOptions = hands.options.raise;
  useEffect(() => {
    if (state.modelsOpen) raiseOptions();
  }, [state.modelsOpen, raiseOptions]);
  const { onCanvas, panel } = state;
  // The Power Map: at the map a link opened, or whole until the conversation has a flower.
  const land = useGroundMap();
  const ground = state.mapAt ?? (onCanvas ? null : { map: null });
  const focus = ground?.map && land ? land.flowers.findIndex((f) => f.map === ground.map) : -1;
  // where it starts is measured (what the conversation covers), so it's painted as the boxes are
  const mapArea = useRef<HTMLDivElement>(null);
  const shown = Boolean(ground && land);
  useLayoutEffect(() => {
    if (shown && mapArea.current) mapArea.current.style.left = `${clear?.left ?? 0}px`;
  }, [shown, clear?.left]);
  return (
    <>
      {/* A new flower is a new scene. Anything else, a whole turn included, leaves the camera alone. */}
      <div ref={area} className="relative h-dvh">
        {ground && land ? (
          // beside the conversation, as the flower is, so its chains and its flowers aren't under it
          <div ref={mapArea} className="absolute inset-y-0 right-0 left-0">
            <LandscapeCanvas
              key={ground.map ?? 'whole'}
              data={land}
              fill="area"
              title="Power Map"
              focus={focus}
            />
          </div>
        ) : (
          <FlowerCanvas
            key={onCanvas?.key ?? 'ground'}
            fill="area"
            reading={onCanvas?.reading ?? null}
            scatter={scatter}
            probe={probe}
            selected={state.selected}
            onPick={actions.pick}
            clear={clear}
          />
        )}
      </div>
      <FloatBox
        label={state.heading}
        title={state.heading}
        surface={surface}
        hand={hands.conversation}
        // Work from another door goes on in its own app: its thread says so, and there's no base to send
        // from (design/conversation.md, line 18).
        foot={
          state.composer.away ? undefined : (
            <>
              {state.needsWallet && (
                <ConnectWallet
                  question={state.question}
                  busy={state.session.busy}
                  failed={state.session.failed}
                  onConnect={state.session.connect}
                />
              )}
              {/* Hidden, not gone, so what's in it and the way to it stay while someone connects. */}
              <div hidden={!state.composerShown} className="flex min-h-0 flex-1 flex-col">
                <Composer
                  view={state.composer}
                  boxRef={refs.box}
                  device
                  className="px-block-gap py-space-16"
                  controls={
                    (state.pill || state.balance) && (
                      <span className="flex flex-wrap items-center gap-space-8">
                        {state.pill && (
                          <Button
                            variant="pill"
                            pressed={state.modelsOpen}
                            onClick={actions.toggleModels}
                          >
                            {state.pill}
                          </Button>
                        )}
                        {state.balance && (
                          <span className="type-mono text-muted">{state.balance}</span>
                        )}
                      </span>
                    )
                  }
                  onChange={actions.setQuestion}
                  onSend={() => void actions.send()}
                />
              </div>
            </>
          )
        }
      >
        {/* Petals' greeting and the thread. */}
        <ConversationThread
          recorded={state.recorded}
          rows={state.rows}
          thumbs={state.thumbs}
          threadRef={refs.thread}
          className="px-block-gap pt-space-16 overscroll-none"
          openWord=""
          onOpenTurn={actions.openTurn}
          onOpenStored={actions.openStored}
          onRefollow={actions.refollow}
          onLink={actions.followLink}
          pay={{ ...state.pay, onPay: actions.pay }}
          jobs={state.jobs}
          jobControls={state.jobControls}
        />
      </FloatBox>
      <FloatBox
        label="Model"
        title="Model"
        surface={surface}
        hand={hands.options}
        closed={!state.modelsOpen}
      >
        <ModelOptions options={state.models} onPick={actions.pickModel} />
      </FloatBox>
      {/* Who's signed in, and the way out, are the side panel's Profile section (PANEL, WORKSPACE, 10 Nov). */}
      <FloatBox
        label="Flower"
        title={panel.kind === 'flower' ? panel.title : undefined}
        surface={surface}
        hand={hands.panel}
        closed={!state.boxOpen}
        control={
          // closes the box; the petal's own way back is in it (PetalDetails)
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
            section={state.section}
            actions={{
              onCloseDetail: actions.closeDetail,
              onSection: actions.setSection,
              onShelf: actions.showShelf,
              onOpenStored: actions.openStored,
              onStarter: actions.startFrom,
            }}
            conversation={state.conversationRef}
          />
        )}
      </FloatBox>
    </>
  );
}

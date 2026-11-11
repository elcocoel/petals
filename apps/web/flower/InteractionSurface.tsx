'use client';
// The page where people work (design/interaction-surface.md): the live flower fills the window, and the
// conversation floats above it, one box a hand can move and size: its thread a light sheet rising out of the
// dark base its input is (design/conversation.md). Another, the same box, shows the flower's own details
// once something asks for them. This only wires the ViewModels to the views. The
// camera isn't told about the boxes. Until the conversation has a flower, the canvas is empty ground
// (Elco, 8 Nov: no flower hard-coded in).
import type { SurfaceName } from '@petal/tokens';
import { useEffect, useMemo, useRef } from 'react';
import { Composer } from '../components/chat/Composer.tsx';
import { ConnectWallet } from '../components/chat/ConnectWallet.tsx';
import { ConversationThread } from '../components/chat/ConversationThread.tsx';
import { ModelOptions } from '../components/chat/ModelOptions.tsx';
import { useFollowScroll } from '../components/chat/useFollowScroll.ts';
import { Button } from '../components/ui/Button.tsx';
import { FloatBox } from '../components/ui/FloatBox.tsx';
import type { Catalogue } from '../lib/composer-options.ts';
import { besidePanel, conversationBoxes, recordedBoxes, type Size } from '../lib/float-box.ts';
import type { MapCard } from '../lib/maps.ts';
import type { Opened } from '../lib/thread.ts';
import { useFloatBoxes } from '../viewmodels/useFloatBoxes.ts';
import { useWorkspace } from '../viewmodels/useWorkspace.ts';
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
  // The boxes start past the side panel when it's there (the layout's, app/(work)/WorkPanel.tsx). Placed
  // again only if that changes.
  // At the panel's width when this conversation opens (design/side-panel.md, line 21): sizing or
  // collapsing it afterwards doesn't move a box.
  const openedBeside = useRef<number | null>(null);
  if (state.menuShown && openedBeside.current === null) openedBeside.current = state.panelEdge;
  const from =
    state.menuShown && openedBeside.current !== null
      ? besidePanel(openedBeside.current)
      : undefined;
  const place = useMemo(
    () =>
      workspace.recorded
        ? (win: Size) => recordedBoxes(win, from)
        : (win: Size) => conversationBoxes(win, undefined, from),
    [from, workspace.recorded],
  );
  const hands = useFloatBoxes(BOXES, place);
  const raisePanel = hands.panel.raise;
  useEffect(() => {
    if (state.boxOpen) raisePanel();
  }, [state.boxOpen, raisePanel]);
  const raiseOptions = hands.options.raise;
  useEffect(() => {
    if (state.modelsOpen) raiseOptions();
  }, [state.modelsOpen, raiseOptions]);
  const { onCanvas, panel } = state;
  return (
    <>
      {/* A new flower is a new scene. Anything else, a whole turn included, leaves the camera alone. */}
      <FlowerCanvas
        key={onCanvas?.key ?? 'ground'}
        reading={onCanvas?.reading ?? null}
        scatter={scatter}
        probe={probe}
        selected={state.selected}
        onPick={actions.pick}
      />
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

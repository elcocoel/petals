'use client';
// The page where people work (design/interaction-surface.md): the live flower fills the window, and the
// conversation floats above it in two boxes a hand can move and size. A third, the same box, shows the
// flower's own details once something asks for them. This only wires the ViewModels to the views. The
// camera isn't told about the boxes. Until the conversation has a flower, the canvas is empty ground
// (Elco, 8 Nov: no flower hard-coded in).
import type { SurfaceName } from '@petal/tokens';
import { useEffect, useMemo } from 'react';
import { Composer } from '../components/chat/Composer.tsx';
import { ConnectWallet } from '../components/chat/ConnectWallet.tsx';
import { ConversationThread } from '../components/chat/ConversationThread.tsx';
import { ModelOptions } from '../components/chat/ModelOptions.tsx';
import { useFollowScroll } from '../components/chat/useFollowScroll.ts';
import { WhoIsHere } from '../components/chat/WhoIsHere.tsx';
import { Button } from '../components/ui/Button.tsx';
import { FloatBox } from '../components/ui/FloatBox.tsx';
import { WorkMenu } from '../components/workspace/WorkMenu.tsx';
import type { Catalogue } from '../lib/composer-options.ts';
import { besideMenu, conversationBoxes, recordedBoxes, type Size } from '../lib/float-box.ts';
import type { MapCard } from '../lib/maps.ts';
import type { Opened } from '../lib/thread.ts';
import { useFloatBoxes } from '../viewmodels/useFloatBoxes.ts';
import { useWorkspace } from '../viewmodels/useWorkspace.ts';
import { FlowerCanvas } from './FlowerCanvas.tsx';
import { FlowerPanel } from './FlowerPanel.tsx';

const BOXES = ['output', 'input', 'panel', 'options'] as const;

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
  // The boxes start past the work menu when it's there. Placed again only if that changes.
  const from = state.menuShown ? besideMenu : undefined;
  const place = useMemo(
    () =>
      workspace.recorded ? recordedBoxes : (win: Size) => conversationBoxes(win, undefined, from),
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
      {state.menuShown && <WorkMenu conversations={state.conversations} menu={state.menu} />}
      <FloatBox label={state.heading} title={state.heading} surface={surface} hand={hands.output}>
        {/* Petals' greeting and the thread. */}
        <ConversationThread
          recorded={state.recorded}
          rows={state.rows}
          thumbs={state.thumbs}
          threadRef={refs.thread}
          className="px-block-gap pt-block-gap overscroll-none"
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
        label={state.composer.label}
        title={state.composer.label}
        surface={surface}
        hand={hands.input}
      >
        {state.needsWallet && (
          <ConnectWallet
            question={state.question}
            busy={state.session.busy}
            failed={state.session.failed}
            onConnect={state.session.connect}
          />
        )}
        {/* Hidden, not gone, so what's in it and the way to it stay while someone connects. */}
        <div hidden={!state.composerShown}>
          <Composer
            view={state.composer}
            boxRef={refs.box}
            className="px-block-gap pt-text-gap pb-block-gap"
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
                  {state.balance && <span className="type-mono text-muted">{state.balance}</span>}
                </span>
              )
            }
            onChange={actions.setQuestion}
            onSend={() => void actions.send()}
          />
        </div>
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
      {/* Proposal (8 Nov, fe-frontdoor): the account is its own thing, apart from the work, in a corner. */}
      {state.session.account && (
        <div className="fixed top-0 right-0">
          <WhoIsHere
            account={state.session.account.replace(
              /\b([0-9a-f]{6})[0-9a-f]{54}([0-9a-f]{4})\b/g,
              '$1…$2',
            )}
            onDisconnect={state.session.disconnect}
          />
        </div>
      )}
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
          />
        )}
      </FloatBox>
    </>
  );
}

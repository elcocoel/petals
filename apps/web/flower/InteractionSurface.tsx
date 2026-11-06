'use client';
// The page where people work (design/interaction-surface.md): the live flower fills the window, and the
// conversation floats above it in two boxes a hand can move and size. This only wires the ViewModels to
// the views. The camera isn't told about the boxes. Until the conversation has a flower, the canvas holds
// a stand-in the server chose, which is only that: it never joins the conversation or the address.
import type { SurfaceName } from '@petal/tokens';
import { Composer } from '../components/chat/Composer.tsx';
import { ConversationThread } from '../components/chat/ConversationThread.tsx';
import { useFollowScroll } from '../components/chat/useFollowScroll.ts';
import { FloatBox } from '../components/ui/FloatBox.tsx';
import { conversationBoxes, recordedBoxes } from '../lib/float-box.ts';
import type { ListedFlower } from '../lib/flower-view.ts';
import { type CanvasFlower, canvasShown } from '../lib/panel-view.ts';
import type { Opened } from '../lib/thread.ts';
import { useFloatBoxes } from '../viewmodels/useFloatBoxes.ts';
import { useWorkspace } from '../viewmodels/useWorkspace.ts';
import { FlowerCanvas } from './FlowerCanvas.tsx';

const BOXES = ['output', 'input'] as const;

export function InteractionSurface({
  standIn,
  scatter,
  probe,
  surface,
  ...workspace
}: {
  standIn: CanvasFlower | null;
  scatter: boolean;
  probe: boolean;
  surface: SurfaceName;
  initialRun?: string | undefined;
  initialQuestion: string | null;
  recorded: boolean;
  opening: string;
  shelf: ListedFlower[];
  initialOpen: Opened;
  initialPetal: string | null;
}) {
  const { state, actions, refs } = useWorkspace(workspace);
  useFollowScroll(refs.thread, refs.following);
  const hands = useFloatBoxes(BOXES, workspace.recorded ? recordedBoxes : conversationBoxes);
  const onCanvas = canvasShown(state.canvas, state.comingBack, standIn);
  return (
    <>
      {/* A new flower is a new scene. Anything else, a whole turn included, leaves the camera alone. */}
      <FlowerCanvas
        key={onCanvas?.key ?? 'ground'}
        reading={onCanvas?.reading ?? null}
        scatter={scatter}
        probe={probe}
      />
      <FloatBox label={state.heading} title={state.heading} surface={surface} hand={hands.output}>
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
        />
      </FloatBox>
      <FloatBox
        label={state.composer.label}
        title={state.composer.label}
        surface={surface}
        hand={hands.input}
      >
        <Composer
          view={state.composer}
          boxRef={refs.box}
          className="px-block-gap pt-text-gap pb-block-gap"
          onChange={actions.setQuestion}
          onSend={() => void actions.send()}
        />
      </FloatBox>
    </>
  );
}

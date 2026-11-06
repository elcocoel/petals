'use client';
// The workspace: the conversation and the panel beside it. This only wires the ViewModel to the views.
// The logic is in viewmodels/useWorkspace.ts, the words and decisions in lib/thread-view.ts and
// lib/panel-view.ts, the calls in lib/agent-client.ts.
import type { ListedFlower } from '../lib/flower-view.ts';
import type { Opened } from '../lib/thread.ts';
import { useWorkspace } from '../viewmodels/useWorkspace.ts';
import { Composer } from './chat/Composer.tsx';
import { ConversationThread } from './chat/ConversationThread.tsx';
import { useFollowScroll } from './chat/useFollowScroll.ts';
import { FlowerPanel } from './workspace/FlowerPanel.tsx';

export function Workspace(props: {
  initialRun?: string | undefined;
  recorded?: boolean;
  opening?: string;
  shelf: ListedFlower[];
  initialOpen?: Opened;
  initialPetal?: string | null;
}) {
  const { state, actions, refs } = useWorkspace(props);
  useFollowScroll(refs.thread, refs.following);
  return (
    <>
      <section
        aria-label="Conversation"
        className="flex h-dvh min-h-0 min-w-0 flex-col border-b border-hairline wide:h-auto wide:basis-conversation-width wide:border-r wide:border-b-0"
      >
        <ConversationThread
          heading={state.heading}
          recorded={state.recorded}
          rows={state.rows}
          thumbs={state.thumbs}
          threadRef={refs.thread}
          onOpenTurn={actions.openTurn}
          onOpenStored={actions.openStored}
          onRefollow={actions.refollow}
          onLink={actions.followLink}
        />
        <Composer
          view={state.composer}
          boxRef={refs.box}
          onChange={actions.setQuestion}
          onSend={() => void actions.send()}
        />
      </section>
      <FlowerPanel
        view={state.panel}
        petal={state.petal}
        unit={state.unit || undefined}
        section={state.section}
        actions={{
          onSelect: actions.select,
          onCloseDetail: actions.closeDetail,
          onSection: actions.setSection,
          onShelf: actions.showShelf,
          onOpenStored: actions.openStored,
          onStarter: actions.startFrom,
        }}
      />
    </>
  );
}

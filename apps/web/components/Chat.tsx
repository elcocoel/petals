'use client';
// The maker chat: the box stays fixed at the bottom, the thread grows above it with the newest at the
// bottom. This only wires the ViewModel to the views. The logic is in viewmodels/useMakeChat.ts, the
// words and decisions in lib/thread-view.ts, the calls in lib/agent-client.ts.
import type { FlowerRow } from '../lib/thread-view.ts';
import { useDrawnFlower } from '../viewmodels/useDrawnFlower.ts';
import { useMakeChat } from '../viewmodels/useMakeChat.ts';
import { Composer } from './chat/Composer.tsx';
import { FlowerCard } from './chat/FlowerCard.tsx';
import { Thread } from './chat/Thread.tsx';
import { useFollowScroll } from './chat/useFollowScroll.ts';

function DrawnFlowerCard({ row }: { row: FlowerRow }) {
  const { drawn, failed } = useDrawnFlower(row.flower.spec);
  return <FlowerCard row={row} drawn={drawn} failed={failed} />;
}

export function Chat(props: { initialRun?: string; recorded?: boolean; opening?: string }) {
  const { state, actions, refs } = useMakeChat(props);
  useFollowScroll(refs.thread, refs.following);
  return (
    <>
      <Thread
        rows={state.rows}
        threadRef={refs.thread}
        renderFlower={(row) => <DrawnFlowerCard key={row.key} row={row} />}
        onRefollow={actions.refollow}
      />
      <Composer
        view={state.composer}
        boxRef={refs.box}
        onChange={actions.setQuestion}
        onSend={() => void actions.send()}
      />
    </>
  );
}

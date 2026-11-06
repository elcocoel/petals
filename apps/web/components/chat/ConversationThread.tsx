// The thread as every surface shows it: its rows, the recorded notice, and a flower's row wired to what
// opens it. A surface says only where the thread sits and what the open row says.
import type { Ref } from 'react';
import type { Row } from '../../lib/thread-view.ts';
import { Thread } from './Thread.tsx';
import { TurnFlower } from './TurnFlower.tsx';

export function ConversationThread({
  heading,
  recorded,
  rows,
  thumbs,
  threadRef,
  className,
  openWord,
  onOpenTurn,
  onOpenStored,
  onRefollow,
  onLink,
}: {
  heading?: string;
  recorded: boolean;
  rows: Row[];
  /** Each drawn flower's picture, by its spec's hash. */
  thumbs: Record<string, string>;
  threadRef?: Ref<HTMLDivElement>;
  className?: string;
  openWord?: string;
  onOpenTurn: (index: number) => void;
  onOpenStored: (id: string) => void;
  onRefollow: () => void;
  onLink: (href: string) => boolean;
}) {
  return (
    <Thread
      {...(heading ? { heading } : {})}
      {...(className ? { className } : {})}
      {...(recorded
        ? {
            notice: (
              <p className="border-heavy border-primary p-text-gap type-caption">
                <strong>Recorded demo. No AI is running.</strong> This plays back one saved run
                about NEAR’s validators. It can’t read a question yet, so there’s nothing to type.
                The real agent switches on once a NEAR AI key is set.
              </p>
            ),
          }
        : {})}
      rows={rows}
      {...(threadRef ? { threadRef } : {})}
      renderFlower={(row) => {
        const thumb = row.kind === 'stored' ? row.image : thumbs[row.flower.spec_sha256];
        return (
          <TurnFlower
            key={row.key}
            title={row.title}
            sub={row.sub}
            open={row.open}
            {...(thumb ? { thumb } : {})}
            {...(openWord === undefined ? {} : { openWord })}
            onOpen={() => (row.kind === 'flower' ? onOpenTurn(row.index) : onOpenStored(row.id))}
          />
        );
      }}
      onRefollow={onRefollow}
      onLink={onLink}
    />
  );
}

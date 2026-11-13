// The thread as every surface shows it: its rows, the recorded notice, and a flower's row wired to what
// opens it. A surface says only where the thread sits and what the open row says.
import type { NextStep as StepOnMap } from '@petal/core/types';
import type { ReactNode, Ref } from 'react';
import { type Job, type JobControlsView, jobLine } from '../../lib/jobs.ts';
import { payWords } from '../../lib/pay.ts';
import type { Row } from '../../lib/thread-view.ts';
import { NextSteps } from '../NextSteps.tsx';
import { CeremonyCard } from './CeremonyCard.tsx';
import { CreditPointer } from './CreditPointer.tsx';
import { JobRow } from './JobRow.tsx';
import { Thread } from './Thread.tsx';
import { TurnFlower } from './TurnFlower.tsx';

export function ConversationThread({
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
  empty,
  jobs,
  jobControls,
  onMapIt,
  next,
}: {
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
  /** What an empty conversation shows instead of a thread: the page's own suggestions (NewConversation). */
  empty?: ReactNode;
  /** Where each handed job stands, and the hand-over (C). */
  jobs?: Record<string, Job>;
  /** The person's say over each job: its state after a move, and its controls (swarm.md, step 3). */
  jobControls?: { now: (j: Job) => Job; controlsFor: (j: Job) => JobControlsView };
  /** A new map's ceremony, pressed: Petals' agent hears the person's yes (lib/ceremony.ts). */
  onMapIt?: () => void;
  /** What can be done next on the map just read: each step pressed, and the services folded under More. */
  next?: { onStep: (step: StepOnMap) => void; moreOpen: boolean; onMore: () => void };
}) {
  return (
    <Thread
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
        : rows.length === 0 && empty
          ? { notice: empty }
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
      // credit is added in the lobby's Balance: a refusal for want of it points there
      renderPay={(row) => (
        <p key={row.key} className="my-0 type-ui">
          <CreditPointer line={payWords.outOf} />
        </p>
      )}
      renderJob={(row) => {
        const listed = jobs?.[row.job.id];
        const known = listed && jobControls ? jobControls.now(listed) : listed;
        const line = jobLine(row.job, known);
        return (
          <JobRow
            key={row.key}
            text={line.text}
            summary={line.summary}
            conversation={line.conversation}
            controls={known && jobControls ? jobControls.controlsFor(known) : undefined}
          />
        );
      }}
      renderCeremony={(row) =>
        onMapIt ? <CeremonyCard key={row.key} view={row.view} onMapIt={onMapIt} /> : null
      }
      renderNext={(row) => {
        if (!next) return null;
        const bind = (s: StepOnMap) => ({
          key: `${s.label}:${s.ask}`,
          label: s.label,
          onPress: () => next.onStep(s),
        });
        return (
          <NextSteps
            key={row.key}
            steps={row.next.steps.map(bind)}
            more={{
              open: next.moreOpen,
              onToggle: next.onMore,
              steps: row.next.services.map(bind),
            }}
          />
        );
      }}
      onRefollow={onRefollow}
      onLink={onLink}
    />
  );
}

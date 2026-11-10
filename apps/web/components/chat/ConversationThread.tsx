// The thread as every surface shows it: its rows, the recorded notice, and a flower's row wired to what
// opens it. A surface says only where the thread sits and what the open row says.
import type { Ref } from 'react';
import type { TopUpView } from '../../lib/intents.ts';
import { type Job, jobLine } from '../../lib/jobs.ts';
import type { PayPhase } from '../../lib/pay.ts';
import type { Row } from '../../lib/thread-view.ts';
import { JobRow } from './JobRow.tsx';
import { PayRow } from './PayRow.tsx';
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
  pay,
  jobs,
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
  /** Paying for Petals' agent, for the live pay row (B). */
  pay?: {
    asking: string | null;
    phase: PayPhase;
    added: string | null;
    onPay: () => void;
    /** Paying with any other token, through NEAR Intents. */
    topUp?: TopUpView;
  };
  /** Where each handed job stands, and the hand-over (C). */
  jobs?: Record<string, Job>;
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
      renderPay={(key) =>
        pay && key === pay.asking ? (
          <PayRow
            key={key}
            phase={pay.phase}
            added={pay.added}
            onPay={pay.onPay}
            {...(pay.topUp ? { topUp: pay.topUp } : {})}
          />
        ) : null
      }
      renderJob={(row) => {
        const line = jobLine(row.job, jobs?.[row.job.id]);
        return <JobRow key={row.key} text={line.text} summary={line.summary} />;
      }}
      onRefollow={onRefollow}
      onLink={onLink}
    />
  );
}

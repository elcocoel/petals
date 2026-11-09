// The thread: rows from thread-view.ts, in order, the newest at the bottom. It scrolls inside its
// column, and the box stays below it. A flower's row is drawn by whoever composes this, so the view
// holds no state and no calls.
import type { ReactNode, Ref } from 'react';
import type { FlowerRow, JobRowData, Row, StoredRow } from '../../lib/thread-view.ts';
import { Markdown } from '../Markdown.tsx';
import { AnsweredBy } from './AnsweredBy.tsx';
import { Speech } from './Speech.tsx';
import { Steps } from './Steps.tsx';
import { TurnStatus } from './TurnStatus.tsx';

export function Thread({
  heading,
  notice,
  rows,
  threadRef,
  className = 'pt-column-gap pr-space-32 pl-column-gap',
  renderFlower,
  renderPay,
  renderJob,
  onRefollow,
  onLink,
}: {
  heading?: string;
  /** Said once above the thread, like a recorded run saying so. */
  notice?: ReactNode;
  rows: Row[];
  threadRef?: Ref<HTMLDivElement>;
  /** Where it sits in whatever holds it. By default, the conversation's column. */
  className?: string;
  renderFlower: (row: FlowerRow | StoredRow) => ReactNode;
  /** The way to add credit, drawn by whoever composes this, as a flower's row is. */
  renderPay?: (key: string) => ReactNode;
  /** A job handed to the person's own agent, drawn by whoever composes this (C). */
  renderJob?: (row: JobRowData) => ReactNode;
  onRefollow?: () => void;
  /** A link in the agent's words: true when it was handled here and shouldn't navigate. */
  onLink?: (href: string) => boolean;
}) {
  return (
    <div className={`min-h-0 flex-1 overflow-y-auto ${className}`} ref={threadRef}>
      <div className="flex flex-col gap-block-gap pb-block-gap">
        {heading && <h2 className="m-0 type-heading">{heading}</h2>}
        {notice}
        {rows.map((row): ReactNode => {
          switch (row.kind) {
            case 'user':
              return (
                <Speech
                  key={row.key}
                  speaker={row.label}
                  {...(row.about ? { note: row.about } : {})}
                >
                  {row.text}
                </Speech>
              );
            case 'note':
              return (
                <p key={row.key} className="type-caption text-muted">
                  {row.text}
                </p>
              );
            case 'steps':
              return <Steps key={row.key} summary={row.summary} steps={row.steps} />;
            case 'message':
              return (
                <Speech
                  key={row.key}
                  agent={!row.foreign}
                  {...(row.speaker ? { speaker: row.speaker } : {})}
                >
                  <Markdown blocks={row.blocks} onLink={onLink} />
                </Speech>
              );
            case 'flower':
            case 'stored':
              return renderFlower(row);
            case 'error':
              return (
                <p key={row.key} className="error">
                  {row.text}
                </p>
              );
            case 'pay':
              return renderPay?.(row.key) ?? null;
            case 'job':
              return renderJob?.(row) ?? null;
            case 'done':
              return <AnsweredBy key={row.key} line={row.line} />;
            case 'turn':
              return <TurnStatus key={row.key} row={row} onRefollow={onRefollow} />;
            default:
              return null;
          }
        })}
      </div>
    </div>
  );
}

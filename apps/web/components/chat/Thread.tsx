// The thread: rows from thread-view.ts, in order, the newest at the bottom. A flower is drawn by
// whoever composes this, so the view holds no state and no calls.
import type { ReactNode, Ref } from 'react';
import type { FlowerRow, Row } from '../../lib/thread-view.ts';
import { Markdown } from '../Markdown.tsx';
import { AnsweredBy } from './AnsweredBy.tsx';
import { Steps } from './Steps.tsx';

export function Thread({
  rows,
  threadRef,
  renderFlower,
  onRefollow,
}: {
  rows: Row[];
  threadRef?: Ref<HTMLDivElement>;
  renderFlower: (row: FlowerRow) => ReactNode;
  onRefollow?: () => void;
}) {
  return (
    <div className="thread" ref={threadRef}>
      {rows.map((row): ReactNode => {
        switch (row.kind) {
          case 'user':
            return (
              <p key={row.key} className="you">
                <strong>You:</strong> {row.text}
              </p>
            );
          case 'note':
            return (
              <p key={row.key} className="muted">
                {row.text}
              </p>
            );
          case 'steps':
            return <Steps key={row.key} summary={row.summary} steps={row.steps} />;
          case 'message':
            return <Markdown key={row.key} blocks={row.blocks} />;
          case 'flower':
            return renderFlower(row);
          case 'error':
            return (
              <p key={row.key} className="error">
                {row.text}
              </p>
            );
          case 'done':
            return <AnsweredBy key={row.key} line={row.line} />;
          case 'turn':
            return (
              <p key={row.key} className="muted" role="status" data-turn-stage={row.stage}>
                {row.text}
                {row.refollow && (
                  <>
                    {' '}
                    <button type="button" onClick={onRefollow} disabled={row.refollow.disabled}>
                      {row.refollow.label}
                    </button>
                  </>
                )}
              </p>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

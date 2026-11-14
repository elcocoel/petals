// Where a turn stands, while it's going or after it's lost (Figma's "Agent progress" 39:679), with the
// words thread-view.ts chose. There's no Stop: nothing on the server can witness one yet.
import type { TurnRow } from '../../lib/thread-view.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/Icon.tsx';

export function TurnStatus({ row, onRefollow }: { row: TurnRow; onRefollow?: () => void }) {
  return (
    <div role="status" data-turn-stage={row.stage} className="flex flex-col gap-space-4">
      {row.headline && (
        <p className="flex items-center gap-space-8 type-ui">
          <Icon name="petals" small />
          {row.headline}
        </p>
      )}
      {row.doing && (
        // each step as it starts; the one running now ends on a blinking cursor (row.cursor)
        <ol className="m-0 flex list-none flex-col gap-space-4 p-0">
          {row.doing.map((d, k) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: the steps only grow, in the order they started
              key={k}
              data-b="row"
              className={`flex items-center gap-space-8 type-ui ${d.done ? 'text-muted' : ''}`}
            >
              <p className="m-0">
                {d.text}
                {d.failed ? ' · didn’t work' : d.done ? '' : '…'}
              </p>
              {!d.done && <span aria-hidden className="h-lh w-text-gap shrink-0 bg-accent" />}
            </li>
          ))}
        </ol>
      )}
      <p className="type-ui text-muted">{row.text}</p>
      {row.refollow && (
        <Button variant="link" onClick={onRefollow} disabled={row.refollow.disabled}>
          {row.refollow.label}
        </Button>
      )}
    </div>
  );
}

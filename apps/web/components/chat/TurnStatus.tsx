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
      <p className="type-ui text-muted">{row.text}</p>
      {row.refollow && (
        <Button variant="link" onClick={onRefollow} disabled={row.refollow.disabled}>
          {row.refollow.label}
        </Button>
      )}
    </div>
  );
}

// Who's connected, as the data names them, and the way out.
import { doorWords } from '../../lib/door-words.ts';
import { Button } from '../ui/Button.tsx';
import { Mono } from '../ui/Mono.tsx';

export function WhoIsHere({
  account,
  onDisconnect,
}: {
  account: string;
  onDisconnect: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-text-gap px-block-gap pt-block-gap">
      <span className="min-w-0 wrap-anywhere">
        <Mono as="span">{account}</Mono>
      </span>
      <Button variant="quiet" onClick={onDisconnect}>
        {doorWords.disconnect}
      </Button>
    </div>
  );
}

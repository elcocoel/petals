// The one press that publishes what a person mapped (lib/publish-press.ts), as an action of its own, laid straight
// on the panel it stands in: a title that stays the same in every state with the press beside it, what goes on
// one line under it, and one line that always says the true step (ready, preparing, waiting for the wallet,
// sending, then what happened), swapping in place and running on a cursor while it runs. Nothing is folded away.
// Props only.
import { useId } from 'react';
import type { PublishPressView } from '../lib/publish-press.ts';
import { Button } from './ui/Button.tsx';

export function PublishPress({
  view,
  onPublish,
}: {
  view: PublishPressView;
  onPublish: () => void;
}) {
  const id = useId();
  if (!view.title || !view.press) {
    return view.step ? <Step text={view.step} running={view.running} /> : null;
  }
  return (
    <section aria-labelledby={id} className="flex flex-col gap-space-4">
      <div className="flex min-h-control-height items-center gap-text-gap">
        <h3 id={id} className="m-0 type-label font-semibold">
          {view.title}
        </h3>
        <div className="ml-auto shrink-0">
          <Button variant="compact" disabled={view.busy} onClick={onPublish}>
            {view.press}
          </Button>
        </div>
      </div>
      {/* what goes, one unbroken line; kept in place while it's read, so nothing below moves */}
      <p className="m-0 min-h-lh type-ui whitespace-nowrap">{view.count}</p>
      <Step text={view.step ?? view.sign} running={view.running} quiet={!view.step} />
    </section>
  );
}

/** Where the press stands, in one line that swaps in place: running on a cursor (row.cursor) while it runs. */
function Step({
  text,
  running,
  quiet = false,
}: {
  text: string;
  running: boolean;
  quiet?: boolean;
}) {
  return (
    <div data-b="row" role="status" className="flex items-center gap-space-8">
      <p className={`my-0 type-ui ${quiet ? 'text-muted' : ''}`}>{text}</p>
      {running && <span aria-hidden className="h-lh w-text-gap shrink-0 bg-accent" />}
    </div>
  );
}

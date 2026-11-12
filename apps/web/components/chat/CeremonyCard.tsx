// Mapping something new, as a ceremony (Elco, 12 Nov): what will be read, who reads it, that it becomes a new
// data packet in the person's name, and one press that starts it. Nothing expensive runs before the press.
// Props only; the words and the decision are lib/ceremony.ts's.
import type { CeremonyView } from '../../lib/ceremony.ts';
import { Button } from '../ui/Button.tsx';

export function CeremonyCard({ view, onMapIt }: { view: CeremonyView; onMapIt: () => void }) {
  return (
    <section className="flex flex-col items-start gap-text-gap border border-hairline p-text-gap">
      <h3 className="m-0 type-ui font-semibold">{view.heading}</h3>
      <p className="my-0 type-ui">{view.what}</p>
      {view.cost && <p className="my-0 type-ui text-muted">{view.cost}</p>}
      <p className="my-0 type-ui text-muted">{view.who}</p>
      <p className="my-0 type-ui text-muted">{view.note}</p>
      <Button variant="compact" onClick={onMapIt}>
        {view.button}
      </Button>
    </section>
  );
}

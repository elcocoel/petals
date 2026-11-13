// An empty conversation: a heading and where to start, the maps already on the Power Map as suggestions. It is
// the page's own text, not something the agent said, so it carries no speaker and never reaches the model.
// Each suggestion opens its map beside the conversation. Props only; words from lib/opening.ts.
import { newConversationWords } from '../../lib/opening.ts';
import { Button } from '../ui/Button.tsx';

export function NewConversation({
  starts,
  onOpen,
}: {
  /** the maps to start from, each with the link that opens it */
  starts: readonly { label: string; href: string }[];
  onOpen: (href: string) => void;
}) {
  return (
    <div className="flex flex-col gap-text-gap py-space-16">
      <h2 className="my-0 type-heading">{newConversationWords.heading}</h2>
      {starts.length > 0 && (
        <div className="flex flex-wrap gap-space-8">
          {starts.map((s) => (
            <Button key={s.href} variant="starter" onClick={() => onOpen(s.href)}>
              {s.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

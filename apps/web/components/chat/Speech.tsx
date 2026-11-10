// One turn's words: who is speaking, then what they said (Figma's "You" 39:894 and "Petals" 39:898). A
// speaker is left out where the same one goes on speaking.
import type { ReactNode } from 'react';
import { Icon } from '../ui/Icon.tsx';

export function Speech({
  speaker,
  agent = false,
  note,
  children,
}: {
  speaker?: string;
  /** The agent's mark beside the name: Petals' own sign, as the side panel shows its conversations. */
  agent?: boolean;
  /** Said quietly above the words, like what a question carried. */
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-space-8">
      {speaker && (
        <p className="flex items-center gap-space-8 type-caption">
          {agent && <Icon name="petals" small />}
          {speaker}
        </p>
      )}
      {note && (
        <p data-quiet className="type-mono text-muted">
          {note}
        </p>
      )}
      <div className="min-w-0 type-body wrap-anywhere">{children}</div>
    </div>
  );
}

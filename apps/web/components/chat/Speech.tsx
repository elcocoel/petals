// One turn's words: who is speaking, then what they said (Figma's "You" 39:894 and "Petals" 39:898). A
// speaker is left out where the same one goes on speaking. On the app scale: who in a small muted mono line,
// as the side panel heads its groups; what in UI. Your own turn sits on the panel's fill.
import type { ReactNode } from 'react';
import { Icon } from '../ui/Icon.tsx';

export function Speech({
  speaker,
  agent = false,
  note,
  mine = false,
  children,
}: {
  speaker?: string;
  /** The agent's mark beside the name: Petals' own sign, as the side panel shows its conversations. */
  agent?: boolean;
  /** Said quietly above the words, like what a question carried. */
  note?: string;
  /** The person's own words, which sit on the fill. */
  mine?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      {...(mine ? { 'data-b': 'item', 'data-said': '' } : {})}
      className={`flex min-w-0 flex-col gap-space-4 ${mine ? 'bg-tint px-text-gap py-space-8' : ''}`}
    >
      {speaker && (
        <p className="flex items-center gap-space-8 type-mono text-muted">
          {agent && <Icon name="petals" small />}
          {speaker}
        </p>
      )}
      {note && (
        <p data-quiet className="type-mono text-muted">
          {note}
        </p>
      )}
      <div className="min-w-0 type-ui wrap-anywhere">{children}</div>
    </div>
  );
}

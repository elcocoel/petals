// Something on the map turned on or off by hand, in a tool panel: the browser's own checkbox as a switch, so the
// keyboard and a screen reader know it, in the accent as the Range is, with On or Off beside it in mono. Props
// only.
import { Mono } from './Mono.tsx';

export function Switch({
  label,
  on,
  onChange,
}: {
  /** What a screen reader hears for it: what it turns on. */
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex h-row-height cursor-pointer items-center gap-space-8">
      <Mono as="span" tone="muted">
        {on ? 'On' : 'Off'}
      </Mono>
      <input
        type="checkbox"
        role="switch"
        aria-checked={on}
        aria-label={label}
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        className="size-icon-small cursor-pointer accent-accent"
      />
    </label>
  );
}

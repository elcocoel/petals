// A dropdown: one value chosen from a few, in a tool panel (Elco, 12 Nov, walk 2, on the legend: "drop downs to
// changing the things ... very clearly to see what is category, what is input"). The browser's own select, so
// the keyboard, a screen reader and a phone's picker all work; it looks like an input, set apart from the
// words it sits beside: a hairline edge on the ground, the app's UI type, a chevron pointing down. Props only.
import { Icon } from './Icon.tsx';

export interface SelectOption {
  value: string;
  label: string;
}

export function Select({
  label,
  value,
  options,
  onChange,
}: {
  /** What a screen reader hears for it: the category it sets. */
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
}) {
  return (
    <span className="relative flex min-w-0 shrink items-center">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-row-height min-w-0 cursor-pointer appearance-none truncate border border-hairline bg-surface py-0 pr-space-32 pl-space-8 type-ui text-primary hover:border-primary focus-visible:outline-accent"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-space-8 flex rotate-90 text-muted"
      >
        <Icon name="chevron" small />
      </span>
    </span>
  );
}

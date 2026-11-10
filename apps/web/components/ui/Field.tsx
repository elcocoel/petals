// A field: where a person types or picks (the small set, Figma "Petals / Field"). A label above, the well
// below: one line, several, or a list to pick from, in groups. Under v2 the well takes field's glass, hover
// and focus ring, as the question box does. A field in a row can keep its label for screen readers only. In
// an app surface (the workspace's conversation, the side panel) it's on the app scale, as the rows beside it.
import type { ChangeEvent } from 'react';

export function Field({
  id,
  label,
  value,
  onChange,
  lines = 'one',
  maxLength,
  hideLabel,
  disabled,
  choices,
  none,
  scale = 'site',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  lines?: 'one' | 'several';
  /** A list to pick from instead of typing, in groups. */
  choices?: { group: string; choices: { value: string; label: string }[] }[];
  /** What the list says before anything is picked. */
  none?: string;
  /** The site's type, or the app scale's beside an app surface's rows. */
  scale?: 'site' | 'app';
  maxLength?: number;
  /** Read aloud, not shown: a field in a row whose first row says what it is. */
  hideLabel?: boolean;
  disabled?: boolean;
}) {
  const change = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    onChange(e.target.value);
  const app = scale === 'app';
  const look = `min-w-0 flex-1 bg-transparent ${app ? 'type-ui' : 'type-label'} text-primary outline-none`;
  return (
    <div className="flex min-w-0 flex-col gap-space-8">
      <label
        htmlFor={id}
        className={hideLabel ? 'sr-only' : app ? 'type-ui text-muted' : 'type-label'}
      >
        {label}
      </label>
      <div
        data-b="field"
        className={`flex border border-hairline bg-surface ${app ? 'px-space-8 py-space-8' : 'px-space-16 py-text-gap'} focus-within:outline focus-within:outline-primary`}
      >
        {choices ? (
          <select id={id} value={value} onChange={change} disabled={disabled} className={look}>
            <option value="">{none ?? ''}</option>
            {choices.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.choices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        ) : lines === 'one' ? (
          <input
            id={id}
            value={value}
            onChange={change}
            maxLength={maxLength}
            disabled={disabled}
            className={look}
          />
        ) : (
          <textarea
            id={id}
            value={value}
            onChange={change}
            maxLength={maxLength}
            disabled={disabled}
            rows={4}
            className={`${look} resize-none`}
          />
        )}
      </div>
    </div>
  );
}

// A field: where a person types (the small set, Figma "Petals / Field"). A label above, the well below,
// one line or several. Under v2 the well takes field's glass, hover and focus ring, as the question box
// does. A field in a row can keep its label for screen readers only.
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
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  lines?: 'one' | 'several';
  maxLength?: number;
  /** Read aloud, not shown: a field in a row whose first row says what it is. */
  hideLabel?: boolean;
  disabled?: boolean;
}) {
  const change = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange(e.target.value);
  const look = 'min-w-0 flex-1 bg-transparent type-label text-primary outline-none';
  return (
    <div className="flex min-w-0 flex-col gap-space-8">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'type-label'}>
        {label}
      </label>
      <div
        data-b="field"
        className="flex border border-hairline bg-surface px-space-16 py-text-gap focus-within:outline focus-within:outline-primary"
      >
        {lines === 'one' ? (
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
            className={`${look} resize-none field-sizing-content`}
          />
        )}
      </div>
    </div>
  );
}

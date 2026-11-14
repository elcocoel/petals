// Text edited where it's read, at the size it's read at: a heading stays a heading, a lead a lead, a label a
// label, with only a dashed rule under it to say it can be typed into. No box and no label above it: what it
// is shows from where it sits; a screen reader hears `label`. Props only.
const SIZES = {
  title: 'type-title md:type-display-compact',
  lead: 'type-lead',
  label: 'type-label',
} as const;

export function InlineText({
  value,
  onChange,
  label,
  size,
  multiline = false,
  placeholder,
  maxLength,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  /** What a screen reader hears for it. */
  label: string;
  size: keyof typeof SIZES;
  /** Several lines, as a bio. */
  multiline?: boolean;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
}) {
  const look = `m-0 block w-full min-w-0 resize-none border-0 border-b border-dashed border-hairline bg-transparent p-0 text-primary outline-none focus:border-accent ${SIZES[size]}`;
  return multiline ? (
    <textarea
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      rows={1}
      className={`${look} field-sizing-content`}
    />
  ) : (
    <input
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      className={look}
    />
  );
}

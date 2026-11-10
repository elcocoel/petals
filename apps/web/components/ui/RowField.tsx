'use client';
// A row that takes words, in place and one row high, as an IDE names a new folder: naming a new project.
// It takes the focus when it appears; Enter keeps the words, and Escape, or leaving it with nothing typed,
// lets it go. The accent line under the words says it's waiting for them. It holds only what's typed.
import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon.tsx';

export function RowField({
  label,
  placeholder,
  icon,
  onDone,
  onCancel,
}: {
  /** What a screen reader hears for the field. */
  label: string;
  placeholder: string;
  icon?: IconName;
  onDone: (words: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => field.current?.focus(), []);
  const keep = () => {
    const words = text.trim();
    if (words) onDone(words);
    else onCancel();
  };
  return (
    <div className="flex h-row-height items-center gap-space-8 px-space-8">
      {icon && (
        <span className="flex shrink-0 text-muted" aria-hidden="true">
          <Icon name={icon} small />
        </span>
      )}
      <input
        ref={field}
        aria-label={label}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            keep();
          }
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={keep}
        className="h-row-height min-w-0 flex-1 border-0 border-b border-accent bg-transparent p-0 type-ui text-primary outline-none placeholder:text-muted"
      />
    </div>
  );
}

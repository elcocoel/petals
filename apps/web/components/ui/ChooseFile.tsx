// Choosing a file from the person's computer: a secondary Button that opens the browser's own picker, which
// stays out of sight. The picker is cleared after each choice, so choosing the same file again still counts.
import { type ReactNode, useRef } from 'react';
import { Button } from './Button.tsx';

export function ChooseFile({
  label,
  accept,
  disabled,
  onFile,
  children,
}: {
  label: string;
  /** What to press, where the thing itself is the trigger (a picture); else a button with the label. */
  children?: ReactNode;
  /** The kinds of file, as the picker takes them. */
  accept: string;
  disabled?: boolean;
  onFile: (file: File) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  return (
    <>
      {children ? (
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          onClick={() => picker.current?.click()}
          className="block h-auto cursor-pointer border-0 bg-transparent p-0 hover:opacity-80"
        >
          {children}
        </button>
      ) : (
        <Button variant="secondary" disabled={disabled} onClick={() => picker.current?.click()}>
          {label}
        </Button>
      )}
      <input
        ref={picker}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </>
  );
}

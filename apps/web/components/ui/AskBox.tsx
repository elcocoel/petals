// Petals / Ask box 52:1861. Always on ground, whatever section holds it: Figma's box stays white on
// the mint and ink sections too. Fixed height, one line; the action is the one Button.
import type { ChangeEventHandler, FormEventHandler } from 'react';
import { Button } from './Button.tsx';

export function AskBox({
  placeholder,
  label,
  action = 'Ask',
  name = 'q',
  value,
  defaultValue,
  disabled,
  onChange,
  onSubmit,
}: {
  placeholder: string;
  /** What a screen reader hears for the field. */
  label: string;
  action?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  onSubmit?: FormEventHandler<HTMLFormElement>;
}) {
  return (
    <form
      data-surface="ground"
      onSubmit={onSubmit}
      className="flex h-ask-box-height w-full max-w-ask-box-width items-center gap-ask-box-gap border border-primary pr-ask-box-inset pl-block-gap focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary"
    >
      <input
        name={name}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        onChange={onChange}
        className="min-w-0 flex-1 bg-transparent type-body text-primary outline-none placeholder:text-primary"
      />
      <Button type="submit" arrow disabled={disabled}>
        {action}
      </Button>
    </form>
  );
}

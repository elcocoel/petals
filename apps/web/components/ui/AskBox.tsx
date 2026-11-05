// Petals / Ask box 52:1861. Always on ground, whatever section holds it: Figma's box stays white on
// the mint and ink sections too. Fixed height, one line; the action is the one Button. It fills its
// column, up to the token. With `to` it's a plain GET form, so it asks with no JavaScript.
import type { ChangeEventHandler, FormEventHandler } from 'react';
import { Button } from './Button.tsx';

const SIZES = {
  default: {
    box: 'h-ask-box-height max-w-ask-box-width gap-ask-box-gap pr-ask-box-inset pl-block-gap',
    field: 'type-body',
  },
  small: {
    box: 'h-ask-box-small-height max-w-ask-box-small-width gap-ask-box-small-gap pr-ask-box-small-end pl-ask-box-small-start',
    field: 'type-body-small',
  },
} as const;

export function AskBox({
  placeholder,
  label,
  action = 'Ask',
  to,
  size = 'default',
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
  /** The button's label. */
  action?: string;
  /** The address the question goes to, as ?q=. */
  to?: string;
  size?: keyof typeof SIZES;
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
      action={to}
      method={to ? 'get' : undefined}
      onSubmit={onSubmit}
      className={`flex w-full items-center border border-primary focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary ${SIZES[size].box}`}
    >
      <input
        name={name}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        onChange={onChange}
        className={`min-w-0 flex-1 bg-transparent text-ellipsis text-primary outline-none placeholder:text-primary ${SIZES[size].field}`}
      />
      <Button type="submit" size={size} arrow disabled={disabled}>
        {action}
      </Button>
    </form>
  );
}

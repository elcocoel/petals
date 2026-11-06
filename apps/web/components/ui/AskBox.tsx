'use client';
// Petals / Ask box 52:1861, and the workspace's Question composer 39:930, which is the same control at
// another size. The landing's step 1 draws it whole, under figure-scale. Always on ground, whatever
// section holds it: Figma's box stays white on the mint and ink sections too. It grows with what's
// typed; Enter asks and Shift+Enter starts a line. The action is the one Button. With `to` it's a plain
// GET form, so it still asks before any JavaScript has run.
import type { ChangeEventHandler, FormEventHandler, Ref } from 'react';
import { Button } from './Button.tsx';

/** A plain GET form puts the question in its address, and a server refuses a long enough address. */
const LONGEST_ASKED_BY_ADDRESS = 1500;

const SIZES = {
  hero: {
    form: 'border py-space-8 pr-space-8 pl-block-gap',
    gap: 'gap-space-16',
    field: 'py-text-gap type-body placeholder:text-primary',
    arrow: true,
  },
  composer: {
    // A box can be sized narrower than the words and a long button: the button goes under them.
    form: 'flex-wrap justify-end border py-space-16 pr-text-gap pl-block-gap',
    gap: 'gap-text-gap',
    field: 'basis-drawing-72 py-text-gap type-label placeholder:text-muted',
    arrow: false,
  },
} as const;

export function AskBox({
  placeholder,
  label,
  action = 'Ask',
  to,
  name = 'q',
  id,
  size = 'hero',
  value,
  defaultValue,
  disabled,
  readOnly,
  canAsk = true,
  boxRef,
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
  name?: string;
  id?: string;
  size?: keyof typeof SIZES;
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  readOnly?: boolean;
  /** False keeps the action off and the box open: there's nothing to ask yet, or it's still busy. */
  canAsk?: boolean;
  boxRef?: Ref<HTMLTextAreaElement>;
  onChange?: ChangeEventHandler<HTMLTextAreaElement>;
  onSubmit?: FormEventHandler<HTMLFormElement>;
}) {
  const look = SIZES[size];
  return (
    <form
      data-surface="ground"
      data-b="field"
      action={to}
      method={to ? 'get' : undefined}
      onSubmit={onSubmit}
      className={`flex w-full items-end border-primary focus-within:outline focus-within:outline-primary has-disabled:border-hairline has-disabled:bg-surface has-disabled:opacity-60 ${look.gap} ${look.form}`}
    >
      <textarea
        ref={boxRef}
        id={id}
        name={name}
        rows={1}
        aria-label={label}
        placeholder={placeholder}
        maxLength={to === undefined ? undefined : LONGEST_ASKED_BY_ADDRESS}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        readOnly={readOnly}
        onChange={onChange}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        className={`max-h-ask-box-max-height min-w-0 flex-1 resize-none bg-transparent field-sizing-content text-primary outline-none ${look.field}`}
      />
      <Button type="submit" arrow={look.arrow} disabled={disabled || !canAsk}>
        {action}
      </Button>
    </form>
  );
}

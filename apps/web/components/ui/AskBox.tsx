'use client';
// Petals / Ask box 52:1861, and the workspace's Question composer 39:930, which is the same control at
// another size. Always on ground, whatever section holds it: Figma's box stays white on the mint and
// ink sections too. It grows with what's typed; Enter asks and Shift+Enter starts a line. The action is
// the one Button.
import type { ChangeEventHandler, FormEventHandler, Ref } from 'react';
import { Button } from './Button.tsx';

const SIZES = {
  hero: {
    form: 'min-h-ask-box-height max-w-ask-box-width py-ask-box-inset pr-ask-box-inset pl-block-gap',
    gap: 'gap-ask-box-gap',
    field: 'py-ask-box-field-block type-body',
    arrow: true,
  },
  composer: {
    form: 'min-h-composer-height py-composer-block pr-composer-inset-end pl-control-inset',
    gap: 'gap-text-gap',
    field: 'py-composer-field-block type-label',
    arrow: false,
  },
} as const;

export function AskBox({
  placeholder,
  label,
  action = 'Ask',
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
  action?: string;
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
      onSubmit={onSubmit}
      className={`flex w-full items-end border border-primary focus-within:outline-1 focus-within:outline-primary ${look.gap} ${look.form}`}
    >
      <textarea
        ref={boxRef}
        id={id}
        name={name}
        rows={1}
        aria-label={label}
        placeholder={placeholder}
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
        className={`max-h-composer-max-height min-w-0 flex-1 resize-none bg-transparent field-sizing-content text-primary outline-none placeholder:text-muted ${look.field}`}
      />
      <Button type="submit" arrow={look.arrow} disabled={disabled || !canAsk}>
        {action}
      </Button>
    </form>
  );
}

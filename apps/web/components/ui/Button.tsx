// The one control (Petals / Button 23:161, Button secondary 52:1869, Starter question 52:1866). A
// `link` is Figma's Close detail: an action that reads as Petals / Link 23:159. `row` and `tile` are
// the things you can open, which lay out their own content. A `tick` is one mark of a pager, with its word
// under it; it's an item, as IconButton is. `label` names a control that has no words of its own.
// Its primary look is the base style of every <button> in app/globals.css. Variation goes through
// these props, so there's no className: a one-off look needs a new variant here. `compact` is primary at the
// app's scale (a row high, UI words): the conversation's Send and Connect, beside the side panel's rows.
import type { MouseEventHandler, ReactNode } from 'react';
import { Icon } from './Icon.tsx';

export type ButtonVariant =
  | 'primary'
  | 'compact'
  | 'secondary'
  | 'starter'
  | 'link'
  | 'quiet'
  | 'row'
  | 'tile'
  | 'pill'
  | 'tick';

/** The behaviour each variant inherits (packages/tokens/behaviours.ts). `row` and `tile` stay v1. */
const BEHAVIOUR: Partial<Record<ButtonVariant, 'action' | 'link' | 'item'>> = {
  primary: 'action',
  compact: 'action',
  secondary: 'action',
  starter: 'action',
  link: 'link',
  quiet: 'link',
  pill: 'action',
  tick: 'item',
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: '',
  compact: 'h-row-height px-text-gap type-ui',
  secondary: 'border border-primary bg-transparent text-primary',
  // One line at any width Figma draws. Narrower than its question, it wraps instead of overflowing.
  starter:
    'h-auto border border-hairline bg-transparent px-space-16 py-space-8 type-caption whitespace-normal text-primary',
  link: 'h-auto bg-transparent px-0 type-label text-primary hover:underline',
  quiet: 'h-auto bg-transparent px-0 type-caption text-muted hover:text-primary hover:underline',
  row: 'h-auto w-full justify-start gap-text-gap border border-hairline bg-transparent p-text-gap text-left whitespace-normal text-primary aria-pressed:border-l-heavy aria-pressed:border-l-accent data-current:border-l-heavy data-current:border-l-accent',
  // A setting beside the field, that opens what it can be.
  pill: 'h-auto justify-start gap-space-8 border border-hairline bg-transparent px-space-8 py-space-4 text-left type-mono whitespace-normal text-primary aria-pressed:border-primary',
  tile: 'h-auto w-tile-width flex-col items-start gap-text-gap bg-transparent px-0 text-left whitespace-normal text-primary',
  // A pager's mark: the whole of its share of the row can be pressed, the mark itself is the child.
  // Its share of the pager grows with its word, so every word keeps to one line.
  tick: 'h-auto min-h-row-height min-w-0 flex-auto items-start bg-transparent px-space-8 py-space-8 text-left text-primary hover:bg-tint hover:opacity-100 data-current:bg-tint',
};

export type ButtonProps = {
  variant?: ButtonVariant;
  /** A trailing arrow. A starter question always has one. */
  arrow?: boolean;
  children: ReactNode;
} & (
  | {
      href: string;
      /** The one of these you are on. */
      current?: boolean;
    }
  | {
      href?: undefined;
      type?: 'button' | 'submit';
      disabled?: boolean;
      /** A toggle or a choice: this one is on. */
      pressed?: boolean;
      /** The one of these that's in view, as a pager's tick is. */
      current?: boolean;
      /** What it does, for a control with no words of its own: read aloud and shown on hover. */
      label?: string;
      onClick?: MouseEventHandler<HTMLButtonElement>;
    }
);

export function Button({ variant = 'primary', arrow, children, ...rest }: ButtonProps) {
  const look = VARIANTS[variant];
  const content = (
    <>
      {children}
      {(arrow ?? variant === 'starter') && <Icon name="arrow" accent={variant === 'primary'} />}
    </>
  );
  if (rest.href !== undefined) {
    return (
      <a
        href={rest.href}
        aria-current={rest.current ? 'page' : undefined}
        data-current={rest.current ? '' : undefined}
        data-button=""
        data-b={BEHAVIOUR[variant]}
        data-kind={variant}
        className={look}
      >
        {content}
      </a>
    );
  }
  const { type = 'button', disabled, pressed, current, label, onClick } = rest;
  return (
    <button
      type={type}
      disabled={disabled}
      aria-pressed={pressed}
      aria-current={current ? 'true' : undefined}
      data-current={current ? '' : undefined}
      aria-label={label}
      title={label}
      onClick={onClick}
      data-b={BEHAVIOUR[variant]}
      data-kind={variant}
      className={look}
    >
      {content}
    </button>
  );
}

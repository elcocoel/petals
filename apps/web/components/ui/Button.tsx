// The one control (Petals / Button 23:161, Button secondary 52:1869, Starter question 52:1866). A
// `link` is Figma's Close detail: an action that reads as Petals / Link 23:159. `row` and `tile` are
// the things you can open, which lay out their own content.
// Its primary look is the base style of every <button> in app/globals.css. Variation goes through
// these props, so there's no className: a one-off look needs a new variant here.
import type { MouseEventHandler, ReactNode } from 'react';
import { Arrow } from './Arrow.tsx';

export type ButtonVariant = 'primary' | 'secondary' | 'starter' | 'link' | 'quiet' | 'row' | 'tile';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: '',
  secondary: 'border border-primary bg-transparent text-primary',
  // One line at any width Figma draws. Narrower than its question, it wraps instead of overflowing.
  starter:
    'h-auto border border-hairline bg-transparent px-space-16 py-space-8 type-caption whitespace-normal text-primary',
  link: 'h-auto bg-transparent px-0 type-label text-primary hover:underline',
  quiet: 'h-auto bg-transparent px-0 type-caption text-muted hover:text-primary hover:underline',
  row: 'h-auto w-full justify-start gap-text-gap border border-hairline bg-transparent p-text-gap text-left whitespace-normal text-primary aria-pressed:border-l-2 aria-pressed:border-l-accent',
  tile: 'h-auto w-tile-width flex-col items-start gap-text-gap bg-transparent px-0 text-left whitespace-normal text-primary',
};

export type ButtonProps = {
  variant?: ButtonVariant;
  /** A trailing arrow. A starter question always has one. */
  arrow?: boolean;
  children: ReactNode;
} & (
  | { href: string }
  | {
      href?: undefined;
      type?: 'button' | 'submit';
      disabled?: boolean;
      /** A toggle or a choice: this one is on. */
      pressed?: boolean;
      onClick?: MouseEventHandler<HTMLButtonElement>;
    }
);

export function Button({ variant = 'primary', arrow, children, ...rest }: ButtonProps) {
  const look = VARIANTS[variant];
  const content = (
    <>
      {children}
      {(arrow ?? variant === 'starter') && <Arrow accent={variant === 'primary'} />}
    </>
  );
  if (rest.href !== undefined) {
    return (
      <a href={rest.href} data-button="" className={look}>
        {content}
      </a>
    );
  }
  const { type = 'button', disabled, pressed, onClick } = rest;
  return (
    <button
      type={type}
      disabled={disabled}
      aria-pressed={pressed}
      onClick={onClick}
      className={look}
    >
      {content}
    </button>
  );
}

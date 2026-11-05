// The one control (Petals / Button 23:161, Button secondary 52:1869, Starter question 52:1866). A
// `link` is Figma's Close detail: an action that reads as Petals / Link 23:159. `row` and `tile` are
// the things you can open, which lay out their own content.
// Its primary look is the base style of every <button> in app/globals.css. Variation goes through
// these props, so there's no className: a one-off look needs a new variant here.
import type { MouseEventHandler, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'starter' | 'link' | 'quiet' | 'row' | 'tile';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: '',
  secondary: 'border border-primary bg-transparent text-primary',
  starter:
    'h-starter-height border border-hairline bg-transparent pr-starter-inset-end pl-starter-inset-start type-caption text-primary',
  link: 'h-auto bg-transparent px-0 type-label text-primary hover:underline',
  quiet: 'h-auto bg-transparent px-0 type-caption text-muted hover:text-primary hover:underline',
  row: 'h-auto w-full justify-start gap-text-gap border border-hairline bg-transparent p-text-gap text-left whitespace-normal text-primary aria-pressed:border-l-2 aria-pressed:border-l-accent',
  tile: 'h-auto w-tile-width flex-col items-start gap-text-gap bg-transparent px-0 text-left whitespace-normal text-primary',
};

/**
 * Figma sets this in Geist Mono, but Google's Geist Mono has no U+2192 and the text fell back to
 * Arial, so it's drawn. In em, so it scales with the label: 10 wide at Label, like Figma's.
 */
function Arrow({ variant }: { variant: ButtonVariant }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 10 10"
      width="0.625em"
      height="0.625em"
      fill="none"
      stroke="currentColor"
      className={variant === 'primary' ? 'shrink-0 text-action-accent' : 'shrink-0'}
    >
      <path d="M0 5h9.5M5.5 1l4 4-4 4" />
    </svg>
  );
}

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
      {(arrow ?? variant === 'starter') && <Arrow variant={variant} />}
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

// The one control (Petals / Button 23:161, Button secondary 52:1869, Starter question 52:1866).
// Its primary look is the base style of every <button> in app/globals.css. Variation goes through
// these props, so there's no className: a one-off look needs a new variant here.
import type { MouseEventHandler, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'starter';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: '',
  secondary: 'border border-primary bg-transparent text-primary',
  starter:
    'h-starter-height border border-hairline bg-transparent pr-starter-inset-end pl-starter-inset-start type-caption text-primary',
};

const ARROWS: Record<ButtonVariant, string> = {
  primary: 'type-mono-code text-action-accent',
  secondary: 'type-mono-code',
  starter: 'type-mono-label',
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
      onClick?: MouseEventHandler<HTMLButtonElement>;
    }
);

export function Button({ variant = 'primary', arrow, children, ...rest }: ButtonProps) {
  const look = VARIANTS[variant];
  const content = (
    <>
      {children}
      {(arrow ?? variant === 'starter') && (
        <span aria-hidden="true" className={ARROWS[variant]}>
          →
        </span>
      )}
    </>
  );
  if (rest.href !== undefined) {
    return (
      <a href={rest.href} data-button="" className={look}>
        {content}
      </a>
    );
  }
  const { type = 'button', disabled, onClick } = rest;
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={look}>
      {content}
    </button>
  );
}

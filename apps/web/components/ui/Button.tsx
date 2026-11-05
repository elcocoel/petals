// The one control (Petals / Button 23:161, Button secondary 52:1869, Starter question 52:1866).
// Its primary look is the base style of every <button> in app/globals.css. Variation goes through
// these props, so there's no className: a one-off look needs a new variant here.
import type { MouseEventHandler, ReactNode } from 'react';
import { Arrow } from './Arrow.tsx';

export type ButtonVariant = 'primary' | 'secondary' | 'starter';
export type ButtonSize = 'default' | 'small';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: '',
  secondary: 'border border-primary bg-transparent text-primary',
  // One line at any width Figma draws. Narrower than its question, it wraps instead of overflowing.
  starter:
    'h-auto min-h-starter-height border border-hairline bg-transparent py-space-6 pr-starter-inset-end pl-starter-inset-start type-caption whitespace-normal text-primary',
};

const SIZES: Record<ButtonSize, string> = {
  default: '',
  small: 'h-button-small-height gap-button-small-gap px-button-small-inset type-label-small',
};

export type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
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

export function Button({
  variant = 'primary',
  size = 'default',
  arrow,
  children,
  ...rest
}: ButtonProps) {
  const look = `${VARIANTS[variant]} ${SIZES[size]}`.trim();
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
  const { type = 'button', disabled, onClick } = rest;
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={look}>
      {content}
    </button>
  );
}

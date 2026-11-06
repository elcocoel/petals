// The box with a bar: a bar with a hairline under it, then a body. The look of `box.glass`, with the
// corners of its kind. The illustrated Terminal is this, and so is a FloatBox.

import type { SurfaceName } from '@petal/tokens';
import type { HTMLAttributes, ReactNode } from 'react';

export function BarBox({
  kind,
  surface,
  className = '',
  bar,
  barClassName = '',
  barProps,
  children,
}: {
  kind: 'term' | 'float';
  /** Flips every role inside, as a Section does. Otherwise it's on whatever it's on. */
  surface?: SurfaceName;
  className?: string;
  bar: ReactNode;
  barClassName?: string;
  barProps?: HTMLAttributes<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <div
      data-b="box"
      data-kind={kind}
      data-surface={surface}
      className={`border border-primary ${className}`.trim()}
    >
      <div
        {...barProps}
        className={`border-b border-primary px-block-gap py-space-16 ${barClassName}`.trim()}
      >
        {bar}
      </div>
      {children}
    </div>
  );
}

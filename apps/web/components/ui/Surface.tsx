// Sets data-surface: every role inside flips, and the generated CSS paints the background and text.
// The only primitive with a className, because a section's layout belongs to whoever places it.
import type { SurfaceName } from '@petal/tokens';
import type { ReactNode } from 'react';

export function Surface({
  kind,
  as: Tag = 'div',
  id,
  className,
  children,
}: {
  kind: SurfaceName;
  as?: 'div' | 'section' | 'footer' | 'nav';
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag data-surface={kind} id={id} className={className}>
      {children}
    </Tag>
  );
}

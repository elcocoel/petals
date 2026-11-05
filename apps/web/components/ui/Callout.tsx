// The note box: who's speaking, what they say, and maybe where to take it. Figma has it twice under
// two names, "Agent line" (66:2228) and "Callout" (67:2529). It takes the width its parent gives.
import type { ReactNode } from 'react';
import { TextLink } from './TextLink.tsx';

export function Callout({
  who,
  action,
  children,
}: {
  who: ReactNode;
  action?: { label: string; href: string };
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-space-8 border border-primary bg-surface px-space-16 py-space-14 text-primary">
      <p className="my-none type-mono-tiny">{who}</p>
      <p className="my-none type-caption">{children}</p>
      {action && (
        <TextLink href={action.href} variant="mono" arrow>
          {action.label}
        </TextLink>
      )}
    </div>
  );
}

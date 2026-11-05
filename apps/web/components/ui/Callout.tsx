// The note box: who's speaking, what they say, and maybe where to take it. Figma has it twice:
// "Agent line" (66:2228), and "Callout" (67:2529), which is tighter. It takes its parent's width.
import type { ReactNode } from 'react';
import { TextLink } from './TextLink.tsx';

const SIZES = {
  default: 'gap-space-8 p-space-16',
  compact: 'gap-space-8 p-text-gap',
} as const;

export function Callout({
  who,
  size = 'default',
  action,
  children,
}: {
  who: ReactNode;
  size?: keyof typeof SIZES;
  action?: { label: string; href: string };
  children: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col items-start border border-primary bg-surface text-primary ${SIZES[size]}`}
    >
      <p className="my-0 type-mono">{who}</p>
      <p className="my-0 type-caption">{children}</p>
      {action && (
        <TextLink href={action.href} variant="mono" arrow>
          {action.label}
        </TextLink>
      )}
    </div>
  );
}

// A badge: information only, the same everywhere (the small set, Figma "Lobby / Badge"). Never clickable,
// so it has no hover, no shadow and no behaviour, and its corners stay square in every version, so it never
// reads as a button. Mono, upper case. Neutral for a fact (NEAR, DECLARED, 208); accent for a state that
// just went well (SAVED).
import type { ReactNode } from 'react';

const TONES = {
  neutral: 'border-hairline text-primary',
  accent: 'border-accent bg-accent text-primary',
} as const;

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: keyof typeof TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-block shrink-0 border px-space-8 type-mono whitespace-nowrap uppercase ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

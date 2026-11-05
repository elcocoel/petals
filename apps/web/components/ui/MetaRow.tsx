// Two captions on one line, pushed apart: a transcript's header, a terminal's bar, the footer's foot.
import type { ReactNode } from 'react';
import { Caption } from './Caption.tsx';

export function MetaRow({ start, end }: { start: ReactNode; end: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-block-gap gap-y-space-6">
      <Caption>{start}</Caption>
      <Caption>{end}</Caption>
    </div>
  );
}

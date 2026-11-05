// Two captions on one line, pushed apart: a transcript's header, a terminal's bar, the footer's foot.
import type { ReactNode } from 'react';
import { Mono } from './Mono.tsx';

export function MetaRow({ start, end }: { start: ReactNode; end: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-block-gap gap-y-space-8">
      <Mono>{start}</Mono>
      <Mono>{end}</Mono>
    </div>
  );
}

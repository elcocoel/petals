// A flower's place in the thread. The flower itself shows in the panel; this row keeps its place in the
// turn that made it and brings it back. Mint, like a selected petal, marks the one that's open.

import { Button } from '../ui/Button.tsx';
import { Mono } from '../ui/Mono.tsx';

export function TurnFlower({
  title,
  sub,
  open,
  thumb,
  onOpen,
}: {
  title: string;
  sub: string;
  open: boolean;
  /** An image of the drawing, once it's drawn. */
  thumb?: string;
  onOpen?: () => void;
}) {
  return (
    <Button variant="row" pressed={open} onClick={onOpen}>
      {/* biome-ignore lint/performance/noImgElement: a data URL of a drawing already in hand */}
      {thumb ? <img src={thumb} alt="" className="size-turn-flower-thumb shrink-0" /> : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="type-label">{title}</span>
        <Mono as="span" tone="muted">
          {sub}
        </Mono>
      </span>
      <span className="shrink-0 type-caption text-muted">{open ? 'In the panel' : 'Show'}</span>
    </Button>
  );
}

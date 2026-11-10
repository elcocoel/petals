// The tip, Settings' first row (design/side-panel.md, lines 34 to 38): its percent at the row's end, and,
// open, what it is, the slider on the price's scale, and what it adds to a typical turn. Letting go of
// the slider keeps it. Words from lib/tip.ts, drafts. Props only: viewmodels/useTip.ts holds it.

import { panelWords } from '../../lib/panel-words.ts';
import { tipWords } from '../../lib/tip.ts';
import { NavItem } from '../ui/NavItem.tsx';
import { Range } from '../ui/Range.tsx';

export interface TipView {
  /** What's kept, or where the hand has the slider while it holds it. Null until Petals has said. */
  percent: number | null;
  scale: { min: number; max: number; step: number } | null;
  open: boolean;
  onOpen: () => void;
  onSlide: (percent: number) => void;
  onSet: () => void;
  /** What it adds to a typical turn, in words. */
  line: string;
  /** Why the last change wasn't kept. */
  failed: string | null;
}

export function TipControl({
  percent,
  scale,
  open,
  onOpen,
  onSlide,
  onSet,
  line,
  failed,
}: TipView) {
  if (percent === null || !scale) return null;
  return (
    <div className="flex flex-col">
      <NavItem
        onClick={onOpen}
        expanded={open}
        icon="chevron"
        label={tipWords.label}
        trail={tipWords.percent(percent)}
      />
      {open && (
        <div className="flex flex-col gap-space-8 pt-space-4 pr-space-8 pb-space-8 pl-space-32">
          <p className="my-0 type-ui text-muted">{tipWords.about}</p>
          <Range
            label={tipWords.slider}
            min={scale.min}
            max={scale.max}
            step={scale.step}
            value={percent}
            shown={tipWords.percent(percent)}
            onChange={onSlide}
            onSet={onSet}
          />
          <p className="my-0 type-mono text-muted">{line}</p>
          {failed && (
            <p className="my-0 type-ui text-muted">{panelWords.settings.failed(failed)}</p>
          )}
        </div>
      )}
    </div>
  );
}

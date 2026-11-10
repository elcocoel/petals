// A value set along a scale by hand: the browser's own slider, in the accent, a row high, with what it's
// at beside it in mono (the tip, design/side-panel.md, line 36). It says when the hand lets go, by pointer
// or by key, so a setting is kept once and not at every step of a drag. Props only.
import { Mono } from './Mono.tsx';

export function Range({
  label,
  min,
  max,
  step,
  value,
  shown,
  onChange,
  onSet,
}: {
  /** What a screen reader hears for it. */
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** What it's at, in words, beside it. */
  shown: string;
  /** Where the hand has it now. */
  onChange: (value: number) => void;
  /** The hand let go: keep it. */
  onSet: () => void;
}) {
  return (
    <span className="flex h-row-height min-w-0 items-center gap-space-8">
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onSet}
        onKeyUp={onSet}
        className="min-w-0 flex-1 cursor-pointer accent-accent"
      />
      <Mono as="span">{shown}</Mono>
    </span>
  );
}

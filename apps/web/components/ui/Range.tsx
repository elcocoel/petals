'use client';
// A value set along a scale by hand: the browser's own slider, in the accent, a row high, with what it's
// at beside it in mono (the tip, design/side-panel.md, lines 36 and 38). It says when the value is set, on
// the browser's own change, which comes when the hand lets go wherever the pointer is, and at each step of
// a key, so a setting is kept once and not at every step of a drag. Props only.
import { useEffect, useRef } from 'react';
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
  const input = useRef<HTMLInputElement>(null);
  const set = useRef(onSet);
  set.current = onSet;
  // React's onChange is the browser's input, every step; the browser's change is the value set
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const on = () => set.current();
    el.addEventListener('change', on);
    return () => el.removeEventListener('change', on);
  }, []);
  return (
    <span className="flex h-row-height min-w-0 items-center gap-space-8">
      <input
        ref={input}
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        // and a hand let go on it, by pointer or key: onSet keeps a value once, however many say so
        onPointerUp={onSet}
        onKeyUp={onSet}
        className="min-w-0 flex-1 cursor-pointer accent-accent"
      />
      <Mono as="span">{shown}</Mono>
    </span>
  );
}

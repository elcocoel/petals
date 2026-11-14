'use client';
// A value set along a scale by hand: the browser's own slider, in the accent, a row high, with what it's
// at beside it in mono (as the tip has it). It says when the value is set, on the browser's own change,
// which comes when the hand lets go wherever the pointer is, and at each step of a key, so a setting is
// kept once and not at every step of a drag. Where the scale can reach further, held at its end, by the pointer
// or a key, it asks for more (onHoldAtEnd), again while it's held. Props only.
import { useEffect, useRef } from 'react';

/** How often a hand held at the end asks for more. */
const HOLD_MS = 350;

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
  onHoldAtEnd,
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
  /** Held at the end: the scale goes further. */
  onHoldAtEnd?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const set = useRef(onSet);
  set.current = onSet;
  const more = useRef(onHoldAtEnd);
  more.current = onHoldAtEnd;
  const atEnd = useRef(false);
  atEnd.current = value >= max;
  const held = useRef<number | null>(null);
  const letGo = () => {
    if (held.current !== null) window.clearInterval(held.current);
    held.current = null;
  };
  // a hold can't outlive the slider
  useEffect(
    () => () => {
      if (held.current !== null) window.clearInterval(held.current);
    },
    [],
  );
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
        onPointerDown={
          onHoldAtEnd
            ? () => {
                letGo();
                held.current = window.setInterval(() => {
                  if (atEnd.current) more.current?.();
                }, HOLD_MS);
              }
            : undefined
        }
        onKeyDown={
          onHoldAtEnd
            ? (e) => {
                if ((e.key === 'ArrowRight' || e.key === 'ArrowUp') && atEnd.current) onHoldAtEnd();
              }
            : undefined
        }
        // and a hand let go on it, by pointer or key: onSet keeps a value once, however many say so
        onPointerUp={() => {
          letGo();
          onSet();
        }}
        onPointerCancel={letGo}
        onKeyUp={onSet}
        className="min-w-0 flex-1 cursor-pointer accent-accent"
      />
      <Mono as="span">{shown}</Mono>
    </span>
  );
}

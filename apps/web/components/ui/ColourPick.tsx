'use client';
// A value's colour, chosen by hand: its swatch is a button, and pressing it opens the look's six keys as swatches
// in a row, the chosen one ringed, and 'As it comes' to hand the value back to the ranking. The row opens in the
// browser's top layer under its swatch, as a dropdown's list does (ui/Select); Escape or a press elsewhere closes
// it. Props only, and whether it's open.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** How far from the window's edges the row keeps. */
const EDGE = 8;

export function ColourPick({
  label,
  swatch,
  keys,
  chosen,
  asItComes,
  onPick,
}: {
  /** What a screen reader hears: the value whose colour it sets. */
  label: string;
  /** The colour it has now, as a swatch rule names it (key-mint …). */
  swatch: string | undefined;
  /** The keys to choose from, by name (mint, blue, coral, apricot, pink, grey). */
  keys: readonly string[];
  /** The key chosen for it, or null where it takes its colour as it comes. */
  chosen: string | null;
  /** The words for handing it back to the ranking. */
  asItComes: string;
  onPick: (key: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = pop.current;
    const at = button.current?.getBoundingClientRect();
    if (!open || !el || !at) return;
    el.showPopover();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const x = Math.min(Math.max(EDGE, at.left), window.innerWidth - w - EDGE);
    const y = at.bottom + h <= window.innerHeight - EDGE ? at.bottom : Math.max(EDGE, at.top - h);
    el.style.translate = `${Math.round(x)}px ${Math.round(y)}px`;
    el.querySelector<HTMLElement>('[aria-pressed="true"], button')?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!pop.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const pick = (key: string | null) => {
    setOpen(false);
    button.current?.focus();
    onPick(key);
  };
  return (
    <span className="relative inline-flex">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setOpen((now) => !now)}
        data-b="item"
        className="inline-flex cursor-pointer items-center bg-transparent p-space-4 hover:bg-tint hover:opacity-100 focus-visible:outline-accent aria-expanded:bg-tint"
      >
        <span className="swatch" data-swatch={swatch} />
      </button>
      {open && (
        <div
          ref={pop}
          popover="manual"
          className="fixed inset-auto top-0 left-0 m-0 flex items-center gap-space-4 border border-hairline bg-surface p-space-4"
        >
          {keys.map((k) => (
            <button
              key={k}
              type="button"
              aria-label={k}
              title={k}
              aria-pressed={chosen === k}
              onClick={() => pick(k)}
              className="inline-flex cursor-pointer items-center bg-transparent p-space-4 hover:bg-tint hover:opacity-100 focus-visible:outline-accent aria-pressed:outline aria-pressed:outline-primary"
            >
              <span className="swatch" data-swatch={`key-${k}`} />
            </button>
          ))}
          <button
            type="button"
            aria-pressed={chosen === null}
            onClick={() => pick(null)}
            className="cursor-pointer bg-transparent px-space-8 type-ui text-muted hover:bg-tint hover:text-primary hover:opacity-100 focus-visible:outline-accent aria-pressed:text-primary"
          >
            {asItComes}
          </button>
        </div>
      )}
    </span>
  );
}

'use client';
// A dropdown: one value chosen from a few, in a tool panel (Elco, 12 Nov, walk 2: "drop downs to changing the
// things ... very clearly to see what is category, what is input"; walk 3: "style these drop downs a little bit
// better"). In the side panel's look, from its parts: the value in UI words with a caret, answering as a row does
// (the item's fill under the pointer and while it's open), and its choices as the panel's menu (ui/Menu): NavItem
// rows, the chosen one lit, the keys moving through them, Escape or a press elsewhere closing it. The list opens
// in the browser's top layer, under its button, so no box's edge or scroll cuts it. Props only, and whether it's
// open.
import { useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon.tsx';
import { Menu } from './Menu.tsx';

export interface SelectOption {
  value: string;
  label: string;
}

/** How far from the window's edges the list keeps. */
const EDGE = 8;

export function Select({
  label,
  value,
  options,
  onChange,
}: {
  /** What a screen reader hears for it: the category it sets. */
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const chosen = options.find((o) => o.value === value);
  // the list in the top layer, under its button and flush with its end; above it where the window ends first
  useLayoutEffect(() => {
    const el = pop.current;
    const at = button.current?.getBoundingClientRect();
    if (!open || !el || !at) return;
    el.showPopover();
    const list = el.firstElementChild as HTMLElement | null;
    const w = list?.offsetWidth ?? 0;
    const h = list?.offsetHeight ?? 0;
    const x = Math.min(Math.max(at.right, w + EDGE), window.innerWidth - EDGE);
    const y = at.bottom + h <= window.innerHeight - EDGE ? at.bottom : Math.max(EDGE, at.top - h);
    el.style.translate = `${Math.round(x)}px ${Math.round(y)}px`;
  }, [open]);
  const close = () => {
    // the keys were in the list (a pick, Escape): they go back to the button
    const keys = pop.current?.contains(document.activeElement) ?? false;
    setOpen(false);
    if (keys) button.current?.focus();
  };
  return (
    <span className="relative flex min-w-0 shrink">
      <button
        ref={button}
        type="button"
        aria-label={`${label}: ${chosen?.label ?? ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        // the list closes itself on a press outside it; this press is the button's own
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setOpen((now) => !now)}
        data-b="item"
        className="flex h-row-height min-w-0 cursor-pointer items-center gap-space-4 bg-transparent px-space-8 type-ui text-primary hover:bg-tint hover:opacity-100 focus-visible:outline-accent aria-expanded:bg-tint"
      >
        <span className="min-w-0 truncate">{chosen?.label ?? ''}</span>
        <span aria-hidden="true" className="flex shrink-0 text-muted">
          <Icon name="down" small />
        </span>
      </button>
      {open && (
        <div
          ref={pop}
          popover="manual"
          className="fixed inset-auto top-0 left-0 m-0 overflow-visible border-0 bg-transparent p-0"
        >
          <Menu
            label={label}
            items={options.map((o) => ({
              key: o.value || 'none',
              label: o.label,
              chosen: o.value === value,
              onPick: () => onChange(o.value),
            }))}
            onClose={close}
          />
        </div>
      )}
    </span>
  );
}

'use client';
// A row's menu: what can be done with one thing, as a short list beside it. It takes the focus when it
// opens; arrow keys move through it and Enter picks; Escape, or pressing anywhere outside it and the
// button that opened it, closes it. Its items are NavItem rows. It holds no state: whether it's open is
// its ViewModel's, and it only says when to close.
import { type KeyboardEvent, useEffect, useRef } from 'react';
import type { IconName } from './Icon.tsx';
import { NavItem } from './NavItem.tsx';

export interface MenuItem {
  key: string;
  label: string;
  icon?: IconName;
  /** A choice, and this one is chosen: lit, and the focus starts on it (a dropdown's list, ui/Select). */
  chosen?: boolean;
  onPick: () => void;
}

export function Menu({
  label,
  items,
  onClose,
}: {
  /** What a screen reader hears for the menu. */
  label: string;
  items: MenuItem[];
  onClose: () => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const own = list.current?.parentElement;
    (
      list.current?.querySelector<HTMLElement>('[role="menuitem"][data-current]') ??
      list.current?.querySelector<HTMLElement>('[role="menuitem"]')
    )?.focus();
    const away = (e: PointerEvent) => {
      if (own && !own.contains(e.target as Node)) onClose();
    };
    const onEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', onEscape);
    };
  }, [onClose]);
  const step = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const all = [...(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = all.indexOf(document.activeElement as HTMLElement);
    const next = all[(at + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length];
    next?.focus();
  };
  return (
    <div
      ref={list}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={step}
      className="absolute top-full right-0 z-30 flex w-max flex-col border border-hairline bg-surface p-space-4"
    >
      {items.map((item) => (
        <div key={item.key} role="none">
          <NavItem
            onClick={() => {
              onClose();
              item.onPick();
            }}
            menuItem
            {...(item.icon ? { icon: item.icon } : {})}
            {...(item.chosen !== undefined ? { chosen: item.chosen } : {})}
            label={item.label}
          />
        </div>
      ))}
    </div>
  );
}

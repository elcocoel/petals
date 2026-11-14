'use client';
// A row's menu: what can be done with one thing, as a short list beside it. It takes the focus when it
// opens; arrow keys move through it and Enter picks; Escape, or pressing anywhere outside it and the
// button that opened it, closes it. Its items are NavItem rows, a logo before each where it has one. A long
// one can have a search on top, which takes the focus, and its items scroll in a set height. It holds no state:
// whether it's open, and what's searched, are its ViewModel's, and it only says when to close.
import { type KeyboardEvent, useEffect, useRef } from 'react';
import type { IconName } from './Icon.tsx';
import { NavItem } from './NavItem.tsx';

export interface MenuItem {
  key: string;
  label: string;
  icon?: IconName;
  /** A choice, and this one is chosen: lit, and the focus starts on it (a dropdown's list, ui/Select). */
  chosen?: boolean;
  /** A logo before the words (a chain's, a token's); with none, `mark`'s first letter stands in. */
  logo?: string | null;
  mark?: string;
  onPick: () => void;
}

export function Menu({
  label,
  items,
  onClose,
  align = 'end',
  search,
}: {
  /** What a screen reader hears for the menu. */
  label: string;
  /** Which edge of its button it lines up with: the end (right), or the start for a button at a column's left. */
  align?: 'start' | 'end';
  items: MenuItem[];
  onClose: () => void;
  /** A search on top of a long list: what it says, what's typed, and each change. */
  search?: { label: string; value: string; onChange: (value: string) => void };
}) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const own = list.current?.parentElement;
    (
      list.current?.querySelector<HTMLElement>('input') ??
      list.current?.querySelector<HTMLElement>('[role="menuitem"][data-current]') ??
      list.current?.querySelector<HTMLElement>('[role="menuitem"]')
    )?.focus();
    list.current
      ?.querySelector<HTMLElement>('[role="menuitem"][data-current]')
      ?.scrollIntoView({ block: 'nearest' });
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
      className={`absolute top-full z-30 flex w-max flex-col border border-hairline bg-surface p-space-4 ${align === 'start' ? 'left-0' : 'right-0'}`}
    >
      {search && (
        <input
          aria-label={search.label}
          placeholder={search.label}
          value={search.value}
          onChange={(e) => search.onChange(e.target.value)}
          className="mb-space-4 h-row-height border border-hairline bg-surface px-space-8 type-ui text-primary outline-none placeholder:text-muted focus:outline focus:outline-primary"
        />
      )}
      <div role="none" className={search ? 'max-h-figure-height overflow-y-auto' : 'contents'}>
        {items.map((item) => (
          <div key={item.key} role="none">
            <NavItem
              onClick={() => {
                onClose();
                item.onPick();
              }}
              menuItem
              {...(item.icon ? { icon: item.icon } : {})}
              {...(item.logo !== undefined ? { logo: item.logo } : {})}
              {...(item.mark ? { mark: item.mark } : {})}
              {...(item.chosen !== undefined ? { chosen: item.chosen } : {})}
              label={item.label}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

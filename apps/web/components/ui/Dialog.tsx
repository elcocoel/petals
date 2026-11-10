'use client';
// A small dialog over the page (design/side-panel.md, lines 26 and 29): the browser's own modal, so the
// focus stays in it and the page under it waits. Its title names what it's about; its close button, Escape
// and pressing outside it close it. When it opens, the first field in it, or else its first control, has
// the focus. Its height is set, and what it holds scrolls. It holds no state: whether it's open is its
// ViewModel's.
import { type ReactNode, useEffect, useRef } from 'react';
import { IconButton } from './IconButton.tsx';

export function Dialog({
  open,
  title,
  closeLabel,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const box = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = box.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      (d.querySelector<HTMLElement>('input, textarea') ?? null)?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: pressing outside it is a pointer's; Escape closes it through cancel
    <dialog
      ref={box}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === box.current) onClose();
      }}
      className="m-auto w-tile-width border border-hairline bg-surface p-0 text-primary backdrop:bg-tint"
    >
      {open && (
        <div className="flex flex-col gap-space-8 p-space-8">
          <div className="flex items-center gap-space-8 pl-space-8">
            <h2 className="my-0 min-w-0 flex-1 truncate type-ui font-semibold" title={title}>
              {title}
            </h2>
            <IconButton icon="close" label={closeLabel} onClick={onClose} />
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

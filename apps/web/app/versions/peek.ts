// row.peek, for the rows that fold, which is FaqItem. They come folded and open by a click, a tap or Enter, with
// no timer, one at a time: opening a folded row folds the one that was open, and pressing an open row folds it.
// Opening one row while another stays open would shift the page under the reader.
//
// `peekRows` is what happens, with no DOM in it, so a test can run it. `peek` is the DOM around it: it folds
// the rows the server sent open, and while a row is moving it holds what's under the pointer still on screen.
import { v2 } from '@petal/tokens';

const P = v2.script.peek;

type Stop = () => void;

export interface PeekHands<Row> {
  isOpen: (row: Row) => boolean;
  setOpen: (row: Row, open: boolean) => void;
  /** Every row there is, to fold the one that's open. */
  rows: () => Iterable<Row>;
}

export function peekRows<Row>({ isOpen, setOpen, rows }: PeekHands<Row>) {
  return {
    /** A click, a tap or Enter on it. */
    press(row: Row) {
      if (isOpen(row)) {
        setOpen(row, false);
        return;
      }
      for (const other of rows()) if (other !== row && isOpen(other)) setOpen(other, false);
      setOpen(row, true);
    },
  };
}

/** What it needs of JoyLayer. */
interface Host {
  reduced: boolean;
  fine: boolean;
  pointer: { target: Element | null };
  frame: (run: () => boolean) => Stop;
  wake: () => void;
  onChange: (run: () => void) => void;
}

const ROW = 'details[data-b="row"]';

export function peek(host: Host): Stop {
  /** How each row came from the server, to give it back if the version goes off. */
  const known = new Map<HTMLDetailsElement, boolean>();
  const fold = () => {
    for (const row of document.querySelectorAll<HTMLDetailsElement>(ROW)) {
      if (known.has(row)) continue;
      known.set(row, row.open);
      row.open = false;
    }
  };
  fold();
  host.onChange(fold);

  // A row that folds or opens moves everything under it. So for as long as one is moving, whatever the
  // pointer is on is held still on screen, by scrolling the page by what it moved: the page gives way, not
  // the thing being read. Measured against the row or band, not the element, which may be swelling. If the
  // page scrolled by any other hand this frame, that's not ours to undo, so it only takes a new reading.
  let until = 0;
  let anchor: Element | null = null;
  let top = 0;
  let scrolled = 0;
  const hold = host.frame(() => {
    if (!until) return false;
    const held = host.pointer.target?.closest(`${ROW}, section, footer`) ?? null;
    if (held?.isConnected) {
      const now = held.getBoundingClientRect().top;
      if (held === anchor && window.scrollY === scrolled) {
        if (now !== top) window.scrollBy({ top: now - top, behavior: 'instant' });
      } else {
        anchor = held;
        top = now;
      }
      scrolled = window.scrollY;
    }
    if (performance.now() < until) return true;
    until = 0;
    anchor = null;
    return false;
  });

  const rows = peekRows<HTMLDetailsElement>({
    isOpen: (row) => row.open,
    setOpen(row, open) {
      row.open = open;
      if (host.reduced) return;
      until = performance.now() + P.foldMs + 80;
      host.wake();
    },
    rows: () => document.querySelectorAll<HTMLDetailsElement>(ROW),
  });

  const pressed = (e: MouseEvent) => {
    const summary = (e.target as Element).closest('summary');
    const row = summary?.parentElement;
    if (!row?.matches(ROW)) return;
    e.preventDefault();
    rows.press(row as HTMLDetailsElement);
  };
  document.addEventListener('click', pressed);

  return () => {
    hold();
    document.removeEventListener('click', pressed);
    for (const [row, open] of known) row.open = open;
  };
}

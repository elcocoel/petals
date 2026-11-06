// row.peek, for the rows that fold, which is FaqItem. Elco: "They need to come collapsed... they could open
// on hover. And if you hover off, they stay open for a bit and then they close softly, so that if a user
// slides through, it doesn't just jump a bunch of shit around."
//
// `peekRows` is what happens and when, with no DOM in it, so a test can run it on a fake clock. `peek` is
// the DOM around it. A click or Enter is the one sure thing: it opens and pins a folded row, pins one that
// a pointer opened, and folds a pinned one. A row folded by a click stays shut until the pointer has left.
import { v2 } from '@petal/tokens';

const P = v2.script.peek;

type Stop = () => void;

export interface PeekHands<Row> {
  isOpen: (row: Row) => boolean;
  setOpen: (row: Row, open: boolean) => void;
}

export function peekRows<Row>({ isOpen, setOpen }: PeekHands<Row>) {
  const rest = new Map<Row, ReturnType<typeof setTimeout>>();
  const stay = new Map<Row, ReturnType<typeof setTimeout>>();
  const pinned = new Set<Row>();
  /** Folded by hand, with the pointer still on it. */
  const shut = new Set<Row>();

  const cancel = (timers: Map<Row, ReturnType<typeof setTimeout>>, row: Row) => {
    const timer = timers.get(row);
    if (timer !== undefined) clearTimeout(timer);
    timers.delete(row);
  };

  return {
    /** The pointer came onto a row. */
    enter(row: Row) {
      cancel(stay, row);
      if (isOpen(row) || shut.has(row) || rest.has(row)) return;
      rest.set(
        row,
        setTimeout(() => {
          rest.delete(row);
          setOpen(row, true);
        }, P.restMs),
      );
    },
    /** The pointer went off it. */
    leave(row: Row) {
      cancel(rest, row);
      shut.delete(row);
      if (!isOpen(row) || pinned.has(row)) return;
      cancel(stay, row);
      stay.set(
        row,
        setTimeout(() => {
          stay.delete(row);
          setOpen(row, false);
        }, P.stayMs),
      );
    },
    /** A click, a tap or Enter on it. */
    press(row: Row) {
      cancel(rest, row);
      cancel(stay, row);
      if (!isOpen(row)) {
        pinned.add(row);
        setOpen(row, true);
      } else if (pinned.has(row)) {
        pinned.delete(row);
        shut.add(row);
        setOpen(row, false);
      } else {
        pinned.add(row);
      }
    },
    stop() {
      for (const timer of rest.values()) clearTimeout(timer);
      for (const timer of stay.values()) clearTimeout(timer);
      rest.clear();
      stay.clear();
      pinned.clear();
      shut.clear();
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
  });

  let over: HTMLDetailsElement | null = null;
  const onto = (row: HTMLDetailsElement | null) => {
    if (row === over) return;
    if (over) rows.leave(over);
    over = row;
    if (row) rows.enter(row);
  };
  const moved = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    onto((e.target as Element).closest<HTMLDetailsElement>(ROW));
  };
  const left = () => onto(null);
  const pressed = (e: MouseEvent) => {
    const summary = (e.target as Element).closest('summary');
    const row = summary?.parentElement;
    if (!row?.matches(ROW)) return;
    e.preventDefault();
    rows.press(row as HTMLDetailsElement);
  };

  // With reduced motion the page doesn't move unless it's asked to: a row only opens by a click or Enter.
  const hovers = host.fine && !host.reduced;
  if (hovers) {
    document.addEventListener('pointerover', moved, { passive: true });
    document.documentElement.addEventListener('pointerleave', left);
  }
  document.addEventListener('click', pressed);

  return () => {
    hold();
    rows.stop();
    document.removeEventListener('pointerover', moved);
    document.documentElement.removeEventListener('pointerleave', left);
    document.removeEventListener('click', pressed);
    for (const [row, open] of known) row.open = open;
  };
}

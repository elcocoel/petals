// field.type: the ask box's placeholder types its lines in and out, in order, then loops. It stops for good
// when the box gets focus. It starts holding the first line, which is what the page already shows, so nothing
// flashes. Under reduced motion, or in v1, the box just shows that line. Off-screen or in a hidden tab it waits.
import { v2 } from '@petal/tokens';

const T = v2.script.typed;

type Stop = () => void;

/** The loop itself, without a page: `show` writes the text and `wait` says when to come back. */
export function typeLines(
  lines: readonly string[],
  show: (text: string) => void,
  wait: (ms: number, next: () => void) => void,
) {
  let line = 0;
  let shown = (lines[0] ?? '').length;
  let stopped = false;
  const current = () => lines[line] ?? '';
  const type = () => {
    if (stopped) return;
    shown += 1;
    show(current().slice(0, shown));
    if (shown < current().length) wait(T.typeMs, type);
    else wait(T.holdMs, erase);
  };
  const erase = () => {
    if (stopped) return;
    shown -= 1;
    show(current().slice(0, shown));
    if (shown > 0) {
      wait(T.eraseMs, erase);
      return;
    }
    line = (line + 1) % lines.length;
    wait(T.gapMs, type);
  };
  wait(T.holdMs, erase);
  return {
    /** Ends the loop on a whole line, never a broken one. */
    stop() {
      stopped = true;
      show(current());
    },
  };
}

interface Host {
  reduced: boolean;
  onChange: (run: () => void) => void;
}

const BOX = '[data-typed] [data-b="field"] textarea';

function readLines(box: Element): string[] {
  try {
    const lines = JSON.parse(box.closest('[data-typed]')?.getAttribute('data-typed') ?? '[]');
    return Array.isArray(lines) ? lines : [];
  } catch {
    return [];
  }
}

/** A line can wrap on a narrow box. Hold the tallest one's height, so what's under it never jumps. */
function holdTallest(box: HTMLTextAreaElement, lines: readonly string[]) {
  const was = box.placeholder;
  box.style.minHeight = '';
  let tallest = 0;
  for (const line of lines) {
    box.placeholder = line;
    tallest = Math.max(tallest, box.offsetHeight);
  }
  box.placeholder = was;
  box.style.minHeight = `${tallest}px`;
}

function typeInto(box: HTMLTextAreaElement, lines: readonly string[]): Stop {
  const first = box.placeholder;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let visible = true;
  const wait = (ms: number, next: () => void) => {
    const timer = setTimeout(function again() {
      timers.delete(timer);
      if (visible && !document.hidden) next();
      else wait(T.holdMs, next);
    }, ms);
    timers.add(timer);
  };
  const seen = new IntersectionObserver((entries) => {
    visible = entries.at(-1)?.isIntersecting ?? true;
  });
  seen.observe(box);
  const measure = () => holdTallest(box, lines);
  measure();
  window.addEventListener('resize', measure);
  const typing = typeLines(lines, (text) => box.setAttribute('placeholder', text), wait);
  const halt = () => {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    seen.disconnect();
    window.removeEventListener('resize', measure);
    box.removeEventListener('focus', onFocus);
  };
  const onFocus = () => {
    halt();
    typing.stop();
  };
  box.addEventListener('focus', onFocus);
  if (document.activeElement === box) onFocus();
  return () => {
    halt();
    box.setAttribute('placeholder', first);
    box.style.minHeight = '';
  };
}

export function typed(host: Host): Stop {
  if (host.reduced) return () => {};
  const stops = new Map<Element, Stop>();
  const scan = () => {
    for (const box of document.querySelectorAll<HTMLTextAreaElement>(BOX)) {
      if (stops.has(box)) continue;
      const lines = readLines(box);
      if (lines.length > 1) stops.set(box, typeInto(box, lines));
    }
  };
  scan();
  host.onChange(scan);
  return () => {
    for (const stop of stops.values()) stop();
    stops.clear();
  };
}

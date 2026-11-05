'use client';
// The scripted half of version 2, one module, active only while <html> says so. Each behaviour is a child
// in packages/tokens/behaviours.ts, started from SCRIPTED at the bottom, and hands back what undoes it, so
// the key `v` can leave the page exactly as v1 drew it. It holds no state React knows about and renders
// nothing. `?off=<parent>` strips the attribute first, so a parent that's off is never found here.
// Pointer work happens in one animation frame, only while something is moving, and writes to the one
// element under the pointer. Nothing here writes to <html>, which would restyle the whole page.
import { type BehaviourName, type as typeStyles, v2, wordmark } from '@petal/tokens';
import { useEffect } from 'react';

const S = v2.script;
const NS = 'http://www.w3.org/2000/svg';

type Stop = () => void;
/** Runs in the animation frame. True asks for another one. */
type Frame = () => boolean;

interface Joy {
  /** `prefers-reduced-motion`: nothing here moves. */
  reduced: boolean;
  /** A real pointer that can hover. */
  fine: boolean;
  pointer: { x: number; y: number; target: Element | null };
  frame: (run: Frame) => Stop;
  wake: () => void;
  /** Whenever an element is first seen, before its attribute is set. */
  onSeen: (selector: string, run: (el: Element) => void) => void;
  /** Whenever something is added to the page. */
  onChange: (run: () => void) => void;
  /** Runs whenever the page scrolls. */
  onScroll: (run: () => void) => void;
}

const clamp = (v: number, low = 0, high = 1) => Math.min(high, Math.max(low, v));
const px = (v: number) => `${v.toFixed(1)}px`;

/** Everything this module wrote into a `style` attribute goes when it stops. */
const written = new Set<HTMLElement | SVGElement>();
function write(el: Element, name: string, value: string) {
  const styled = el as HTMLElement | SVGElement;
  written.add(styled);
  styled.style.setProperty(name, value);
}
function eraseWritten() {
  // Asking first makes Chrome write the attribute out: otherwise removing it leaves style="".
  for (const el of written) {
    if (el.hasAttribute('style')) el.removeAttribute('style');
  }
  written.clear();
}

/** One Frame set, one `requestAnimationFrame`, and none at all when nothing is moving. */
function frames() {
  const running = new Set<Frame>();
  let raf = 0;
  const run = () => {
    raf = 0;
    let again = false;
    for (const f of running) if (f()) again = true;
    if (again) raf = requestAnimationFrame(run);
  };
  return {
    add(f: Frame): Stop {
      running.add(f);
      return () => running.delete(f);
    },
    wake() {
      if (!raf) raf = requestAnimationFrame(run);
    },
    stop() {
      cancelAnimationFrame(raf);
      running.clear();
    },
  };
}

// ----- reveal ------------------------------------------------------------------------------------

/** What each reveal watches. CSS holds it back until `data-seen`, then plays. */
const REVEALS = {
  'surface.reveal': ':is(section, footer)[data-b="surface"]',
  'action.arrive': '[data-b="action"][data-kind="starter"]',
  'box.rise': '[data-b="box"]',
  'row.arrive': '[data-b="row"]',
  'figure.arrive': '[data-b="figure"]',
  'mark.arrive': '[data-b="mark"]',
  'head.rise': '[data-b="head"]',
} as const;

/** Things arriving together stagger among their siblings; a head and a terminal among their lines. */
function stagger(el: Element, i: number) {
  write(el, '--i', String(i));
  if (el.matches('[data-b="head"]')) {
    let n = 0;
    for (const child of el.children) {
      const lines = child.querySelectorAll('[data-line]');
      if (lines.length === 0) write(child, '--i', String(n++));
      for (const line of lines) write(line, '--i', String(n++));
    }
  }
  if (el.matches('[data-kind="term"]')) {
    el.querySelectorAll('p').forEach((p, n) => {
      if (!p.closest('[data-kind="term"] > :first-child')) write(p, '--i', String(n));
    });
  }
}

function startReveals(hooks: Map<string, (el: Element) => void>, onChange: Joy['onChange']): Stop {
  const watched = new WeakSet<Element>();
  const io = new IntersectionObserver(
    (entries) => {
      const among = new Map<Element | null, number>();
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        const i = among.get(el.parentElement) ?? 0;
        among.set(el.parentElement, i + 1);
        stagger(el, i);
        for (const [selector, run] of hooks) if (el.matches(selector)) run(el);
        el.setAttribute('data-seen', '');
        io.unobserve(el);
      }
    },
    { rootMargin: '0px 0px -6% 0px' },
  );
  const scan = () => {
    for (const selector of Object.values(REVEALS)) {
      for (const el of document.querySelectorAll(selector)) {
        if (!watched.has(el)) {
          watched.add(el);
          io.observe(el);
        }
      }
    }
  };
  scan();
  onChange(scan);
  return () => {
    io.disconnect();
    for (const el of document.querySelectorAll('[data-seen]')) el.removeAttribute('data-seen');
  };
}

// ----- surface -----------------------------------------------------------------------------------

function spotlight(joy: Joy): Stop {
  if (joy.reduced || !joy.fine) return () => {};
  const spots = new Map<Element, HTMLElement>();
  let active: Element | null = null;
  const off = joy.frame(() => {
    const band = joy.pointer.target?.closest('section[data-b="surface"], footer[data-b="surface"]');
    const next = band ?? null;
    if (next !== active) {
      if (active) spots.get(active)?.removeAttribute('data-on');
      active = next;
      if (next && !spots.has(next)) {
        const spot = document.createElement('span');
        spot.setAttribute('data-spot', '');
        spot.setAttribute('aria-hidden', 'true');
        next.prepend(spot);
        spots.set(next, spot);
      }
      if (next) spots.get(next)?.setAttribute('data-on', '');
    }
    if (next) {
      const box = next.getBoundingClientRect();
      const spot = spots.get(next) as HTMLElement;
      spot.style.translate = `${px(joy.pointer.x - box.left)} ${px(joy.pointer.y - box.top)}`;
    }
    return false;
  });
  return () => {
    off();
    for (const spot of spots.values()) spot.remove();
  };
}

function stick(joy: Joy): Stop {
  let tight = false;
  const update = () => {
    const next = window.scrollY > S.tightAt;
    if (next === tight) return;
    tight = next;
    for (const nav of document.querySelectorAll('nav[data-b="surface"]')) {
      nav.toggleAttribute('data-tight', tight);
    }
  };
  update();
  joy.onScroll(update);
  return () => {
    for (const nav of document.querySelectorAll('[data-tight]')) nav.removeAttribute('data-tight');
  };
}

// ----- following the pointer inside one element ----------------------------------------------------

interface Following {
  el: Element;
  box: DOMRect | null;
  x: number;
  y: number;
  toX: number;
  toY: number;
  over: boolean;
}

/**
 * What's under the pointer gets the pointer's place inside it, right away (`--b-x`, `--b-y`), and a
 * position from -1 to 1 that eases there and eases home when the pointer leaves. Reading the box only on
 * entering means what this moves can't feed back into it.
 */
function follow(
  joy: Joy,
  selector: string,
  moved: (f: Following) => void,
  gone: (el: Element) => void,
): Stop {
  const live = new Map<Element, Following>();
  let current: Following | null = null;
  const off = joy.frame(() => {
    const el = joy.pointer.target?.closest(selector) ?? null;
    if (el !== (current?.el ?? null)) {
      if (current) {
        current.over = false;
        current.toX = 0;
        current.toY = 0;
      }
      current = null;
      if (el) {
        current = live.get(el) ?? { el, box: null, x: 0, y: 0, toX: 0, toY: 0, over: true };
        current.over = true;
        current.box = el.getBoundingClientRect();
        live.set(el, current);
      }
    }
    if (current?.box) {
      const { x, y } = joy.pointer;
      const { left, top, width, height } = current.box;
      write(current.el, '--b-x', px(x - left));
      write(current.el, '--b-y', px(y - top));
      current.toX = clamp(((x - left) / width) * 2 - 1, -1, 1);
      current.toY = clamp(((y - top) / height) * 2 - 1, -1, 1);
    }
    let moving = false;
    for (const f of live.values()) {
      f.x += (f.toX - f.x) * S.follow;
      f.y += (f.toY - f.y) * S.follow;
      const settled = Math.abs(f.toX - f.x) < 0.002 && Math.abs(f.toY - f.y) < 0.002;
      moved(f);
      if (!settled) moving = true;
      else if (!f.over) {
        gone(f.el);
        live.delete(f.el);
      }
    }
    return moving;
  });
  return () => {
    off();
    for (const el of live.keys()) gone(el);
  };
}

/** The sheen and the lean are one follower: the sheen needs only `--b-x` and `--b-y`. */
const ACTION = '[data-b="action"]:not(:disabled)';

function sheen(joy: Joy): Stop {
  if (joy.reduced || !joy.fine) return () => {};
  return follow(
    joy,
    ACTION,
    () => {},
    () => {},
  );
}

function magnet(joy: Joy): Stop {
  if (joy.reduced || !joy.fine) return () => {};
  return follow(
    joy,
    `${ACTION}[data-kind="primary"]`,
    (f) => {
      f.el.setAttribute('data-pull', '');
      write(f.el, '--b-mx', px(f.x * S.magnet));
      write(f.el, '--b-my', px(f.y * S.magnet));
    },
    (el) => el.removeAttribute('data-pull'),
  );
}

const BOX = '[data-b="box"]:not(foreignObject *)';

function boxSpot(joy: Joy): Stop {
  if (joy.reduced || !joy.fine) return () => {};
  return follow(
    joy,
    BOX,
    () => {},
    () => {},
  );
}

function tilt(joy: Joy): Stop {
  if (joy.reduced || !joy.fine) return () => {};
  return follow(
    joy,
    // A terminal is all words, and words on a tilted layer go soft. It lifts and glows instead.
    `${BOX}:not([data-kind="term"])`,
    (f) => {
      f.el.setAttribute('data-tilt', '');
      write(f.el, '--b-rx', f.x.toFixed(3));
      write(f.el, '--b-ry', (-f.y).toFixed(3));
    },
    (el) => el.removeAttribute('data-tilt'),
  );
}

// ----- figure ------------------------------------------------------------------------------------

/** Which marks of the hero drawings each note speaks of, by their order in lib/figures.ts. */
const NOTE_MARKS: Record<string, Record<string, [number, number?][]>> = {
  one: { 'hero-flower': [[4, 0]], 'hero-leaders': [[0], [1]] },
  two: { 'hero-flower': [[6]], 'hero-leaders': [[2], [3]] },
  three: { 'hero-flower': [[3]], 'hero-leaders': [[4], [5]] },
  four: { 'hero-flower': [[0], [1]], 'hero-leaders': [[6], [7]] },
};

function noteFor(kind: string, mark: number, sub: number): string | null {
  for (const [note, kinds] of Object.entries(NOTE_MARKS)) {
    for (const [m, s] of kinds[kind] ?? []) {
      if (m === mark && (s === undefined || s === sub)) return note;
    }
  }
  return null;
}

interface Petal {
  el: SVGPathElement;
  angle: number;
  scale: number;
  lit: boolean;
}

interface Layer {
  el: SVGGElement;
  depth: number;
}

interface Drawn {
  svg: SVGSVGElement;
  petals: Petal[];
  layers: Layer[];
}

const drawn = new Map<Element, Drawn>();
const KEEP_LAYERS = new Set(['hero-flower', 'reading-flower', 'cell']);
const LEANING = new Set(['hero-flower', 'reading-flower', 'tower', 'even', 'blocs']);

/** Clockwise from twelve o'clock, 0 to 1. */
const around = (x: number, y: number) => {
  const turn = Math.atan2(x, -y) / (Math.PI * 2);
  return turn < 0 ? turn + 1 : turn;
};

/**
 * One compound path per colour draws fast and can't be touched. Here each sub-path gets its own <path>
 * beside the originals, which go hidden, so each can bloom, draw and answer on its own. The lines go back
 * to one path when they've drawn.
 */
function splitDrawing(joy: Joy, svg: SVGSVGElement): void {
  const kind = svg.getAttribute('data-kind') ?? '';
  const box = svg.getBoundingClientRect();
  if (box.width < S.splitFrom || drawn.has(svg)) return;
  if (joy.reduced && !NOTE_MARKS.one?.[kind]) return;
  const view = svg.viewBox.baseVal;
  const scale = svg.getScreenCTM()?.a ?? 1;
  const entry: Drawn = { svg, petals: [], layers: [] };
  const marks = [...svg.children].filter((n) => n.tagName === 'path') as SVGPathElement[];
  const lineLayers: [SVGGElement, SVGPathElement][] = [];

  marks.forEach((mark, m) => {
    const fill = mark.getAttribute('fill') ?? 'none';
    const stroked = mark.hasAttribute('stroke');
    const part = fill === 'none' ? 'line' : stroked ? 'dot' : 'petal';
    const group = document.createElementNS(NS, 'g');
    group.setAttribute('data-layer', String(m));
    const pieces = (mark.getAttribute('d') ?? '').split(/(?=M)/).filter(Boolean);
    pieces.forEach((d, s) => {
      const piece = mark.cloneNode(false) as SVGPathElement;
      piece.setAttribute('d', d);
      piece.setAttribute('data-part', part);
      const note = noteFor(kind, m, s);
      if (note) piece.setAttribute('data-link', note);
      group.append(piece);
    });
    svg.append(group);
    mark.setAttribute('visibility', 'hidden');
    if (part === 'line') lineLayers.push([group, mark]);
    if (KEEP_LAYERS.has(kind)) {
      const depth =
        part === 'line' ? 0.25 : fill.includes('accent') ? 1 : fill.includes('primary') ? 0.8 : 0.6;
      entry.layers.push({ el: group, depth });
    }
    for (const piece of group.children as HTMLCollectionOf<SVGPathElement>) {
      const b = piece.getBBox();
      const turn = around(b.x + b.width / 2 - view.width / 2, b.y + b.height / 2 - view.height / 2);
      write(piece, '--a', kind === 'hero-leaders' ? '0' : turn.toFixed(3));
      if (part === 'line') write(piece, '--len', px(piece.getTotalLength() * scale + 1));
      if (part === 'petal' && LEANING.has(kind)) {
        entry.petals.push({ el: piece, angle: turn, scale: 1, lit: false });
      }
    }
  });
  drawn.set(svg, entry);
  svg.setAttribute('data-split', '');
  if (kind === 'hero-leaders') return;
  // Hundreds of tiny sub-paths have done their job once they've drawn.
  window.setTimeout(() => {
    if (!drawn.has(svg)) return;
    for (const [group, mark] of lineLayers) {
      const whole = mark.cloneNode(false) as SVGPathElement;
      whole.removeAttribute('visibility');
      whole.setAttribute('data-part', 'settled');
      const note = group.firstElementChild?.getAttribute('data-link');
      if (note) whole.setAttribute('data-link', note);
      group.replaceChildren(whole);
    }
  }, S.settleMs);
}

function undoDrawings() {
  for (const { svg } of drawn.values()) {
    svg.removeAttribute('data-split');
    svg.querySelectorAll(':scope > g[data-layer]').forEach((g) => {
      g.remove();
    });
    svg.querySelectorAll(':scope > path').forEach((path) => {
      path.removeAttribute('visibility');
    });
  }
  drawn.clear();
}

function bloom(joy: Joy): Stop {
  joy.onSeen('svg[data-b="figure"]', (svg) => splitDrawing(joy, svg as SVGSVGElement));
  return undoDrawings;
}

/** Rects are read when the pointer moves over a drawing, and forgotten when the page scrolls. */
function drawingBox(joy: Joy) {
  const boxes = new Map<Element, DOMRect>();
  joy.onScroll(() => boxes.clear());
  return (svg: Element) => {
    let box = boxes.get(svg);
    if (!box) {
      box = svg.getBoundingClientRect();
      boxes.set(svg, box);
    }
    return box;
  };
}

function lean(joy: Joy): Stop {
  if (joy.reduced || !joy.fine) return () => {};
  const boxOf = drawingBox(joy);
  return joy.frame(() => {
    let moving = false;
    for (const { svg, petals } of drawn.values()) {
      if (petals.length === 0) continue;
      const box = boxOf(svg);
      const dx = joy.pointer.x - (box.left + box.width / 2);
      const dy = joy.pointer.y - (box.top + box.height / 2);
      const reach = clamp(1.25 - Math.hypot(dx, dy) / box.width);
      const turn = around(dx, dy);
      for (const petal of petals) {
        let apart = Math.abs(petal.angle - turn);
        if (apart > 0.5) apart = 1 - apart;
        const near = reach * Math.exp(-((apart / (S.leanWidth * 0.25)) ** 2));
        const to = 1 + S.lean * near + (petal.lit ? S.lean * 0.6 : 0);
        const next = petal.scale + (to - petal.scale) * S.follow;
        if (Math.abs(next - petal.scale) > 0.0004) {
          petal.scale = next;
          write(petal.el, 'scale', next.toFixed(4));
          moving = true;
        }
      }
    }
    return moving;
  });
}

function parallax(joy: Joy): Stop {
  if (joy.reduced || !joy.fine) return () => {};
  const boxOf = drawingBox(joy);
  const at = new Map<Element, { x: number; y: number }>();
  return joy.frame(() => {
    let moving = false;
    for (const { svg, layers } of drawn.values()) {
      if (layers.length === 0) continue;
      const box = boxOf(svg);
      const nx = (joy.pointer.x - (box.left + box.width / 2)) / box.width;
      const ny = (joy.pointer.y - (box.top + box.height / 2)) / box.height;
      const inside = Math.abs(nx) < 0.75 && Math.abs(ny) < 0.75;
      const was = at.get(svg) ?? { x: 0, y: 0 };
      const x = was.x + ((inside ? nx : 0) - was.x) * S.follow;
      const y = was.y + ((inside ? ny : 0) - was.y) * S.follow;
      if (Math.abs(x - was.x) + Math.abs(y - was.y) < 0.0005) continue;
      at.set(svg, { x, y });
      for (const { el, depth } of layers) {
        write(el, 'translate', `${px(x * depth * S.parallax)} ${px(y * depth * S.parallax)}`);
      }
      moving = true;
    }
    return moving;
  });
}

function link(joy: Joy): Stop {
  const stops = [...document.querySelectorAll('[data-b="figure"][data-kind="annotated"]')].map(
    (root) => {
      let current: string | null = null;
      let hold = 0;
      const set = (note: string | null) => {
        window.clearTimeout(hold);
        if (note === current) return;
        for (const el of root.querySelectorAll('[data-lit]')) el.removeAttribute('data-lit');
        current = note;
        if (note === null) root.removeAttribute('data-linking');
        else {
          root.setAttribute('data-linking', note);
          for (const el of root.querySelectorAll(`[data-note="${note}"], [data-link="${note}"]`)) {
            el.setAttribute('data-lit', '');
          }
        }
        for (const { petals, svg } of drawn.values()) {
          if (!root.contains(svg)) continue;
          for (const petal of petals) petal.lit = petal.el.hasAttribute('data-lit');
        }
        joy.wake();
      };
      /** Slipping off a petal into the gap beside it isn't leaving. */
      const release = () => {
        window.clearTimeout(hold);
        if (current !== null) hold = window.setTimeout(() => set(null), S.linkHold);
      };
      const over = (e: Event) => {
        const hit = (e.target as Element).closest('[data-note], [data-link]');
        const note = hit?.getAttribute('data-note') ?? hit?.getAttribute('data-link') ?? null;
        if (note === null) release();
        else set(note);
      };
      const out = (e: Event) => {
        if (!root.contains((e as PointerEvent).relatedTarget as Node | null)) release();
      };
      root.addEventListener('pointerover', over);
      root.addEventListener('pointerout', out);
      return () => {
        root.removeEventListener('pointerover', over);
        root.removeEventListener('pointerout', out);
        set(null);
      };
    },
  );
  return () => {
    for (const stop of stops) stop();
  };
}

function cellField(joy: Joy): Stop {
  if (joy.reduced || !joy.fine) return () => {};
  const boxOf = drawingBox(joy);
  const scales = new Map<Element, number>();
  return joy.frame(() => {
    let moving = false;
    for (const svg of document.querySelectorAll('[data-b="figure"][data-kind="cell-repeat"]')) {
      const box = boxOf(svg);
      const view = (svg as SVGSVGElement).viewBox.baseVal;
      const unit = box.width / view.width;
      for (const use of svg.querySelectorAll('use')) {
        const cx = box.left + (use.x.baseVal.value + use.width.baseVal.value / 2) * unit;
        const cy = box.top + (use.y.baseVal.value + use.height.baseVal.value / 2) * unit;
        const near = clamp(1 - Math.hypot(joy.pointer.x - cx, joy.pointer.y - cy) / S.fieldReach);
        const to = 1 + S.fieldOpen * near * near;
        const was = scales.get(use) ?? 1;
        const next = was + (to - was) * S.follow;
        if (Math.abs(next - was) > 0.0004) {
          scales.set(use, next);
          write(use, 'scale', next.toFixed(4));
          moving = true;
        }
      }
    }
    return moving;
  });
}

// ----- mark --------------------------------------------------------------------------------------

type Axes = Record<string, number>;

interface MarkLayer {
  el: Element;
  rest: Axes;
  open: Axes;
}

interface Mark {
  el: Element;
  layers: MarkLayer[];
  value: number;
  written: number;
  /** What arriving holds it open by, separately from the pointer. */
  arrive: number;
  box: DOMRect | null;
  /** The footer's: scrolling it into view is what closes it. */
  scrolled: boolean;
  /** Time-based: settling down from fully open. */
  settling: boolean;
  visible: boolean;
}

const axesCss = (a: Axes, b: Axes, t: number) =>
  Object.keys(a)
    .map((tag) => `"${tag}" ${((a[tag] ?? 0) + ((b[tag] ?? 0) - (a[tag] ?? 0)) * t).toFixed(2)}`)
    .join(', ');

function markLayers(el: Element): MarkLayer[] {
  if (el.getAttribute('data-kind') === 'numeral') {
    const rest = (typeStyles['Pixel numeral'].axes ?? {}) as Axes;
    return [{ el, rest, open: S.numeralOpen }];
  }
  return (['back', 'middle', 'front'] as const).flatMap((name) => {
    const layer = el.querySelector(`.wordmark-${name}`);
    return layer ? [{ el: layer, rest: wordmark.layers[name], open: S.markOpen[name] }] : [];
  });
}

/** `mark.open` and `mark.arrive` write the same axes, so they share this one list of marks. */
function marks(joy: Joy) {
  const list = new Map<Element, Mark>();
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const mark = list.get(entry.target);
      if (mark) mark.visible = entry.isIntersecting;
    }
    joy.wake();
  });
  const scan = () => {
    for (const el of document.querySelectorAll('[data-b="mark"]')) {
      if (list.has(el)) continue;
      const scrolled = !joy.reduced && el.closest('footer') !== null;
      list.set(el, {
        el,
        layers: markLayers(el),
        value: 0,
        written: 0,
        arrive: scrolled ? 1 : 0,
        box: null,
        scrolled,
        settling: false,
        visible: false,
      });
      io.observe(el);
    }
  };
  scan();
  joy.onChange(scan);
  joy.onScroll(() => {
    for (const mark of list.values()) mark.box = null;
    joy.wake();
  });
  const off = joy.frame(() => {
    let moving = false;
    for (const mark of list.values()) {
      if (!mark.visible) continue;
      mark.box ??= mark.el.getBoundingClientRect();
      const box = mark.box;
      let to = 0;
      if (joy.fine && !joy.reduced) {
        const dx = Math.max(box.left - joy.pointer.x, 0, joy.pointer.x - box.right);
        const dy = Math.max(box.top - joy.pointer.y, 0, joy.pointer.y - box.bottom);
        const near = clamp(1 - Math.hypot(dx, dy) / (box.height * S.markReach));
        to = near * near;
      }
      if (mark.scrolled) {
        const footer = mark.el.closest('footer');
        const f = footer?.getBoundingClientRect();
        if (f) mark.arrive = clamp((f.bottom - window.innerHeight) / f.height);
      }
      if (mark.settling) {
        mark.arrive *= 1 - S.markSettle;
        if (mark.arrive < 0.004) {
          mark.arrive = 0;
          mark.settling = false;
        }
        moving = true;
      }
      to = Math.max(to, mark.arrive);
      const next = mark.value + (to - mark.value) * S.follow;
      mark.value = Math.abs(to - next) < 0.002 ? to : next;
      if (mark.value !== to) moving = true;
      if (Math.abs(mark.value - mark.written) > 0.003 || (mark.value === 0 && mark.written !== 0)) {
        mark.written = mark.value;
        for (const layer of mark.layers) {
          if (mark.value === 0)
            (layer.el as HTMLElement).style.removeProperty('font-variation-settings');
          else {
            write(layer.el, 'font-variation-settings', axesCss(layer.rest, layer.open, mark.value));
          }
        }
      }
    }
    return moving;
  });
  return {
    settle(el: Element) {
      const mark = list.get(el);
      if (!mark || mark.scrolled || el.closest('nav') || joy.reduced) return;
      mark.arrive = 1;
      mark.value = 1;
      mark.settling = true;
      joy.wake();
    },
    stop() {
      off();
      io.disconnect();
    },
  };
}

let markLayer: ReturnType<typeof marks> | null = null;

function markOpen(joy: Joy): Stop {
  markLayer = marks(joy);
  return () => {
    markLayer?.stop();
    markLayer = null;
  };
}

function markArrive(joy: Joy): Stop {
  joy.onSeen('[data-b="mark"]', (el) => markLayer?.settle(el));
  return () => {};
}

// ----- which child runs what -----------------------------------------------------------------------

/** Every scripted child in the table, in the order they start. CSS alone runs the others. */
export const SCRIPTED: Partial<Record<BehaviourName, (joy: Joy) => Stop>> = {
  'surface.spotlight': spotlight,
  'surface.stick': stick,
  'action.sheen': sheen,
  'action.magnet': magnet,
  'box.spot': boxSpot,
  'box.tilt': tilt,
  'figure.bloom': bloom,
  'figure.lean': lean,
  'figure.parallax': parallax,
  'figure.link': link,
  'figure.field': cellField,
  'mark.open': markOpen,
  'mark.arrive': markArrive,
};

/** The reveals are one observer, so together they're one entry per child in REVEALS. */
export const REVEALED = Object.keys(REVEALS) as (keyof typeof REVEALS)[];

/** `?off=` strips the attribute, here and on anything added later. About five lines, as promised. */
function stripOff(onChange: Joy['onChange']) {
  const off = (document.documentElement.dataset.off ?? '').split(',').filter(Boolean);
  const strip = () => {
    for (const parent of off) {
      for (const el of document.querySelectorAll(`[data-b="${parent}"]`)) {
        el.removeAttribute('data-b');
      }
    }
  };
  strip();
  if (off.length > 0) onChange(strip);
}

function start(): Stop {
  const root = document.documentElement;
  const loop = frames();
  const pointer: Joy['pointer'] = { x: -1e5, y: -1e5, target: null };
  const hooks = new Map<string, (el: Element) => void>();
  const changes = new Set<() => void>();
  const scrolls = new Set<() => void>();
  const joy: Joy = {
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    fine: matchMedia('(hover: hover) and (pointer: fine)').matches,
    pointer,
    frame: loop.add,
    wake: loop.wake,
    onSeen: (selector, run) => {
      const before = hooks.get(selector);
      hooks.set(
        selector,
        before
          ? (el) => {
              before(el);
              run(el);
            }
          : run,
      );
    },
    onChange: (run) => changes.add(run),
    onScroll: (run) => scrolls.add(run),
  };

  stripOff(joy.onChange);
  root.style.removeProperty('visibility');
  if (root.getAttribute('style') === '') root.removeAttribute('style');
  root.dataset.joy = 'live';

  const moved = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.target = e.target as Element;
    loop.wake();
  };
  const left = () => {
    pointer.x = -1e5;
    pointer.y = -1e5;
    pointer.target = null;
    loop.wake();
  };
  const scrolled = () => {
    for (const run of scrolls) run();
  };
  const scrollEnded = () => {
    pointer.target = document.elementFromPoint(pointer.x, pointer.y);
    loop.wake();
  };
  addEventListener('pointermove', moved, { passive: true });
  document.documentElement.addEventListener('pointerleave', left);
  addEventListener('scroll', scrolled, { passive: true });
  addEventListener('resize', scrolled, { passive: true });
  addEventListener('scrollend', scrollEnded, { passive: true });

  let pending = 0;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      for (const run of changes) run();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const stops = Object.values(SCRIPTED).map((run) => run(joy));
  const stopReveals = startReveals(hooks, joy.onChange);
  loop.wake();

  return () => {
    observer.disconnect();
    cancelAnimationFrame(pending);
    removeEventListener('pointermove', moved);
    document.documentElement.removeEventListener('pointerleave', left);
    removeEventListener('scroll', scrolled);
    removeEventListener('resize', scrolled);
    removeEventListener('scrollend', scrollEnded);
    stopReveals();
    for (const stop of stops) stop();
    loop.stop();
    eraseWritten();
    delete root.dataset.joy;
  };
}

export function JoyLayer() {
  useEffect(() => {
    const root = document.documentElement;
    let stop: Stop | null = null;
    const sync = () => {
      const on = root.dataset.version !== '1';
      if (on && !stop) stop = start();
      if (!on && stop) {
        stop();
        stop = null;
      }
    };
    sync();
    const watch = new MutationObserver(sync);
    watch.observe(root, { attributes: true, attributeFilter: ['data-version'] });
    return () => {
      watch.disconnect();
      stop?.();
    };
  }, []);
  return null;
}

// What moves on a textured band: three children of `surface`, and nothing here answers the pointer (Elco:
// the colour behind the mouse "affects my capacity to judge things"). Elco: "All of them need to be softer
// and softly in motion", and nothing should catch the eye, so every cycle runs to minutes.
//
// surface.drift: the tile holds still and carries the detail, and a soft tone moves over it. Where it lays
// Ground the tile sinks, and where it lifts the tile comes forward, like the bands in Elco's Offset screen
// (Figma 33:648). It's soft enough to draw on a canvas of a few dozen cells a side and let the compositor
// stretch it, and slow enough to draw four times a second, off a plain timer, only while its band is on
// screen. With reduced motion it's drawn once and holds; without a canvas there's only the tile.
//
// surface.shimmer runs in the compositor, from the stylesheet. This only starts it while its band is on
// screen. surface.connect draws its line by a CSS animation too: this only says which stars, and when.
import { type Paint, primitives, type ToneName, v2 } from '@petal/tokens';

const D = v2.script.drift;
const C = v2.script.connect;
const TAU = Math.PI * 2;
const [WAVE_A, WAVE_B] = D.waves;

type Stop = () => void;

/** What it needs of JoyLayer. */
interface Host {
  reduced: boolean;
  onChange: (run: () => void) => void;
}

/**
 * The field at a point in a band, from 0 (`low`) to 1 (`high`): two long waves, each bent by a slower one.
 * Pure, so a test can hold it to being calm.
 */
export function toneAt(x: number, y: number, seconds: number, seed: number): number {
  const a = Math.sin(
    TAU * ((x * 0.8 - y * 0.6) / WAVE_A.length - seconds / WAVE_A.period) +
      seed +
      1.1 *
        Math.sin(
          TAU * ((x * 0.3 + y * 0.7) / (WAVE_A.length * 2.2) + seconds / (WAVE_A.period * 1.6)) +
            seed * 2,
        ),
  );
  const b = Math.sin(
    TAU * ((x * 0.35 + y * 0.94) / WAVE_B.length + seconds / WAVE_B.period) +
      seed * 3 +
      0.8 *
        Math.sin(
          TAU * ((x * 0.9 - y * 0.2) / (WAVE_B.length * 2) - seconds / (WAVE_B.period * 1.4)),
        ),
  );
  const v = 0.5 + 0.5 * (0.62 * a + 0.38 * b);
  return v * v * (3 - 2 * v);
}

/** A paint as canvas numbers: red, green and blue from 0 to 255, alpha too. */
export function channels(paint: Paint): [number, number, number, number] {
  const hex = primitives[typeof paint === 'string' ? paint : paint.of];
  const alpha = typeof paint === 'string' ? 1 : paint.alpha;
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
    alpha * 255,
  ];
}

interface Band {
  el: Element;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  image: ImageData | null;
  low: [number, number, number, number];
  high: [number, number, number, number];
  seed: number;
  width: number;
  height: number;
  visible: boolean;
}

function draw(band: Band, seconds: number) {
  const { image, width, height, low, high, seed } = band;
  if (!image) return;
  const { data, width: across, height: down } = image;
  let at = 0;
  for (let j = 0; j < down; j++) {
    const y = ((j + 0.5) / down) * height;
    for (let i = 0; i < across; i++) {
      const v = toneAt(((i + 0.5) / across) * width, y, seconds, seed);
      data[at++] = low[0] + (high[0] - low[0]) * v;
      data[at++] = low[1] + (high[1] - low[1]) * v;
      data[at++] = low[2] + (high[2] - low[2]) * v;
      data[at++] = low[3] + (high[3] - low[3]) * v;
    }
  }
  band.ctx.putImageData(image, 0, 0);
}

export function drift(host: Host): Stop {
  const bands = new Map<Element, Band>();
  let timer = 0;

  const tick = () => {
    if (document.hidden) return;
    const seconds = performance.now() / 1000;
    for (const band of bands.values()) if (band.visible) draw(band, seconds);
  };
  /** The timer only runs while a band is on screen. Off screen, nothing is drawn at all. */
  const pace = () => {
    const wanted = !host.reduced && [...bands.values()].some((band) => band.visible);
    if (wanted && !timer) timer = window.setInterval(tick, D.frameMs);
    if (!wanted && timer) {
      window.clearInterval(timer);
      timer = 0;
    }
  };
  /** Once, for a band that isn't going to move, and once to fill a new canvas before it fades in. */
  const still = (band: Band) => {
    draw(band, host.reduced ? 0 : performance.now() / 1000);
    band.canvas.setAttribute('data-on', '');
  };

  const sized = new ResizeObserver((entries) => {
    for (const { target: el, contentRect } of entries) {
      const band = bands.get(el);
      if (!band) continue;
      band.width = contentRect.width;
      band.height = contentRect.height;
      const across = Math.max(2, Math.ceil(band.width / D.cell) + 1);
      const down = Math.max(2, Math.ceil(band.height / D.cell) + 1);
      if (band.image?.width === across && band.image.height === down) continue;
      band.canvas.width = across;
      band.canvas.height = down;
      band.image = band.ctx.createImageData(across, down);
      if (host.reduced) still(band);
    }
  });
  const seen = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const band = bands.get(entry.target);
      if (!band) continue;
      band.visible = entry.isIntersecting;
      if (band.visible && !host.reduced && !band.canvas.hasAttribute('data-on')) still(band);
    }
    pace();
  });

  const scan = () => {
    for (const [el, band] of bands) {
      if (el.isConnected) continue;
      sized.unobserve(el);
      seen.unobserve(el);
      band.canvas.remove();
      bands.delete(el);
    }
    const found = document.querySelectorAll(
      ':is(section, footer)[data-b="surface"]:is([data-tone="paper"], [data-tone="mist"], [data-surface="mint"])',
    );
    for (const el of found) {
      if (bands.has(el)) continue;
      const canvas = document.createElement('canvas');
      // Written from JavaScript each time, so it stays out of the GPU's way and needs no readback.
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      canvas.setAttribute('data-drift', '');
      canvas.setAttribute('aria-hidden', 'true');
      el.prepend(canvas);
      const tone = el.getAttribute('data-tone') as Exclude<ToneName, 'stone'> | null;
      const wash = D.wash[tone ?? 'mint'];
      bands.set(el, {
        el,
        canvas,
        ctx,
        image: null,
        low: channels(wash.low),
        high: channels(wash.high),
        seed: bands.size * 1.3,
        width: 0,
        height: 0,
        visible: false,
      });
      sized.observe(el);
      seen.observe(el);
    }
    pace();
  };

  scan();
  host.onChange(scan);

  return () => {
    window.clearInterval(timer);
    sized.disconnect();
    seen.disconnect();
    for (const band of bands.values()) band.canvas.remove();
    bands.clear();
  };
}

/** Lets the stone band's static run while it's on screen. The compositor does the rest. */
export function shimmer(host: Host): Stop {
  if (host.reduced) return () => {};
  const seen = new IntersectionObserver((entries) => {
    for (const entry of entries) entry.target.toggleAttribute('data-near', entry.isIntersecting);
  });
  const scan = () => {
    for (const el of document.querySelectorAll('[data-b="surface"][data-tone="stone"]')) {
      seen.observe(el);
    }
  };
  scan();
  host.onChange(scan);
  return () => {
    seen.disconnect();
    for (const el of document.querySelectorAll('[data-near]')) el.removeAttribute('data-near');
  };
}

// ----- surface.connect -----------------------------------------------------------------------------

export interface Point {
  x: number;
  y: number;
}

export interface Keepout {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** How strongly the star mask shows at a place on a band: 0 to 1, the strongest of its ellipses. */
export function fadeAt(x: number, y: number, width: number, height: number): number {
  let most = 0;
  for (const e of C.fade) {
    const dx = (x / width - e.x) / e.across;
    const dy = (y / height - e.y) / e.down;
    most = Math.max(most, 1 - Math.hypot(dx, dy));
  }
  return most;
}

/** Every star on a band that can really be seen, in the band's own pixels. */
export function starsOn(width: number, height: number): Point[] {
  const out: Point[] = [];
  for (let row = 0; row * C.tile < height; row++) {
    for (let column = 0; column * C.tile < width; column++) {
      for (const [x, y] of C.stars) {
        const at = { x: x + column * C.tile, y: y + row * C.tile };
        if (at.x > width || at.y > height) continue;
        if (fadeAt(at.x, at.y, width, height) >= C.least) out.push(at);
      }
    }
  }
  return out;
}

/** Does a line between two points touch any of these, or come within `margin` of it? */
export function crosses(a: Point, b: Point, keepouts: readonly Keepout[], margin = 14): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6);
  for (let i = 0; i <= steps; i++) {
    const x = a.x + ((b.x - a.x) * i) / steps;
    const y = a.y + ((b.y - a.y) * i) / steps;
    for (const k of keepouts) {
      if (
        x > k.left - margin &&
        x < k.right + margin &&
        y > k.top - margin &&
        y < k.bottom + margin
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Two near stars whose line is clear of everything to keep out of, or none if there's no such pair. */
export function pick(
  stars: readonly Point[],
  keepouts: readonly Keepout[],
  random: () => number = Math.random,
): [Point, Point] | null {
  const pairs: [Point, Point][] = [];
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const a = stars[i] as Point;
      const b = stars[j] as Point;
      const apart = Math.hypot(b.x - a.x, b.y - a.y);
      if (apart < C.nearest || apart > C.farthest || crosses(a, b, keepouts)) continue;
      pairs.push([a, b]);
    }
  }
  return pairs[Math.floor(random() * pairs.length)] ?? null;
}

/** What a line mustn't cross, in a band's own pixels: boxes and controls whole, and text line by line. */
function keepoutsOf(band: Element, box: DOMRect): Keepout[] {
  const out: Keepout[] = [];
  const add = (r: DOMRect | DOMRectReadOnly) => {
    out.push({
      left: r.left - box.left,
      top: r.top - box.top,
      right: r.right - box.left,
      bottom: r.bottom - box.top,
    });
  };
  const whole = '[data-b="box"], [data-b="action"], [data-b="link"], [data-b="figure"]';
  for (const el of band.querySelectorAll(whole)) add(el.getBoundingClientRect());
  for (const el of band.querySelectorAll('h1, h2, h3, p')) {
    const range = document.createRange();
    range.selectNodeContents(el);
    for (const line of range.getClientRects()) add(line);
  }
  return out;
}

export function connect(host: Host): Stop {
  if (host.reduced) return () => {};
  const lines = new Map<Element, { line: HTMLElement; timer: number; near: boolean }>();

  const wait = (band: Element) => {
    const state = lines.get(band);
    if (!state?.near) return;
    window.clearTimeout(state.timer);
    const [least, most] = C.waitMs;
    state.timer = window.setTimeout(() => show(band), least + Math.random() * (most - least));
  };
  const show = (band: Element) => {
    const state = lines.get(band);
    if (!state?.near || document.hidden) return wait(band);
    const box = band.getBoundingClientRect();
    const pair = pick(starsOn(box.width, box.height), keepoutsOf(band, box));
    if (!pair) return wait(band);
    const [a, b] = pair;
    const { style } = state.line;
    style.setProperty('--b-x', `${a.x.toFixed(1)}px`);
    style.setProperty('--b-y', `${a.y.toFixed(1)}px`);
    style.setProperty('--b-long', `${Math.hypot(b.x - a.x, b.y - a.y).toFixed(1)}px`);
    style.setProperty('--b-turn', `${Math.atan2(b.y - a.y, b.x - a.x).toFixed(4)}rad`);
    state.line.setAttribute('data-on', '');
  };

  const seen = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const state = lines.get(entry.target);
      if (!state) continue;
      state.near = entry.isIntersecting;
      if (state.near) wait(entry.target);
      else window.clearTimeout(state.timer);
    }
  });
  const scan = () => {
    for (const band of document.querySelectorAll('[data-b="surface"][data-tone="paper"]')) {
      if (lines.has(band)) continue;
      const line = document.createElement('span');
      line.setAttribute('data-connect', '');
      line.setAttribute('aria-hidden', 'true');
      line.addEventListener('animationend', () => {
        line.removeAttribute('data-on');
        wait(band);
      });
      band.append(line);
      lines.set(band, { line, timer: 0, near: false });
      seen.observe(band);
    }
  };
  scan();
  host.onChange(scan);

  return () => {
    seen.disconnect();
    for (const { line, timer } of lines.values()) {
      window.clearTimeout(timer);
      line.remove();
    }
    lines.clear();
  };
}

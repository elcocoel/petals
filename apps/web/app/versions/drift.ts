// surface.drift: the part of a textured band that moves. The tile under it holds still and carries the
// detail; this is a soft tone over it, slow, leaning a little to the pointer and lagging behind the scroll.
// Where it lays Ground the tile sinks, and where it lifts the tile comes forward, which reads as the bands
// in Elco's Offset screen (Figma 33:648). It's soft enough to draw on a canvas of a few dozen cells a side
// and let the compositor stretch it, so it costs under a millisecond and needs no GPU. With reduced motion
// it's drawn once and holds; without a canvas there's only the tile.
import { type Paint, primitives, type ToneName, v2 } from '@petal/tokens';

const D = v2.script.drift;
const TAU = Math.PI * 2;
const [WAVE_A, WAVE_B] = D.waves;

type Stop = () => void;

/** What it needs of JoyLayer. */
interface Host {
  reduced: boolean;
  pointer: { x: number; y: number };
  onChange: (run: () => void) => void;
  onScroll: (run: () => void) => void;
}

/**
 * The field at a point in a band, from 0 (`low`) to 1 (`high`): two long waves, each bent by a slower one.
 * `near` is how close the pointer is, from 0 to 1. Pure, so a test can hold it to being calm.
 */
export function toneAt(x: number, y: number, seconds: number, seed: number, near = 0): number {
  const a = Math.sin(
    TAU * ((x * 0.8 - y * 0.6) / WAVE_A.length - seconds / WAVE_A.period) +
      seed +
      near * D.bend +
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
  const eased = v * v * (3 - 2 * v);
  return eased + (1 - eased) * near * D.raise;
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
  /** The pointer's place in the band, eased, and how present it is. */
  leanX: number;
  leanY: number;
  lean: number;
}

/** Eases `from` toward `to` over a time constant, whatever the frame rate. */
const ease = (from: number, to: number, ms: number, constant: number) =>
  from + (to - from) * (1 - Math.exp(-ms / constant));

function draw(band: Band, seconds: number, scrolled: number) {
  const { image, width, height, low, high, seed, leanX, leanY, lean } = band;
  if (!image) return;
  const { data, width: across, height: down } = image;
  const reach = D.reach * D.reach;
  const shift = scrolled * D.parallax;
  let at = 0;
  for (let j = 0; j < down; j++) {
    const y = ((j + 0.5) / down) * height;
    for (let i = 0; i < across; i++) {
      const x = ((i + 0.5) / across) * width;
      const near =
        lean > 0.002 ? lean * Math.exp(-((x - leanX) ** 2 + (y - leanY) ** 2) / reach) : 0;
      const v = toneAt(x, y - shift, seconds, seed, near);
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
  let raf = 0;
  let last = 0;
  let scrolled = window.scrollY;
  let target = scrolled;

  const tick = (now: number) => {
    raf = 0;
    const ms = Math.min(now - last, 200);
    if (ms >= D.frameMs) {
      last = now;
      scrolled = ease(scrolled, target, ms, D.scrollMs);
      for (const band of bands.values()) {
        if (!band.visible) continue;
        const box = band.el.getBoundingClientRect();
        const x = host.pointer.x - box.left;
        const y = host.pointer.y - box.top;
        const over = x >= 0 && y >= 0 && x <= box.width && y <= box.height;
        if (over) {
          // Arriving, it starts where the pointer came in, rather than sliding over from a corner.
          const arriving = band.lean < 0.01;
          band.leanX = arriving ? x : ease(band.leanX, x, ms, D.leanMs);
          band.leanY = arriving ? y : ease(band.leanY, y, ms, D.leanMs);
        }
        band.lean = ease(band.lean, over ? 1 : 0, ms, D.leanMs);
        draw(band, now / 1000, scrolled);
      }
    }
    for (const band of bands.values()) {
      if (band.visible) {
        raf = requestAnimationFrame(tick);
        break;
      }
    }
  };
  const wake = () => {
    if (!raf && !host.reduced) raf = requestAnimationFrame(tick);
  };

  /** Drawn once, for a band that isn't going to move, and once to fill a new canvas before it fades in. */
  const still = (band: Band) => {
    draw(band, host.reduced ? 0 : performance.now() / 1000, scrolled);
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
      if (band.visible && !host.reduced && !band.canvas.hasAttribute('data-on')) {
        still(band);
      }
    }
    wake();
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
      ':is(section, footer)[data-b="surface"]:is([data-tone], [data-surface="mint"])',
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
      const wash = D.wash[(el.getAttribute('data-tone') ?? 'mint') as ToneName | 'mint'];
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
        leanX: 0,
        leanY: 0,
        lean: 0,
      });
      sized.observe(el);
      seen.observe(el);
    }
  };

  scan();
  host.onChange(scan);
  host.onScroll(() => {
    target = window.scrollY;
  });

  return () => {
    cancelAnimationFrame(raf);
    sized.disconnect();
    seen.disconnect();
    for (const band of bands.values()) band.canvas.remove();
    bands.clear();
  };
}

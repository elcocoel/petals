// Springs, solved exactly rather than stepped, so a frame of 8 ms and a frame of 16 ms land on the
// same curve: two steps of dt are one step of 2dt, to the last digit. That is what makes the motion
// right at 60 and at 120 Hz. A spring holds position, velocity and target and nothing else, so a new
// target retargets from wherever it is, at whatever speed it has: no queue, no jump.

/** In SwiftUI's terms: `response` is the period in seconds, `damping` 1 means no overshoot. */
export interface SpringSpec {
  response: number;
  damping: number;
}

/** One step's coefficients: x' = t + a(x - t) + bv, v' = c(x - t) + dv. */
export interface Step {
  a: number;
  b: number;
  c: number;
  d: number;
}

/** prefers-reduced-motion: every spring lands on its target in one step. */
export const SNAP: Step = { a: 0, b: 0, c: 0, d: 0 };

export function stepOf(spec: SpringSpec, dt: number): Step {
  const omega = (2 * Math.PI) / spec.response;
  const zeta = spec.damping;
  if (zeta >= 1) {
    const e = Math.exp(-omega * dt);
    return {
      a: e * (1 + omega * dt),
      b: e * dt,
      c: -e * omega * omega * dt,
      d: e * (1 - omega * dt),
    };
  }
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  const e = Math.exp(-zeta * omega * dt);
  const s = Math.sin(wd * dt);
  const k = Math.cos(wd * dt);
  const r = (zeta * omega) / wd;
  return {
    a: e * (k + r * s),
    b: (e * s) / wd,
    c: (-e * s * omega * omega) / wd,
    d: e * (k - r * s),
  };
}

export interface Spring {
  x: number;
  v: number;
  t: number;
}

export const spring = (x = 0): Spring => ({ x, v: 0, t: x });

const REST_X = 1e-3;
const REST_V = 1e-2;

/** Steps one spring. True if it moved: the frame it lands on counts, so that frame gets drawn. */
export function advance(s: Spring, c: Step): boolean {
  const e = s.x - s.t;
  const v = s.v;
  if (e === 0 && v === 0) return false;
  s.x = s.t + c.a * e + c.b * v;
  s.v = c.c * e + c.d * v;
  if (Math.abs(s.x - s.t) < REST_X && Math.abs(s.v) < REST_V) {
    s.x = s.t;
    s.v = 0;
  }
  return true;
}

/** A spring per petal, in arrays, because a flower can have hundreds. */
export interface Channel {
  x: Float64Array;
  v: Float64Array;
  t: Float64Array;
}

export const channel = (n: number, x = 0): Channel => ({
  x: new Float64Array(n).fill(x),
  v: new Float64Array(n),
  t: new Float64Array(n).fill(x),
});

/** Steps a whole channel. True if any of it moved. */
export function advanceAll(ch: Channel, c: Step): boolean {
  const { x, v, t } = ch;
  let moved = false;
  for (let i = 0; i < x.length; i++) {
    const e = (x[i] as number) - (t[i] as number);
    const vi = v[i] as number;
    if (e === 0 && vi === 0) continue;
    moved = true;
    const nx = (t[i] as number) + c.a * e + c.b * vi;
    const nv = c.c * e + c.d * vi;
    if (Math.abs(nx - (t[i] as number)) < REST_X && Math.abs(nv) < REST_V) {
      x[i] = t[i] as number;
      v[i] = 0;
    } else {
      x[i] = nx;
      v[i] = nv;
    }
  }
  return moved;
}

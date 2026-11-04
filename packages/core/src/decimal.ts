// Exact decimal arithmetic on BigInt (research R6). Amounts are decimal strings; sums are exact;
// shares are numbers rounded to 6 decimals. No floating point touches a sum.

/** A fixed-point number: value / 10^scale. */
export interface Fixed {
  v: bigint;
  s: number;
}

const DECIMAL = /^(-?)([0-9]+)(?:\.([0-9]+))?$/;

export function parseDecimal(text: string): Fixed {
  const m = DECIMAL.exec(text);
  if (!m) throw new TypeError(`not a decimal string: ${text}`);
  const frac = m[3] ?? '';
  const v = BigInt(`${m[2]}${frac}`);
  return { v: m[1] === '-' ? -v : v, s: frac.length };
}

const TEN = 10n;
export const pow10 = (n: number): bigint => TEN ** BigInt(n);

/** Same value at a larger scale. */
export function rescale(x: Fixed, s: number): bigint {
  if (s < x.s) throw new RangeError('rescale: would lose digits');
  return x.v * pow10(s - x.s);
}

/** Decimal string with no trailing zeros ("3000", "1000.5", "0.000003"). */
export function formatDecimal(v: bigint, s: number): string {
  const neg = v < 0n;
  const digits = (neg ? -v : v).toString().padStart(s + 1, '0');
  const int = digits.slice(0, digits.length - s);
  const frac = digits.slice(digits.length - s).replace(/0+$/, '');
  return `${neg ? '-' : ''}${int}${frac ? `.${frac}` : ''}`;
}

/** num / den rounded half up to 6 decimals, as a number. den must be positive, num >= 0. */
export function ratio6(num: bigint, den: bigint): number {
  if (den <= 0n) return 0;
  const q = (num * 2_000_000n + den) / (2n * den);
  return Number(q) / 1e6;
}

/** A float rounded half up to 6 decimals (for values that are not sums: heights, thresholds). */
export function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

/**
 * The scale of base units for a set of rows, inferred from the first row whose `amount_raw` is
 * exactly `amount` times a power of ten (NEAR: 24). null when no row tells.
 */
export function inferRawScale(rows: { amount?: string; amount_raw?: string }[]): number | null {
  for (const r of rows) {
    if (r.amount === undefined || r.amount_raw === undefined) continue;
    const a = parseDecimal(r.amount);
    const raw = BigInt(r.amount_raw);
    if (a.v <= 0n || raw <= 0n) continue;
    let x = a.v;
    let k = 0;
    while (x < raw && k < 60) {
      x *= TEN;
      k++;
    }
    if (x === raw) return a.s + k;
  }
  return null;
}

/**
 * Exact values for rows with `amount` and optional `amount_raw`, all at one scale. BigInt sums run
 * on `amount_raw` where the rows carry it and its scale is known, on `amount` otherwise.
 */
export function exactValues(rows: { amount?: string; amount_raw?: string }[]): {
  values: bigint[];
  scale: number;
} {
  const rawScale = inferRawScale(rows);
  const fixed = rows.map((r): Fixed => {
    if (rawScale !== null && r.amount_raw !== undefined)
      return { v: BigInt(r.amount_raw), s: rawScale };
    return r.amount === undefined ? { v: 0n, s: 0 } : parseDecimal(r.amount);
  });
  const scale = fixed.reduce((m, f) => Math.max(m, f.s), 0);
  return { values: fixed.map((f) => rescale(f, scale)), scale };
}

/** Deterministic string order (UTF-16 code units, like RFC 8785); never locale-dependent. */
export function byString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

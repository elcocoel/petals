// Instants without the clock (purity.test.ts forbids it in core): pure arithmetic on milliseconds since 1970, UTC.

/** An instant (ms since 1970, UTC) as ISO text, without the clock: days to a civil date (Hinnant's algorithm). */
export function isoOf(ms: number): string {
  const days = Math.floor(ms / 86_400_000);
  const rest = ms - days * 86_400_000;
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  const two = (n: number, w = 2) => String(n).padStart(w, '0');
  const time = [
    Math.floor(rest / 3_600_000),
    Math.floor(rest / 60_000) % 60,
    Math.floor(rest / 1000) % 60,
  ];
  return `${two(y, 4)}-${two(m)}-${two(d)}T${time.map((n) => two(n)).join(':')}.${two(rest % 1000, 3)}Z`;
}

/** A whole number with a comma every three digits, as people read a block: 465,695,924. */
export const grouped = (n: number): string =>
  String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

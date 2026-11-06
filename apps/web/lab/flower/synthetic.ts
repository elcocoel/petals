// Made-up flowers of 200 and 500 petals, only to measure frames at sizes no golden has. Their names
// say what they are. Shaped like a real reading: a long tail of shares, widths in a 2x band on a log
// scale, heights by square root, some bars cut in bands.
import type { ReadingPetal } from '@petal/core/types';
import type { FlowerReading } from '../../flower/model.ts';

export function syntheticReading(n: number): FlowerReading {
  const raw = Array.from({ length: n - 1 }, (_, i) => 1 / (i + 3) ** 1.1);
  const tailRaw = raw.reduce((t, x) => t + x, 0) * 0.08;
  const sum = raw.reduce((t, x) => t + x, 0) + tailRaw;
  const hi = (raw[0] as number) / sum;
  const lo = (raw[raw.length - 1] as number) / sum;
  const widthOf = (s: number) => 1 + Math.log(s / lo) / Math.log(hi / lo);
  const petals: ReadingPetal[] = raw.map((x, i) => {
    const share = x / sum;
    return {
      index: i,
      id: `synthetic-${i + 1}`,
      label: `synthetic-${i + 1}`,
      kind: 'unknown',
      identity: null,
      amount: `${Math.round(share * 1e9)}`,
      share,
      rank: i + 1,
      name: `synthetic-${i + 1}`,
      width: widthOf(share),
      height: Math.max(0.03, Math.sqrt(share / hi)),
      colour: 'unknown',
      outline: null,
      segments:
        i % 3 === 0
          ? [
              { key: 'a', label: 'band a', amount: '1', frac: 0.5 },
              { key: 'b', label: 'band b', amount: '1', frac: 0.3 },
              { key: 'c', label: 'band c', amount: '1', frac: 0.2 },
            ]
          : [],
    };
  });
  const tailShare = tailRaw / sum;
  petals.push({
    index: n - 1,
    id: '__tail',
    label: 'everyone else',
    kind: 'group',
    identity: null,
    amount: `${Math.round(tailShare * 1e9)}`,
    share: tailShare,
    rank: n,
    tail: true,
    count: 400,
    name: 'everyone else',
    width: 2,
    height: 0.08,
    colour: 'tail',
    outline: null,
    segments: [],
  });
  return { title: `synthetic, ${n} petals`, petals };
}

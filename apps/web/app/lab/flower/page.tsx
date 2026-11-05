// The flower bench (design/flower-language.md): one real flower, filling the window, no site around it.
// Chosen with the URL: ?flower=, ?hover=dock|lift, ?relations=1. In production it stays hidden unless
// PETAL_LAB=1, like the lab, and it's read on each request so a build doesn't freeze the choice.
import { notFound } from 'next/navigation';
import { FlowerBench } from '../../../lab/flower/FlowerBench.tsx';
import type { HoverWay } from '../../../lab/flower/hover.ts';
import { DEFAULT_FLOWER, readingOf } from '../../../lab/flower/readings.ts';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Flower · Lab · Petals',
  robots: { index: false },
  // The site has no favicon yet, and the bench's console should stay empty.
  icons: { icon: 'data:,' },
};

type Query = Record<string, string | string[] | undefined>;

export default async function FlowerLab({ searchParams }: { searchParams: Promise<Query> }) {
  if (process.env.NODE_ENV === 'production' && process.env.PETAL_LAB !== '1') notFound();
  const q = await searchParams;
  const name = typeof q.flower === 'string' ? q.flower : DEFAULT_FLOWER;
  const reading = await readingOf(name);
  if (!reading) notFound();
  const hover: HoverWay = q.hover === 'lift' ? 'lift' : 'dock';
  return (
    <FlowerBench
      key={name}
      reading={reading}
      hover={hover}
      relations={q.relations === '1'}
      probe={q.probe === '1'}
    />
  );
}

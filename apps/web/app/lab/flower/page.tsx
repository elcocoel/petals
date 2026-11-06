// The flower bench (design/flower-language.md): one real flower, filling the window, no site around it.
// Chosen with the URL: ?flower=, ?hover=dock|lift, ?relations=1, ?order=scatter. In production it stays hidden unless
// PETAL_LAB=1, like the lab, and it's read on each request so a build doesn't freeze the choice.
import { notFound } from 'next/navigation';
import { FlowerCanvas } from '../../../flower/FlowerCanvas.tsx';
import { benchChoice } from '../../../lab/flower/readings.ts';

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
  const bench = await benchChoice(await searchParams);
  if (!bench) notFound();
  return (
    <FlowerCanvas
      key={bench.name}
      reading={bench.reading}
      hover={bench.hover}
      relations={bench.relations}
      scatter={bench.scatter}
      probe={bench.probe}
      readout
    />
  );
}

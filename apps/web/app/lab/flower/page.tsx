// The flower bench (design/flower-language.md): one real flower, filling the window, no site around it.
// Chosen with the URL: ?flower=, ?hover=dock|lift, ?relations=1, ?order=scatter, ?outline=<data> (the
// outline bound to a piece of data, with its key; annotation-layer.md step 7) and ?names=sample (made-up
// names on a flower read from a snapshot, with labels on them). In production it stays hidden unless
// PETAL_LAB=1, like the lab, and it's read on each request so a build doesn't freeze the choice.
import { notFound } from 'next/navigation';
import { FlowerCanvas } from '../../../flower/FlowerCanvas.tsx';
import { OutlineKey } from '../../../lab/flower/OutlineKey.tsx';
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
  const query = await searchParams;
  const bench = await benchChoice(query);
  if (!bench) notFound();
  const { outline } = bench;
  /** This bench's address, with the outline on another piece of data, or none. */
  const hrefFor = (data: string | null) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (typeof v === 'string') q.set(k, v);
    q.set('outline', data ?? 'none');
    return `/lab/flower?${q}`;
  };
  return (
    <>
      <FlowerCanvas
        key={`${bench.name} ${outline?.shows ?? ''} ${bench.names}`}
        reading={bench.reading}
        hover={bench.hover}
        relations={bench.relations}
        outlines={outline?.byId ?? null}
        scatter={bench.scatter}
        probe={bench.probe}
        readout
      />
      {outline && (
        <OutlineKey
          shows={outline.shows}
          choices={outline.choices}
          keys={outline.keys}
          unlined={outline.unlined}
          hrefFor={hrefFor}
        />
      )}
    </>
  );
}

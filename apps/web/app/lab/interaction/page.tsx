// The interaction page, blocked in: the flower is the page, and the conversation floats over it. Hidden
// in production unless PETAL_LAB=1, like the lab. Besides the bench's own ?flower=, ?hover=, ?relations=1
// and ?order=scatter, there's ?box=ink, the boxes in their dark glass. ?run= and the rest of the address
// work as on /make, whose ?flower=<n> is a number where the bench's ?flower=<name> is a name.
import { notFound } from 'next/navigation';
import { benchChoice } from '../../../lab/flower/readings.ts';
import { InteractionSurface } from '../../../lab/interaction/InteractionSurface.tsx';
import { workspaceHome } from '../../../lib/workspace-home.ts';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Interaction · Lab · Petals',
  robots: { index: false },
  // The site has no favicon yet, and the bench's console should stay empty.
  icons: { icon: 'data:,' },
};

type Query = Record<string, string | string[] | undefined>;

const PATH = '/lab/interaction';
const OWN_OPTIONS = ['box', 'hover', 'relations', 'order', 'probe'];
const IS_THREADS_FLOWER = /^\d+$/;

export default async function InteractionLab({ searchParams }: { searchParams: Promise<Query> }) {
  if (process.env.NODE_ENV === 'production' && process.env.PETAL_LAB !== '1') notFound();
  const q = await searchParams;
  const flowers = [q.flower].flat().filter((f) => f !== undefined);
  const name = flowers.find((f) => !IS_THREADS_FLOWER.test(f));
  const threads = flowers.find((f) => IS_THREADS_FLOWER.test(f));
  const bench = await benchChoice({ ...q, flower: name });
  if (!bench) notFound();
  // A turn rewrites the address, so this page's own options go along with it.
  const options = new URLSearchParams();
  if (name) options.set('flower', name);
  for (const key of OWN_OPTIONS) {
    const value = q[key];
    if (typeof value === 'string') options.set(key, value);
  }
  const own = options.toString();
  return (
    <InteractionSurface
      {...(await workspaceHome({ ...q, flower: threads }))}
      standIn={bench.reading}
      standInName={bench.name}
      hover={bench.hover}
      relations={bench.relations}
      scatter={bench.scatter}
      probe={bench.probe}
      surface={q.box === 'ink' ? 'ink' : 'ground'}
      base={own ? `${PATH}?${own}` : PATH}
    />
  );
}

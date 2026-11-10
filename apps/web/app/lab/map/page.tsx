// The map bench (specs/006-the-map, milestone 2): every drawing on the map in one space, on their chains'
// continents, joined by the accounts they share, zooming without a break into one flower and one account.
// The Power Map (/map) is the same canvas with one flower per map. Real data only, in the person's view. In
// production it stays hidden unless PETAL_LAB=1, like the lab and the flower bench.
import { notFound } from 'next/navigation';
import { LandscapeCanvas } from '../../../landscape/LandscapeCanvas.tsx';
import { benchLandscape } from '../../../landscape/land.ts';
import { viewerView } from '../../../lib/viewer-view.ts';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Map · Lab · Petals',
  robots: { index: false },
  icons: { icon: 'data:,' },
};

type Query = Record<string, string | string[] | undefined>;

export default async function MapLab({ searchParams }: { searchParams: Promise<Query> }) {
  if (process.env.NODE_ENV === 'production' && process.env.PETAL_LAB !== '1') notFound();
  const q = await searchParams;
  const data = await benchLandscape((await viewerView()).hash);
  if ('error' in data) return <p className="error">The map couldn't be read: {data.error}</p>;
  return <LandscapeCanvas data={data} probe={q.probe === '1'} />;
}

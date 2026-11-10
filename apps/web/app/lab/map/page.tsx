// The map bench (specs/006-the-map, milestone 2): the night's flowers in one space, on their chains'
// continents, joined by the accounts they share, zooming without a break into one flower and one account.
// Real data only. In production it stays hidden unless PETAL_LAB=1, like the lab and the flower bench.
import { notFound } from 'next/navigation';
import { benchLandscape } from '../../../lab/map/landscape.ts';
import { LandscapeCanvas } from '../../../landscape/LandscapeCanvas.tsx';

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
  const data = await benchLandscape();
  if ('error' in data) return <p className="error">The map couldn't be read: {data.error}</p>;
  return <LandscapeCanvas data={data} probe={q.probe === '1'} />;
}

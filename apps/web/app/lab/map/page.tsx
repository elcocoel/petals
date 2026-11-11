// The map bench (specs/006-the-map, milestone 2): every drawing on the map in one space, on their chains'
// continents, joined by the accounts they share, zooming without a break into one flower and one account.
// The Power Map (/map) is the same canvas with one flower per map. Real data only, in the person's view. In
// production it stays hidden unless PETAL_LAB=1, like the lab and the flower bench. ?far=wave draws far flowers
// as the far wave (#84): one soft ring each, its mark in the middle and its name close under it, named and marked
// by its map's own mark (#85). The chain list and the legend are overlays (#95, #92), as the everything map
// will have them once Elco has seen them here.
import { notFound } from 'next/navigation';
import { LandscapeCanvas } from '../../../landscape/LandscapeCanvas.tsx';
import { benchLandscape, withMarks } from '../../../landscape/land.ts';
import { mapList, mapsKeys } from '../../../lib/maps.ts';
import { viewerView } from '../../../lib/viewer-view.ts';
import { BenchLegend } from './BenchLegend.tsx';

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
  const { view, hash } = await viewerView();
  const read = await benchLandscape(hash);
  if ('error' in read) return <p className="error">The map couldn't be read: {read.error}</p>;
  const far = q.far === 'wave' ? 'wave' : null;
  // the maps' cards: the legend's keys, and with the far wave each flower named and marked by its map's own
  // mark (#85, #84)
  const cards = await mapList(hash);
  const data =
    far && cards.ok ? withMarks(read, new Map(cards.value.maps.map((c) => [c.id, c.mark]))) : read;
  // the everything map (Elco, 11 Nov): with the far wave, the lines lean too (#87)
  return (
    <>
      <LandscapeCanvas data={data} probe={q.probe === '1'} far={far} lines={far ? 'focus' : null} />
      <BenchLegend view={view} keys={cards.ok ? mapsKeys(cards.value.maps) : []} />
    </>
  );
}

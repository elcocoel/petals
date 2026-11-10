// The Power Map (coordinator/one-source.md, step 5): the continuous map, one flower per map (an address with
// all its readings), on their chains' continents, joined by the accounts they share, drawn in the person's
// view, zooming without a break into a flower and its petals. Public, no account needed. The grid of the same
// maps is the Gallery (/gallery).
import { ReadingColumn } from '../../../components/SiteChrome.tsx';
import { LandscapeCanvas } from '../../../landscape/LandscapeCanvas.tsx';
import { powerMapLandscape } from '../../../landscape/land.ts';
import { viewerView } from '../../../lib/viewer-view.ts';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Power Map · Petals' };

export default async function PowerMap() {
  const data = await powerMapLandscape((await viewerView()).hash);
  if ('error' in data) {
    return (
      <ReadingColumn>
        <h1>Power Map</h1>
        <p className="error">The map couldn't be read: {data.error}</p>
      </ReadingColumn>
    );
  }
  if (data.flowers.length === 0) {
    return (
      <ReadingColumn>
        <h1>Power Map</h1>
        <p>No maps yet.</p>
      </ReadingColumn>
    );
  }
  return <LandscapeCanvas data={data} fill="area" title="Power Map" />;
}

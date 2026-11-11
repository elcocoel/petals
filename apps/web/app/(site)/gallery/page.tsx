// The Gallery (T063): one card per map, an address with every reading of it together (Elco,
// 10 Nov: one map per address; SYSTEMS's GET /api/v1/maps). Each card is its newest drawing's picture, drawn
// by the server in the person's view (lib/viewer-view.ts), and opens the map's page. No sign-in.

import { LegendKeys } from '../../../components/Legend.tsx';
import { MapList } from '../../../components/MapList.tsx';
import { mapList, mapsKeys, mapTile } from '../../../lib/maps.ts';
import { viewerView } from '../../../lib/viewer-view.ts';

export const dynamic = 'force-dynamic';

export default async function Gallery() {
  const res = await mapList((await viewerView()).hash);
  return (
    <>
      {/* One name per thing (one-source.md, step 5): the continuous map is the Power Map, this grid of its
          maps is the Gallery. */}
      <h1>Gallery</h1>
      <p>
        Flowers show who holds power in a network. Open one to read it; no account needed.{' '}
        <a href="/make">Talk to the agent</a>.
      </p>
      {!res.ok ? (
        <p className="error">
          Could not list the maps: {res.error.code}: {res.error.message}
        </p>
      ) : res.value.maps.length === 0 ? (
        <p>No maps yet.</p>
      ) : (
        <>
          <div className="mb-block-gap">
            <LegendKeys keys={mapsKeys(res.value.maps)} />
          </div>
          <MapList
            label="Gallery"
            rows={res.value.maps.map((m) => ({ key: m.id, ...mapTile(m) }))}
          />
        </>
      )}
    </>
  );
}

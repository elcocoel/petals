// The Power Map (T063, the gallery): one card per map, an address with every reading of it together (Elco,
// 10 Nov: one map per address; SYSTEMS's GET /api/v1/maps). Each card is its newest drawing's picture, drawn
// by the server in the person's view (lib/viewer-view.ts), and opens the map's page. No sign-in.
import { FlowerTile } from '../../../components/FlowerTile.tsx';
import { LegendKeys } from '../../../components/Legend.tsx';
import { mapList, mapsKeys, mapTile } from '../../../lib/maps.ts';
import { viewerView } from '../../../lib/viewer-view.ts';

export const dynamic = 'force-dynamic';

export default async function Gallery() {
  const res = await mapList((await viewerView()).hash);
  return (
    <>
      {/* Named as the navbar and the landing name it (Elco, 10 Nov, fix 4). */}
      <h1>Power Map</h1>
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
          <ul className="gallery">
            {res.value.maps.map((m) => (
              <li key={m.id}>
                <FlowerTile {...mapTile(m)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

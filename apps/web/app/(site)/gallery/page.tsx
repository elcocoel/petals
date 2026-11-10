// The gallery (T063): the one shared map, every view on it (SYSTEMS's GET /api/v1/map/views; Elco, 10 Nov,
// fix 2: the gallery reads the map, not the old published list). Each tile is the view's own picture, drawn
// by the server in the default view, and opens the view. No sign-in.
import { FlowerTile } from '../../../components/FlowerTile.tsx';
import { LegendKeys } from '../../../components/Legend.tsx';
import { listKeys, mapViewList, viewTile } from '../../../lib/map-views.ts';

export const dynamic = 'force-dynamic';

export default async function Gallery() {
  const res = await mapViewList();
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
          Could not list flowers: {res.error.code}: {res.error.message}
        </p>
      ) : res.value.views.length === 0 ? (
        <p>No flowers yet.</p>
      ) : (
        <>
          <div className="mb-block-gap">
            <LegendKeys keys={listKeys(res.value.views)} />
          </div>
          <ul className="gallery">
            {res.value.views.map((v) => (
              <li key={v.sha}>
                <FlowerTile {...viewTile(v)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

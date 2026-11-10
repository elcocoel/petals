// The gallery (T063): the one shared map, every view on it (SYSTEMS's GET /api/v1/map/views; Elco, 10 Nov,
// fix 2: the gallery reads the map, not the old published list). Each tile is the view's own picture, drawn
// by the server in the default view, and opens the view. No sign-in.
import { FlowerTile } from '../../../components/FlowerTile.tsx';
import { mapViewList, viewTile } from '../../../lib/map-views.ts';

export const dynamic = 'force-dynamic';

export default async function Gallery() {
  const res = await mapViewList();
  return (
    <>
      <h1>Gallery</h1>
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
        <ul className="gallery">
          {res.value.views.map((v) => (
            <li key={v.sha}>
              <FlowerTile {...viewTile(v)} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

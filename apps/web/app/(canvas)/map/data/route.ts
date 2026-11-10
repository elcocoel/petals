// The Power Map's data, for a page that draws the map inside itself and loads it only once it's reached:
// the landing's map (components/landing/LandingMap.tsx). The same as /map draws, in the person's view.
// /map carries it in its HTML, which is megabytes; the landing stays light until someone scrolls to it.
import { powerMapLandscape } from '../../../../landscape/land.ts';
import { viewerView } from '../../../../lib/viewer-view.ts';

export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await powerMapLandscape((await viewerView()).hash);
  return Response.json(data, { status: 'error' in data ? 502 : 200 });
}

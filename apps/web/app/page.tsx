// The landing page. It draws the Power Map's real readings in the person's view (lib/viewer-view.ts), the
// list read once an hour at most for each view (lib/power-map.ts), and hands them to the sections. The
// conversation is at /make.
import { Landing } from '../components/landing/Landing.tsx';
import { powerMapTiles } from '../lib/power-map.ts';
import { viewerView } from '../lib/viewer-view.ts';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const person = await viewerView();
  return <Landing tiles={await powerMapTiles(person.hash)} view={person.view} />;
}

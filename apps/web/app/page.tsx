// The landing page. It draws the Power Map's real readings once an hour at most (lib/power-map.ts) and
// hands them to the sections. The conversation is at /make.
import { Landing } from '../components/landing/Landing.tsx';
import { powerMapTiles } from '../lib/power-map.ts';

export const revalidate = 3600;

export default async function Page() {
  return <Landing tiles={await powerMapTiles()} />;
}

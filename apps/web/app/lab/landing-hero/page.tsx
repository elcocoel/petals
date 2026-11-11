// The new hero's lean (LANDING, 11 Nov), in the whole landing so it's seen in place: MapHero where the hero
// was, and the map section gone, since the map is now on top. Make Petals stronger has its three ways in
// columns, LANDING's lean for its empty half. In production it stays hidden unless
// PETAL_LAB=1, like the lab, and nothing here reaches the landing until Elco has seen it.
import { notFound } from 'next/navigation';
import { BackIt } from '../../../components/landing/BackIt.tsx';
import { BuildWithUs } from '../../../components/landing/BuildWithUs.tsx';
import { FrontDoor } from '../../../components/landing/FrontDoor.tsx';
import { GiveToAgent } from '../../../components/landing/GiveToAgent.tsx';
import { HowItWorks } from '../../../components/landing/HowItWorks.tsx';
import { LiveReading } from '../../../components/landing/LiveReading.tsx';
import { MapHero } from '../../../components/landing/MapHero.tsx';
import { Questions } from '../../../components/landing/Questions.tsx';
import { Footer } from '../../../components/ui/Footer.tsx';
import { Nav } from '../../../components/ui/Nav.tsx';
import { powerMapTiles } from '../../../lib/power-map.ts';
import { viewerView } from '../../../lib/viewer-view.ts';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'New hero · Lab · Petals',
  robots: { index: false },
  icons: { icon: 'data:,' },
};

export default async function HeroLab() {
  if (process.env.NODE_ENV === 'production' && process.env.PETAL_LAB !== '1') notFound();
  const person = await viewerView();
  const tiles = await powerMapTiles(person.hash);
  return (
    <>
      <Nav />
      <main>
        <MapHero tiles={tiles} />
        <LiveReading view={person.view} />
        <HowItWorks />
        <GiveToAgent />
        <Questions />
        <BackIt layout="columns" />
        <BuildWithUs />
      </main>
      <Footer />
      <FrontDoor />
    </>
  );
}

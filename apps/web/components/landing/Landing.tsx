// The landing's sections in the order of the copy doc (T185, Figma frame 66:2180). It only assembles;
// app/page.tsx hands it the Power Map's drawn readings.

import type { PowerMapTile } from '../../lib/power-map.ts';
import { Footer } from '../ui/Footer.tsx';
import { Nav } from '../ui/Nav.tsx';
import { BackIt } from './BackIt.tsx';
import { BuildWithUs } from './BuildWithUs.tsx';
import { FrontDoor } from './FrontDoor.tsx';
import { GallerySection } from './GallerySection.tsx';
import { Hero } from './Hero.tsx';
import { HowItWorks } from './HowItWorks.tsx';
import { LiveReading } from './LiveReading.tsx';
import { Questions } from './Questions.tsx';
import { UseAnywhere } from './UseAnywhere.tsx';

export function Landing({ tiles = [] }: { tiles?: readonly PowerMapTile[] }) {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <LiveReading />
        <HowItWorks />
        <UseAnywhere />
        <GallerySection tiles={tiles} />
        <Questions />
        <BackIt />
        <BuildWithUs />
      </main>
      <Footer />
      <FrontDoor />
    </>
  );
}

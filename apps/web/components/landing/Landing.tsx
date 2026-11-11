// The landing's sections in the order of the copy doc (T185, Figma frame 66:2180). It only assembles;
// app/page.tsx hands it the Power Map's drawn readings.

import type { View } from '@petal/core/types';
import type { PowerMapTile } from '../../lib/power-map.ts';
import { Footer } from '../ui/Footer.tsx';
import { Nav } from '../ui/Nav.tsx';
import { BackIt } from './BackIt.tsx';
import { BuildWithUs } from './BuildWithUs.tsx';
import { FrontDoor } from './FrontDoor.tsx';
import { GallerySection } from './GallerySection.tsx';
import { GiveToAgent } from './GiveToAgent.tsx';
import { HeroStory } from './HeroStory.tsx';
import { HowItWorks } from './HowItWorks.tsx';
import { LiveReading } from './LiveReading.tsx';
import { Questions } from './Questions.tsx';

/** `view` is the person's (lib/viewer-view.ts): every picture on the page is drawn in it. */
export function Landing({ tiles = [], view }: { tiles?: readonly PowerMapTile[]; view: View }) {
  return (
    <>
      <Nav />
      <main>
        <HeroStory />
        <LiveReading view={view} />
        <HowItWorks />
        <GiveToAgent />
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

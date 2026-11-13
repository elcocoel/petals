// The landing's sections in order: the hero, How it works, the agent setup, the Power Map, Petal Mania, the FAQ and
// Build Petals with us, then the footer. It only assembles. On a local server it also carries the copy editor
// (?edit=1).

import { CopyEditor } from '../../app/edit/CopyEditor.tsx';
import { Footer } from '../ui/Footer.tsx';
import { Nav } from '../ui/Nav.tsx';
import { BackIt } from './BackIt.tsx';
import { BuildWithUs } from './BuildWithUs.tsx';
import { FrontDoor } from './FrontDoor.tsx';
import { GallerySection } from './GallerySection.tsx';
import { GiveToAgent } from './GiveToAgent.tsx';
import { HeroStory } from './HeroStory.tsx';
import { HowItWorks } from './HowItWorks.tsx';
import { Questions } from './Questions.tsx';

export function Landing() {
  return (
    <>
      <Nav />
      <main>
        <HeroStory />
        <HowItWorks />
        <GiveToAgent />
        <GallerySection />
        <BackIt />
        <Questions />
        <BuildWithUs />
      </main>
      <Footer />
      <FrontDoor />
      {/* The copy editor: only on a local server, with ?edit=1 (app/edit/CopyEditor.tsx) */}
      {process.env.NODE_ENV !== 'production' && <CopyEditor />}
    </>
  );
}

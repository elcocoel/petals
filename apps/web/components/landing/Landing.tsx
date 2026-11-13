// The landing's sections in Elco's order (11 Nov, board card 100): the hero, How it works, give this to your agent,
// the Power Map, Make Petals stronger, the questions, Build it with us. "A reading, summarised" went (Elco:
// "kill it"); the one-click deliverables (board card 101) will sit before the Power Map once they're designed. It only
// assembles. On a local server it also carries Elco's copy editor (?edit=1).

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
      {/* Elco's copy editor: only on a local server, with ?edit=1 (app/edit/CopyEditor.tsx) */}
      {process.env.NODE_ENV !== 'production' && <CopyEditor />}
    </>
  );
}

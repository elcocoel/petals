// The landing page (T185), Figma frame 66:2180, in the order of the copy doc. Static: it only assembles.
// The conversation is at /make.
import { BackIt } from '../components/landing/BackIt.tsx';
import { BuildWithUs } from '../components/landing/BuildWithUs.tsx';
import { FrontDoor } from '../components/landing/FrontDoor.tsx';
import { GallerySection } from '../components/landing/GallerySection.tsx';
import { Hero } from '../components/landing/Hero.tsx';
import { HowItWorks } from '../components/landing/HowItWorks.tsx';
import { LiveReading } from '../components/landing/LiveReading.tsx';
import { Questions } from '../components/landing/Questions.tsx';
import { UseAnywhere } from '../components/landing/UseAnywhere.tsx';
import { Footer } from '../components/ui/Footer.tsx';
import { Nav } from '../components/ui/Nav.tsx';

export default function Landing() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <LiveReading />
        <HowItWorks />
        <UseAnywhere />
        <GallerySection />
        <Questions />
        <BackIt />
        <BuildWithUs />
      </main>
      <Footer />
      <FrontDoor />
    </>
  );
}

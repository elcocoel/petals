// The landing page (T185), Figma frame 66:2180. Static: it only assembles. The conversation is at /make.
import { ClosingAsk } from '../components/landing/ClosingAsk.tsx';
import { FlowerRead } from '../components/landing/FlowerRead.tsx';
import { ForBuilders } from '../components/landing/ForBuilders.tsx';
import { GallerySection } from '../components/landing/GallerySection.tsx';
import { Hero } from '../components/landing/Hero.tsx';
import { HowItWorks } from '../components/landing/HowItWorks.tsx';
import { JoinCommunity } from '../components/landing/JoinCommunity.tsx';
import { Questions } from '../components/landing/Questions.tsx';
import { Footer } from '../components/ui/Footer.tsx';
import { Nav } from '../components/ui/Nav.tsx';

export default function Landing() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <FlowerRead />
        <HowItWorks />
        <Questions />
        <GallerySection />
        <ForBuilders />
        <ClosingAsk />
        <JoinCommunity />
      </main>
      <Footer />
    </>
  );
}

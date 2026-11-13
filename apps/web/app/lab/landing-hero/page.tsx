// The hero in the whole landing, with its review controls: the V2 story, the layers one at a time and each
// beat's note under it (lab/hero/HeroStoryLab.tsx). Make Petals stronger has its three ways in columns, one
// variant for its empty half. (MapHero, the first take, stays in the registry.) In production it stays hidden
// unless PETAL_LAB=1, like the lab, and nothing here reaches the landing until it's reviewed.
import { notFound } from 'next/navigation';
import { BackIt } from '../../../components/landing/BackIt.tsx';
import { BuildWithUs } from '../../../components/landing/BuildWithUs.tsx';
import { FrontDoor } from '../../../components/landing/FrontDoor.tsx';
import { GallerySection } from '../../../components/landing/GallerySection.tsx';
import { GiveToAgent } from '../../../components/landing/GiveToAgent.tsx';
import { HowItWorks } from '../../../components/landing/HowItWorks.tsx';
import { LiveReading } from '../../../components/landing/LiveReading.tsx';
import { Questions } from '../../../components/landing/Questions.tsx';
import { Footer } from '../../../components/ui/Footer.tsx';
import { Nav } from '../../../components/ui/Nav.tsx';
import { HeroStoryLab } from '../../../lab/hero/HeroStoryLab.tsx';
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
  return (
    <>
      <Nav />
      <main>
        <HeroStoryLab />
        <LiveReading view={person.view} />
        <HowItWorks />
        <GiveToAgent />
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

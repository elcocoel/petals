// The landing's Power Map section: its name, then the live map (components/landing/LandingMap.tsx) across the
// window's full width as a wide strip that ends the section. The map plays its moves by itself, each with its card;
// the whole of it, and the button centred over its foot, open the Power Map. There's no colour key over it: each
// flower keys its own colours, and the map's legend says what they mean.
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { Section } from '../ui/Section.tsx';
import { SectionName } from '../ui/SectionName.tsx';
import { LandingMap } from './LandingMap.tsx';

const copy = landingCopy.gallery;

export function GallerySection() {
  return (
    <Section tone="mist" rule="top" bleed head={<SectionName name={copy.title} />}>
      {/* the window's width, whatever the page's column, and down to the section's foot */}
      <div className="relative left-1/2 -mb-page-inset w-screen -translate-x-1/2 md:-mb-section-padding">
        <LandingMap into={{ href: siteLinks.map, label: copy.open, cards: copy.cards }} />
      </div>
    </Section>
  );
}

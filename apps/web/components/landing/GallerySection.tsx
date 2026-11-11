// Figma's "The atlas" (66:2303), now the Power Map (Elco, 9 Nov: "Power map is a good name - let's keep it"),
// and since 10 Nov the map itself, live, in place of a grid of its tiles (Elco: "this should be the global
// map not a bunch of digusting squares"): components/landing/LandingMap.tsx. The button opens the whole map.
// The colour key over it went on 12 Nov: it was the old nine tiles' colours, which the map doesn't paint (a
// petal's colour is keyed in each flower, and the map's own legend says what it means there).
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { Button } from '../ui/Button.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';
import { LandingMap } from './LandingMap.tsx';

const copy = landingCopy.gallery;

export function GallerySection() {
  return (
    <Section
      tone="mist"
      rule="top"
      head={
        <div className="flex flex-wrap items-end justify-between gap-block-gap">
          <SectionHead title={copy.title} />
          <Button href={siteLinks.map}>{copy.open}</Button>
        </div>
      }
    >
      <LandingMap />
    </Section>
  );
}

// Figma's "The atlas" (66:2303), now the Power Map (Elco, 9 Nov: "Power map is a good name - let's keep it"),
// and since 10 Nov the map itself, live, in place of a grid of its tiles (Elco: "this should be the global
// map not a bunch of digusting squares"): components/landing/LandingMap.tsx. The key to its colours is the
// tiles' own, drawn in the same view; the button opens the whole map.
import { landingCopy } from '../../lib/landing-copy.ts';
import { type PowerMapTile, powerMapKeys } from '../../lib/power-map.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { LegendKeys } from '../Legend.tsx';
import { Button } from '../ui/Button.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';
import { LandingMap } from './LandingMap.tsx';

const copy = landingCopy.gallery;

export function GallerySection({ tiles = [] }: { tiles?: readonly PowerMapTile[] }) {
  return (
    <Section
      tone="mist"
      rule="top"
      head={
        <div className="flex flex-col gap-block-gap">
          <div className="flex flex-wrap items-end justify-between gap-block-gap">
            <SectionHead title={copy.title} />
            <Button href={siteLinks.map}>{copy.open}</Button>
          </div>
          {tiles.length > 0 && <LegendKeys keys={powerMapKeys(tiles)} />}
        </div>
      }
    >
      <LandingMap />
    </Section>
  );
}

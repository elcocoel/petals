// Figma's "The atlas" (66:2303), now the Power Map (Elco, 9 Nov: "Power map is a good name - let's keep it").
// Its cards are real readings from the night's mapping run, drawn by the server (lib/power-map.ts); a reading
// the server can't draw is left out, so there are no placeholder pictures.
import { landingCopy } from '../../lib/landing-copy.ts';
import { type PowerMapTile, powerMapKeys } from '../../lib/power-map.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { FlowerTile } from '../FlowerTile.tsx';
import { LegendKeys } from '../Legend.tsx';
import { Button } from '../ui/Button.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';

const copy = landingCopy.gallery;

export function GallerySection({ tiles = [] }: { tiles?: readonly PowerMapTile[] }) {
  return (
    <Section
      tone="mist"
      rule="top"
      layout="columns"
      head={
        <div className="flex flex-col gap-block-gap">
          <div className="flex flex-wrap items-end justify-between gap-block-gap">
            <SectionHead title={copy.title} />
            <Button href={siteLinks.gallery}>{copy.open}</Button>
          </div>
          {tiles.length > 0 && <LegendKeys keys={powerMapKeys(tiles)} />}
        </div>
      }
    >
      {tiles.map((t) => (
        <FlowerTile
          key={t.sha}
          title={t.title}
          where={t.where}
          badge={t.badge}
          image={t.image}
          href={t.href}
        />
      ))}
    </Section>
  );
}

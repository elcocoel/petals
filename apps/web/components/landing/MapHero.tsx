// A candidate hero, shown only in /lab/landing-hero: the eyebrow, headline and subline across the page, Connect and
// the way into the whole map under them, and the live Power Map below, out to the window's edges, with the key
// to its colours, so the map is the first thing a visitor sees and the chapters' typing box goes. The map section
// further down ("Start with a network you know.") folds into it, so the map shows once.
import { landingCopy } from '../../lib/landing-copy.ts';
import { type PowerMapTile, powerMapKeys } from '../../lib/power-map.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { LegendKeys } from '../Legend.tsx';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Button } from '../ui/Button.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';
import { LandingMap } from './LandingMap.tsx';

const copy = landingCopy.hero;

export function MapHero({ tiles = [] }: { tiles?: readonly PowerMapTile[] }) {
  return (
    <Section bleed>
      <SectionHead size="display" eyebrow={copy.eyebrow} title={copy.titleWide} body={copy.body} />
      <div className="mt-column-gap">
        <ActionRow>
          <Button href={siteLinks.lobby} arrow>
            {copy.ask.action}
          </Button>
          <Button href={siteLinks.map} variant="secondary">
            {landingCopy.gallery.open}
          </Button>
        </ActionRow>
      </div>
      <div className="mt-column-gap flex flex-col gap-block-gap">
        {tiles.length > 0 && <LegendKeys keys={powerMapKeys(tiles)} />}
        {/* past the column's padding, so the map meets the window's edges */}
        <div className="-mx-block-gap md:-mx-page-inset">
          <LandingMap />
        </div>
      </div>
    </Section>
  );
}

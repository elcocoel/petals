// Figma's Hero (66:2188). Its flower is a real one in the one look, with the key to its colours, so the landing's
// first flower draws like every other one. A flower the server can't draw is
// left out, as on the Power Map.
import { landingCopy } from '../../lib/landing-copy.ts';
import type { PowerMapTile } from '../../lib/power-map.ts';
import { LegendKeys } from '../Legend.tsx';
import { AskBlock } from '../ui/AskBlock.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';

const copy = landingCopy.hero;

export function Hero({ flower }: { flower?: PowerMapTile }) {
  return (
    <Section layout="split">
      <div>
        <SectionHead size="display" eyebrow={copy.eyebrow} title={copy.title} body={copy.body} />
        <div className="mt-column-gap">
          <AskBlock
            placeholder={copy.ask.placeholders[0]}
            typed={copy.ask.placeholders}
            label={copy.ask.label}
            action={copy.ask.action}
            starterLabel={copy.starterLabel}
            starters={copy.starters}
          />
        </div>
      </div>
      {flower && (
        <figure className="my-0 flex flex-col gap-block-gap">
          {/* biome-ignore lint/performance/noImgElement: an SVG drawn by our own API */}
          <img className="block h-auto w-full" src={flower.image} alt={flower.title} />
          <LegendKeys keys={flower.keys} />
        </figure>
      )}
    </Section>
  );
}

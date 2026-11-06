// Figma's "A flower, already read" (66:2232), now a real one: the published shape, drawn by the API, with
// the findings of its own reading. More shapes will rotate in this same place, once Elco says which.
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { Button } from '../ui/Button.tsx';
import { Mono } from '../ui/Mono.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';
import { Transcript } from '../ui/Transcript.tsx';

const copy = landingCopy.liveReading;

export function LiveReading() {
  return (
    <Section tone="mist" rule="top" layout="split" figure="start">
      <figure className="my-0 flex flex-col gap-block-gap">
        {/* biome-ignore lint/performance/noImgElement: an SVG from our own API */}
        <img className="block h-auto w-full" src={siteLinks.liveShapeImage} alt="" />
        <Mono as="figcaption">{copy.caption}</Mono>
      </figure>
      <div>
        <SectionHead title={copy.title} />
        <div className="mt-column-gap">
          <Transcript lines={copy.findings} />
        </div>
        <div className="mt-space-32">
          <Button href={siteLinks.liveShape}>{copy.action}</Button>
        </div>
      </div>
    </Section>
  );
}

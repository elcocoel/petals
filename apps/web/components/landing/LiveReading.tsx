// Figma's "A flower, already read" (66:2232), now a real one: the published shape, drawn by the API, with
// the findings of its own reading. The strip under it holds the hero set's place until it's chosen (T108):
// placeholder drawings, from Figma's Heroes strip (66:2396), the first one marked.
import type { ThumbKind } from '../../lib/figures.ts';
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { Button } from '../ui/Button.tsx';
import { Drawing } from '../ui/Drawing.tsx';
import { Mono } from '../ui/Mono.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';
import { Transcript } from '../ui/Transcript.tsx';

const copy = landingCopy.liveReading;
const HEROES: readonly ThumbKind[] = ['blocs', 'even', 'tower', 'blocs', 'even'];

export function LiveReading() {
  return (
    <Section tone="mist" rule="top" layout="split" figure="start">
      <div className="flex flex-col gap-block-gap">
        <figure className="my-0 flex flex-col gap-block-gap">
          {/* biome-ignore lint/performance/noImgElement: an SVG from our own API */}
          <img className="block h-auto w-full" src={siteLinks.liveShapeImage} alt="" />
          <Mono as="figcaption">{copy.caption}</Mono>
        </figure>
        <div className="flex flex-wrap items-end gap-text-gap">
          {HEROES.map((kind, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the same kind can appear twice, and nothing moves
            <div key={i} className="flex flex-col gap-space-8">
              <div className={i === 0 ? '' : 'opacity-inactive'}>
                <Drawing kind={kind} size={72} />
              </div>
              <div
                className={`w-full border-t-heavy ${i === 0 ? 'border-accent' : 'border-hairline'}`}
              />
            </div>
          ))}
        </div>
      </div>
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

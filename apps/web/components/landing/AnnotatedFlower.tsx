// The hero's figure (66:2206): the flower, its leader lines, four notes and the agent's remark, placed
// where Figma has them, all in one coordinate system. HTML inside the SVG keeps the words wrapping and
// the note box a real component. On a phone they'd shrink past reading, so they stack under the flower.
// The drawings themselves say nothing to a screen reader; the notes do.
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { Callout } from '../ui/Callout.tsx';
import { Drawing } from '../ui/Drawing.tsx';
import { Mono } from '../ui/Mono.tsx';

const copy = landingCopy.hero;

const NOTES = [
  { text: copy.notes.one, x: 460, y: 44, width: 260, height: 16 },
  { text: copy.notes.three, x: 0, y: 116, width: 180, height: 32 },
  { text: copy.notes.two, x: 0, y: 620, width: 180, height: 32 },
  { text: copy.notes.four, x: 552, y: 684, width: 168, height: 48 },
];
const REMARK = { x: 460, y: 78, width: 244, height: 122 };

function Remark() {
  return (
    <Callout who={copy.callout.who} action={{ label: copy.callout.action, href: siteLinks.make }}>
      {copy.callout.text}
    </Callout>
  );
}

export function AnnotatedFlower() {
  return (
    <div className="flex w-full flex-col gap-block-gap">
      <svg role="presentation" viewBox="0 0 720 740" className="h-auto w-full">
        <Drawing kind="hero-flower" x={20} y={20} width={680} height={680} />
        <g className="max-md:hidden">
          <Drawing kind="hero-leaders" width={720} height={720} />
          {NOTES.map(({ text, ...at }) => (
            <foreignObject key={text} {...at}>
              <Mono>{text}</Mono>
            </foreignObject>
          ))}
          <foreignObject {...REMARK}>
            <Remark />
          </foreignObject>
        </g>
      </svg>
      <div className="flex flex-col gap-text-gap md:hidden">
        {[copy.notes.one, copy.notes.two, copy.notes.three, copy.notes.four].map((text) => (
          <Mono key={text}>{text}</Mono>
        ))}
        <Remark />
      </div>
    </div>
  );
}

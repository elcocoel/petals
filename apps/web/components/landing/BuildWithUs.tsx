// Build it with us, on Figma's For builders (66:2316): the ink band and its headline, and three doors, the
// sleek black boxes Elco keeps ("I want all of our black things to be like this", 13 Nov): the docs, Petals on
// GitHub, and a star for it there. The little text blocks went (Elco: "visual noise"); the animated graph of
// the system waits for Elco's Figma.
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { Icon } from '../ui/Icon.tsx';
import { PlateLink } from '../ui/PlateLink.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';

const copy = landingCopy.builders;

export function BuildWithUs() {
  return (
    <Section
      kind="ink"
      layout="columns"
      head={
        // balanced, so no word is left alone on the headline's last line (11 Nov, at 1280)
        <div className="text-balance lg:w-2/3">
          <SectionHead title={copy.title} />
        </div>
      }
    >
      {copy.doors.map((door) => (
        // A door is a box you press (box.glass, the ink band's own: it rises and tilts), only its name and an
        // arrow, or GitHub's star for the star.
        <PlateLink key={door.title} href={siteLinks[door.link]} glass>
          <span className="flex min-h-drawing-72 items-end justify-between gap-block-gap">
            <span className="type-title">{door.title}</span>
            <Icon name={door.icon} />
          </span>
        </PlateLink>
      ))}
    </Section>
  );
}

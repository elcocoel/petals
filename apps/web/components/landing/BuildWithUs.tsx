// Build it with us, on Figma's For builders (66:2316): the ink band and its headline, and three doors, the
// sleek black boxes Elco keeps ("I want all of our black things to be like this", 13 Nov): the docs, Petals on
// GitHub, and a star for it there. The little text blocks went (Elco: "visual noise"); the animated graph of
// the system (PANEL's SystemGraph) goes between the name and the doors. Its name in the logo's face, as every
// section's (Elco, 13 Nov).
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { Icon } from '../ui/Icon.tsx';
import { PlateLink } from '../ui/PlateLink.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionName } from '../ui/SectionName.tsx';

const copy = landingCopy.builders;

export function BuildWithUs() {
  return (
    <Section kind="ink" layout="columns" head={<SectionName name={copy.title} />}>
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

// Build it with us, on Figma's For builders (66:2316): the ink band, its name in the logo's face (as every
// section's), the system's graph (SystemGraph, between the name and the buttons once it's in), and three plain
// buttons, centred under it in the band's primary look: the docs, Petals on GitHub, and a star for it there.
// Buttons rather than boxes, so they don't read as parts of the graph.
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/Icon.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionName } from '../ui/SectionName.tsx';

const copy = landingCopy.builders;

export function BuildWithUs() {
  return (
    <Section kind="ink" head={<SectionName name={copy.title} />}>
      <div className="flex flex-col gap-column-gap">
        <div className="flex justify-center">
          <ActionRow gap="tight">
            {copy.doors.map((door) => (
              <Button key={door.title} href={siteLinks[door.link]} arrow={door.icon === 'arrow'}>
                {door.icon === 'star' && <Icon name="star" />}
                {door.title}
              </Button>
            ))}
          </ActionRow>
        </div>
      </div>
    </Section>
  );
}

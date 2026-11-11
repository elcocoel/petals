// Build it with us, on Figma's For builders (66:2316): the ink band, and the doors into the system Elco named
// (11 Nov, board card 103): the brain, the data protocol, the rendering protocol, connecting an agent, the API,
// contributing. Each opens its page in /docs, as a plate with only its name (Elco, 12 Nov: "the six things are
// boring ... a bunch of text"). GitHub joins them once the repo is public; until then a link to it would go
// nowhere (design/minimally-good.md, rule 10).
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/Icon.tsx';
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
          <SectionHead title={copy.title} body={copy.body} />
        </div>
      }
      foot={
        <ActionRow>
          <Button href={siteLinks.docs}>{copy.actions.docs}</Button>
        </ActionRow>
      }
    >
      {copy.doors.map((door) => (
        // A door is a box you press (box.glass, the ink band's own: it rises and tilts), only its name and an
        // arrow. Not a plate: box.paper is a light band's paper and goes white on ink.
        <a
          key={door.slug}
          href={`${siteLinks.docs}/${door.slug}`}
          data-b="link"
          data-kind="card"
          className="flex no-underline"
        >
          <span
            data-b="box"
            className="flex min-h-drawing-144 w-full items-end justify-between gap-block-gap border border-hairline p-block-gap"
          >
            <span className="type-title">{door.title}</span>
            <Icon name="arrow" />
          </span>
        </a>
      ))}
    </Section>
  );
}

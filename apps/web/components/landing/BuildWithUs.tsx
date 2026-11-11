// Build it with us, on Figma's For builders (66:2316): the ink band, and the doors into the system Elco named
// (11 Nov, board card 103): the brain, the data protocol, the rendering protocol, connecting an agent, the API,
// contributing. Each opens its page in /docs. GitHub joins them once the repo is public at the freeze; until then
// a link to it would go nowhere (design/minimally-good.md, rule 10).
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Button } from '../ui/Button.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';
import { TextLink } from '../ui/TextLink.tsx';

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
        <div
          key={door.slug}
          className="flex flex-col items-start border-t border-hairline pt-block-gap"
        >
          <h3 className="my-0 type-heading">{door.title}</h3>
          <p className="mt-space-16 mb-space-16 type-body">{door.body}</p>
          <TextLink href={`${siteLinks.docs}/${door.slug}`} variant="mono" arrow>
            {copy.doorLink}
          </TextLink>
        </div>
      ))}
    </Section>
  );
}

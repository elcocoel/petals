// Figma's Join the community (66:2346). Neither of its buttons has an address yet.
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Button } from '../ui/Button.tsx';
import { Drawing } from '../ui/Drawing.tsx';
import { Mono } from '../ui/Mono.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';

const copy = landingCopy.community;

export function JoinCommunity() {
  return (
    <Section tone="paper" id="community" layout="split">
      <div>
        <SectionHead eyebrow={copy.eyebrow} title={copy.title} body={copy.body} />
        <div className="mt-space-32">
          <ActionRow gap="tight">
            <Button href={siteLinks.community}>{copy.join}</Button>
            <Button variant="secondary" href={siteLinks.community}>
              {copy.support}
            </Button>
          </ActionRow>
        </div>
        <div className="mt-space-16">
          <Mono>{copy.caption}</Mono>
        </div>
      </div>
      <Drawing kind="cell-repeat" />
    </Section>
  );
}

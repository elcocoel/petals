// Figma's Join the community (66:2346). Neither of its buttons has an address yet.
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Button } from '../ui/Button.tsx';
import { Caption } from '../ui/Caption.tsx';
import { CellRepeat } from '../ui/Cell.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';

const copy = landingCopy.community;

export function JoinCommunity() {
  return (
    <Section id="community">
      <div className="flex flex-col gap-page-inset lg:flex-row lg:items-center lg:gap-section-padding">
        <div className="w-full min-w-0 lg:max-w-community-pitch-width lg:flex-1">
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
            <Caption>{copy.caption}</Caption>
          </div>
        </div>
        <div className="w-full min-w-0 lg:max-w-cell-repeat-width lg:flex-1">
          <CellRepeat />
        </div>
      </div>
    </Section>
  );
}

// Petal Mania, what was Make Petals stronger (Figma's Join the community, 66:2346). Elco, 13 Nov: four cards in one
// line, "the card themselves should be the buttons and the thing that does the thing", far less text; the actions
// that matter, in an order that grows in power, with a leaderboard only hinted. Each card is a plate you press
// (PlateLink: it rises and tilts); a card whose address isn't in yet shows without a link. The section's name is
// in the logo's face (SectionName); its hint is Elco's words.
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { Icon } from '../ui/Icon.tsx';
import { PlateLink } from '../ui/PlateLink.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionName } from '../ui/SectionName.tsx';

const copy = landingCopy.backIt;

/** Where a card goes: the site's own page, the repo, or a social whose address may not be in yet. */
function hrefOf(link: string): string | undefined {
  if (link === 'lobby') return siteLinks.lobby;
  if (link === 'github') return siteLinks.github;
  if (link === 'telegram') return siteLinks.socials.telegram || undefined;
  return undefined;
}

export function BackIt() {
  return (
    <Section
      head={
        <div className="flex flex-col gap-block-gap">
          <SectionName name={copy.title} />
          <p className="my-0 max-w-content-width type-lead">{copy.hint}</p>
        </div>
      }
    >
      <ul className="m-0 grid list-none grid-cols-1 gap-block-gap p-0 md:grid-cols-2 lg:grid-cols-4">
        {copy.ways.map((way) => {
          const href = hrefOf(way.link);
          return (
            <li key={way.title} className="min-w-0">
              <PlateLink href={href}>
                <span className="flex min-h-drawing-144 items-end justify-between gap-block-gap">
                  <span className="type-heading">{way.title}</span>
                  {href && <Icon name="arrow" />}
                </span>
              </PlateLink>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

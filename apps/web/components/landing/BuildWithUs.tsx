// Build with us, on Figma's For builders (66:2316): the ink band. The terminal shows the command /connect
// hands out. GitHub goes public before submission (T149, T150), and the builders' channel isn't chosen.
import { doors } from '../../lib/doors.ts';
import { landingCopy } from '../../lib/landing-copy.ts';
import { publicOrigin, siteLinks } from '../../lib/site-links.ts';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Button } from '../ui/Button.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';
import { Terminal } from '../ui/Terminal.tsx';

const copy = landingCopy.builders;
const door = doors(publicOrigin).find((d) => d.id === 'claude-code');

export function BuildWithUs() {
  return (
    <Section kind="ink" layout="split">
      <div>
        <SectionHead title={copy.title} body={copy.body} />
        <div className="mt-space-32">
          <ActionRow gap="tight">
            {/* GitHub and Join the builders come back with somewhere to go: the repo public on Elco's
                go, a builders' channel once chosen (design/minimally-good.md, rule 10). */}
            <Button href={siteLinks.connect}>{copy.actions.docs}</Button>
          </ActionRow>
        </div>
      </div>
      {door && <Terminal start={door.title} lines={[{ text: `$ ${door.copy}`, accent: true }]} />}
    </Section>
  );
}

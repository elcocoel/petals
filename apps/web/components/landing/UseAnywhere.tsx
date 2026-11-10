// Use it anywhere, on the mint band that was Figma's Closing ask (66:2336): how your own agents work with
// Petals' agent (C, 9 Nov). One way to connect them (10 Nov): the one prompt joins your account, so it's
// /connect's, after Connect; this section sends you there.
import { landingCopy } from '../../lib/landing-copy.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { Button } from '../ui/Button.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';
import { Terminal } from '../ui/Terminal.tsx';

const copy = landingCopy.useAnywhere;

export function UseAnywhere() {
  return (
    <Section kind="mint" layout="split">
      <div>
        <SectionHead size="compact" title={copy.title} body={copy.body} />
        <div className="mt-space-32 flex flex-col items-start gap-text-gap">
          <Button href={siteLinks.doors.prompt}>{copy.action}</Button>
          <p className="my-0 type-caption">{copy.promptNote}</p>
        </div>
      </div>
      <Terminal {...copy.terminal} />
    </Section>
  );
}

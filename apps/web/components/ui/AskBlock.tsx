// The Ask box with its ready-made questions under it. Every question is a link to the same place the
// box asks (lib/site-links.ts), so this needs no JavaScript.
import { askHref, siteLinks } from '../../lib/site-links.ts';
import { AskBox } from './AskBox.tsx';
import { Button } from './Button.tsx';
import { Caption } from './Caption.tsx';

export function AskBlock({
  placeholder,
  action,
  starterLabel,
  starters,
}: {
  placeholder: string;
  action: string;
  /** The line above the questions. */
  starterLabel?: string;
  starters: readonly string[];
}) {
  return (
    <div className="flex flex-col gap-space-16">
      <AskBox placeholder={placeholder} label={action} action={action} to={siteLinks.make} />
      <div className="flex flex-col gap-space-10">
        {starterLabel && <Caption>{starterLabel}</Caption>}
        <div className="flex flex-wrap gap-space-8">
          {starters.map((question) => (
            <Button key={question} variant="starter" href={askHref(question)}>
              {question}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

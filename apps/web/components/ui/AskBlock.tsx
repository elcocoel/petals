// The Ask box with its ready-made questions under it. Every question is a link to the same place the
// box asks (lib/site-links.ts), so this needs no JavaScript. `typed` is what the box's placeholder cycles
// through in version 2 (`field.type`); without a script it shows `placeholder` and holds still.
import { askHref, siteLinks } from '../../lib/site-links.ts';
import { AskBox } from './AskBox.tsx';
import { Button } from './Button.tsx';
import { Mono } from './Mono.tsx';

export function AskBlock({
  placeholder,
  typed,
  label,
  action,
  starterLabel,
  starters,
}: {
  placeholder: string;
  typed?: readonly string[];
  /** What a screen reader hears for the box. */
  label: string;
  action: string;
  /** The line above the questions. */
  starterLabel?: string;
  starters: readonly string[];
}) {
  return (
    <div className="flex flex-col gap-space-16" data-typed={typed && JSON.stringify(typed)}>
      <AskBox placeholder={placeholder} label={label} action={action} to={siteLinks.make} />
      <div className="flex flex-col gap-text-gap">
        {starterLabel && <Mono>{starterLabel}</Mono>}
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

// What the agent offers next on /make, under its short reading (lib/next-steps.ts), the moment to ask whether to
// map something new: a few steps, each one press, as the side panel's rows: its words, a quiet line under
// them, a square of accent while it runs; then the brain's services folded under More, the same rows. Props
// only: whether More is open is the page's.
import { type NextStep, nextStepWords as words } from '../lib/next-steps.ts';
import { Icon } from './ui/Icon.tsx';
import { LineRow } from './ui/LineRow.tsx';
import { Mono } from './ui/Mono.tsx';

function StepRows({ steps }: { steps: readonly NextStep[] }) {
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {steps.map((s) => (
        <li key={s.key}>
          <LineRow onClick={s.onPress}>
            <span className="flex w-full min-w-0 items-center gap-space-8">
              <span className="min-w-0 flex-1 type-ui text-primary wrap-anywhere">{s.label}</span>
              {s.busy && (
                <span className="flex shrink-0 items-center">
                  <span aria-hidden="true" className="size-space-8 bg-accent" />
                  <span className="sr-only">{words.working}</span>
                </span>
              )}
            </span>
            {s.says && (
              <Mono as="span" tone="muted">
                {s.says}
              </Mono>
            )}
          </LineRow>
        </li>
      ))}
    </ul>
  );
}

export function NextSteps({
  steps,
  more,
}: {
  steps: readonly NextStep[];
  /** The brain's services, folded under More until it's pressed. */
  more?: { open: boolean; onToggle: () => void; steps: readonly NextStep[] } | undefined;
}) {
  return (
    <section aria-label={words.label} className="flex flex-col">
      <StepRows steps={steps} />
      {more && more.steps.length > 0 && (
        <>
          <LineRow expanded={more.open} onClick={more.onToggle}>
            <span className="flex items-center gap-space-4 type-ui text-muted">
              {words.more(more.steps.length)}
              <span aria-hidden="true" className="flex">
                <Icon name={more.open ? 'down' : 'chevron'} small />
              </span>
            </span>
          </LineRow>
          {more.open && <StepRows steps={more.steps} />}
        </>
      )}
    </section>
  );
}

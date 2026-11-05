// The terminal on the builders' band (66:2325): a bar, then mono lines, some in the accent. It's an
// illustration, not a shell, and its bar says so.
import { Icon } from './Icon.tsx';
import { MetaRow } from './MetaRow.tsx';

export function Terminal({
  start,
  end,
  lines,
}: {
  start: string;
  end: string;
  /** `returned`: what came back, after an arrow pointing home. */
  lines: readonly { text: string; accent?: boolean; returned?: boolean }[];
}) {
  return (
    <div data-b="box" data-kind="term" className="border border-primary">
      <div className="border-b border-primary px-block-gap py-space-16">
        <MetaRow start={start} end={end} />
      </div>
      <div className="flex flex-col gap-text-gap px-block-gap py-space-32 type-mono-code">
        {lines.map(({ text, accent, returned }) => (
          <p key={text} className={`my-0 whitespace-pre-wrap ${accent ? 'text-accent' : ''}`}>
            {returned && (
              <>
                <Icon name="back" />{' '}
              </>
            )}
            {text}
          </p>
        ))}
      </div>
    </div>
  );
}

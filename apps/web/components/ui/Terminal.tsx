// The terminal on the builders' band (66:2325): a bar, then mono lines, some in the accent. A picture of a
// shell, not a shell. What's in it is real: the page passes the same command /connect hands out.
import { BarBox } from './BarBox.tsx';
import { Icon } from './Icon.tsx';
import { MetaRow } from './MetaRow.tsx';

export function Terminal({
  start,
  end,
  lines,
}: {
  start: string;
  end?: string;
  /** `returned`: what came back, after an arrow pointing home. */
  lines: readonly { text: string; accent?: boolean; returned?: boolean }[];
}) {
  return (
    <BarBox kind="term" bar={<MetaRow start={start} end={end} />}>
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
    </BarBox>
  );
}

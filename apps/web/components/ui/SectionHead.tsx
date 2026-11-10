// An eyebrow, a title, a paragraph: the head of nearly every section, with Figma's gaps per size.
// A line break in the title or the paragraph is written in the copy. At the panel's size it heads a
// section of the side panel instead (design/side-panel.md, lines 39, 40 and 43): a band in the tint, the
// panel's full width, one row high, a hairline at its foot, its name in muted mono after a chevron that
// folds the section, which settles under it (head.settle); it doesn't rise in as a section's head does.
// A section's one action is its last row, not a control here.
import { Fragment, type ReactNode } from 'react';
import { Icon } from './Icon.tsx';
import { Mono } from './Mono.tsx';

const SIZES = {
  display: {
    Tag: 'h1',
    title: 'type-display-compact md:type-display',
    gap: 'mt-space-32',
    body: 'mt-space-32 type-lead',
  },
  compact: {
    Tag: 'h2',
    title: 'type-title md:type-display-compact',
    gap: 'mt-block-gap',
    body: 'mt-block-gap type-body',
  },
  title: {
    Tag: 'h2',
    title: 'type-title',
    gap: 'mt-block-gap',
    body: 'mt-block-gap type-body',
  },
} as const;

/** Each written line can rise on its own. The line break stays in the text, so this draws the same. */
function titleLines(title: string) {
  const lines = title.split('\n');
  return lines.map((line, i) => (
    <Fragment key={line}>
      <span data-line="">{line}</span>
      {i < lines.length - 1 && '\n'}
    </Fragment>
  ));
}

export function SectionHead({
  eyebrow,
  eyebrowTone = 'primary',
  title,
  body,
  size = 'title',
  fold,
}: {
  eyebrow?: ReactNode;
  eyebrowTone?: 'primary' | 'accent';
  title: ReactNode;
  body?: ReactNode;
  size?: keyof typeof SIZES | 'panel';
  /** At the panel's size: its section is open, and pressing the head folds or unfolds it. */
  fold?: { open: boolean; onToggle: () => void };
}) {
  if (size === 'panel') {
    // past the column's padding to the panel's edges, as VS Code's heads are; a row's fill stays inset
    return (
      <h2
        className="-mx-space-8 my-0 flex h-row-height items-center border-b border-hairline bg-tint type-mono text-muted"
        data-b="head"
        data-kind="panel"
      >
        {fold ? (
          <button
            type="button"
            aria-expanded={fold.open}
            onClick={fold.onToggle}
            className="flex size-full min-w-0 items-center justify-start gap-space-8 bg-transparent px-space-16 type-mono text-muted hover:text-primary hover:opacity-100"
          >
            <span className={`flex shrink-0 ${fold.open ? 'rotate-90' : ''}`}>
              <Icon name="chevron" small />
            </span>
            <span className="min-w-0 truncate">{title}</span>
          </button>
        ) : (
          <span className="min-w-0 truncate px-space-16">{title}</span>
        )}
      </h2>
    );
  }
  const { Tag, title: titleType, gap, body: bodyType } = SIZES[size];
  return (
    <div data-b="head">
      {eyebrow && <Mono tone={eyebrowTone}>{eyebrow}</Mono>}
      <Tag className={`my-0 whitespace-pre-line ${titleType} ${eyebrow ? gap : ''}`}>
        {typeof title === 'string' ? titleLines(title) : title}
      </Tag>
      {body && <p className={`mb-0 whitespace-pre-line text-pretty ${bodyType}`}>{body}</p>}
    </div>
  );
}

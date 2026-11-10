// An eyebrow, a title, a paragraph: the head of nearly every section, with Figma's gaps per size.
// A line break in the title or the paragraph is written in the copy. At the panel's size it heads a
// group in the side panel instead: one mono line, muted, one row high, and it doesn't rise in as a
// section's head does. A group's one action is its last row, not a control here.
import { Fragment, type ReactNode } from 'react';
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
}: {
  eyebrow?: ReactNode;
  eyebrowTone?: 'primary' | 'accent';
  title: ReactNode;
  body?: ReactNode;
  size?: keyof typeof SIZES | 'panel';
}) {
  if (size === 'panel') {
    return (
      <div className="flex h-row-height items-center px-space-8">
        <h2 className="my-0 min-w-0 truncate type-mono text-muted">{title}</h2>
      </div>
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

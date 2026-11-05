// An eyebrow, a title, a paragraph: the head of nearly every section, with Figma's gaps per size.
// A line break in the title is written in the copy.
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
  size?: keyof typeof SIZES;
}) {
  const { Tag, title: titleType, gap, body: bodyType } = SIZES[size];
  return (
    <div data-b="head">
      {eyebrow && <Mono tone={eyebrowTone}>{eyebrow}</Mono>}
      <Tag className={`my-0 whitespace-pre-line ${titleType} ${eyebrow ? gap : ''}`}>
        {typeof title === 'string' ? titleLines(title) : title}
      </Tag>
      {body && <p className={`mb-0 text-pretty ${bodyType}`}>{body}</p>}
    </div>
  );
}

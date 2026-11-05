// An eyebrow, a title, a paragraph: the head of nearly every section, with Figma's gaps per size.
// A line break in the title is written in the copy.
import type { ReactNode } from 'react';
import { Eyebrow } from './Eyebrow.tsx';

const SIZES = {
  display: {
    Tag: 'h1',
    title: 'type-display-compact md:type-display',
    gap: 'mt-space-28',
    body: 'mt-space-28 type-lead',
  },
  compact: {
    Tag: 'h2',
    title: 'type-title md:type-display-compact',
    gap: 'mt-block-gap',
    body: 'mt-space-20 type-body',
  },
  title: {
    Tag: 'h2',
    title: 'type-title',
    gap: 'mt-block-gap',
    body: 'mt-space-20 type-body',
  },
} as const;

export function SectionHead({
  eyebrow,
  title,
  body,
  size = 'title',
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  size?: keyof typeof SIZES;
}) {
  const { Tag, title: titleType, gap, body: bodyType } = SIZES[size];
  return (
    <div>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <Tag className={`my-none whitespace-pre-line ${titleType} ${eyebrow ? gap : ''}`}>
        {title}
      </Tag>
      {body && <p className={`mb-none text-pretty ${bodyType}`}>{body}</p>}
    </div>
  );
}

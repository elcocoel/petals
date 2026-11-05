// Figma's "Reading key" 39:887: what the petals are, how to read them, and which data this is.
import type { ReadingKeyView } from '../../lib/flower-view.ts';

export function ReadingKey({ view }: { view: ReadingKeyView }) {
  return (
    <div className="flex min-h-detail-height flex-col gap-space-8">
      <h3 className="m-0 type-heading">{view.heading}</h3>
      <p className="type-body">{view.body}</p>
      <p className="type-caption whitespace-pre-wrap">{view.note}</p>
    </div>
  );
}

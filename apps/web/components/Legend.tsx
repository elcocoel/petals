// The legend (T064, FR-011): one line for every primitive the flower uses, with its meaning and
// sources, straight from the render result (the web never re-derives it).
import type { LegendItem } from '@petal/core/types';
import { type LegendKey, swatchKey } from '../lib/flower-view.ts';
import { SourceList } from './Sources.tsx';

/** Figma's "Flower legend" 40:764: the colours in one quiet line, under the drawing. */
export function LegendKeys({ keys }: { keys: LegendKey[] }) {
  return (
    <ul className="m-0 flex list-none flex-wrap items-center gap-x-block-gap gap-y-space-8 p-0 type-caption">
      {keys.map((k) => (
        <li key={k.label} className="flex items-center gap-space-8">
          <span className="swatch" data-swatch={k.swatch} />
          {k.label}
        </li>
      ))}
    </ul>
  );
}

export function Legend({
  items,
  sources,
}: {
  items: LegendItem[];
  sources?: Record<string, string>;
}) {
  return (
    <section>
      <h2>Legend</h2>
      <ul className="legend">
        {items.map((item) => (
          <li key={item.primitive}>
            {/* "everyone else" says what it is; "tail" is the code's word for it. */}
            {item.primitive !== 'tail' && <strong>{item.primitive}: </strong>}
            {item.meaning}
            {item.sources.length > 0 && (
              <>
                {' '}
                <SourceList ids={item.sources} urls={sources} />
              </>
            )}
            {item.keys && item.keys.length > 0 && (
              <ul>
                {item.keys.map((k) => (
                  <li key={k.label}>
                    <span className="swatch" data-swatch={swatchKey(k.swatch)} /> {k.label}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

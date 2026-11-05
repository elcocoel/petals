// The legend (T064, FR-011): one line for every primitive the flower uses, with its meaning and
// sources, straight from the render result (the web never re-derives it).
import type { LegendItem } from '@petal/core/types';
import { SourceList } from './Sources.tsx';

/** A swatch comes from the renderer as var(--k-pool); the generated CSS has a rule per colour. */
const swatchKey = (swatch: string) => /^var\(--([\w-]+)\)$/.exec(swatch)?.[1];

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
            <strong>{item.primitive}</strong>: {item.meaning}
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

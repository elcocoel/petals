// The legend (T064, FR-011): one line for every primitive the flower uses, with its meaning and
// sources, straight from the render result (the web never re-derives it).
import type { LegendItem } from '@petal/core/types';
import { SourceList } from './Sources.tsx';

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
                    <span className="swatch" style={{ background: `${k.swatch}` }} /> {k.label}
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

// A map's page (Elco, 10 Nov: one map per address, its versions together): what it maps, the key to its
// colours, and its readings newest first, each with who made it and its drawings. Built from the parts a
// flower's page and the Power Map already use. No sign-in.
import { FlowerTile } from '../../../../components/FlowerTile.tsx';
import { LegendKeys } from '../../../../components/Legend.tsx';
import { Mono } from '../../../../components/ui/Mono.tsx';
import { shortId } from '../../../../lib/flower-view.ts';
import { viewName } from '../../../../lib/map-views.ts';
import { drawingsKeys, drawingTile, mapOne, readingLine } from '../../../../lib/maps.ts';
import { siteLinks } from '../../../../lib/site-links.ts';

export const dynamic = 'force-dynamic';

export default async function MapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const got = await mapOne(decodeURIComponent(id));
  if (!got.ok) {
    return (
      <>
        <h1>Power Map</h1>
        <p className="error">
          {got.error.code === 'not_found'
            ? 'This map isn’t on the Power Map.'
            : `${got.error.code}: ${got.error.message}`}
        </p>
        <p>
          <a href={siteLinks.gallery}>Back to the Power Map</a>
        </p>
      </>
    );
  }
  const m = got.value.map;
  const name = viewName(m);
  // What it maps, unless that only says its name again, and its address when it has one.
  const about = [m.about !== name ? m.about : null].filter(Boolean);
  return (
    <>
      <h1>{name}</h1>
      {(about.length > 0 || m.address) && (
        <p>
          {about[0]}
          {about.length > 0 && m.address && '   ·   '}
          {m.address && <Mono as="span">{shortId(m.address)}</Mono>}
        </p>
      )}
      <div className="mb-block-gap">
        <LegendKeys keys={drawingsKeys(m)} />
      </div>
      {m.readings.map((r) => (
        <section key={r.snapshot} className="mt-column-gap flex flex-col gap-block-gap">
          <p className="my-0 type-label">{readingLine(r)}</p>
          <ul className="gallery">
            {r.drawings.map((d) => (
              <li key={d.sha}>
                <FlowerTile {...drawingTile(m, r, d)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="mt-column-gap">
        <a href={siteLinks.gallery}>Back to the Power Map</a>
      </p>
    </>
  );
}

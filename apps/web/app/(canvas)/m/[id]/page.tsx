// A map's page (Elco, 10 Nov: one map per address, its versions together; coordinator/one-source.md, step 6:
// a flower is the map zoomed in). The Power Map opens inside this map's flower, and the box beside it says
// what it maps, the key to its colours, and its readings newest first, each with who made it and its
// drawings. No sign-in.
import { notFound } from 'next/navigation';
import { FlowerTile } from '../../../../components/FlowerTile.tsx';
import { LegendKeys } from '../../../../components/Legend.tsx';
import { ReadingColumn } from '../../../../components/SiteChrome.tsx';
import { Mono } from '../../../../components/ui/Mono.tsx';
import { MapAt } from '../../../../flower/OnTheMap.tsx';
import { powerMapAt } from '../../../../landscape/land.ts';
import { shortId } from '../../../../lib/flower-view.ts';
import { viewName } from '../../../../lib/map-views.ts';
import {
  drawingsKeys,
  drawingTile,
  type MapCard,
  mapOne,
  readingLine,
} from '../../../../lib/maps.ts';
import { isMissing } from '../../../../lib/missing.ts';
import { siteLinks } from '../../../../lib/site-links.ts';
import { mapWorth } from '../../../../lib/value-view.ts';
import { viewerView } from '../../../../lib/viewer-view.ts';

export const dynamic = 'force-dynamic';

/** What its token is worth (#91): the reading's total and the supply, each with where and when; or no price. */
function Worth({ m }: { m: MapCard }) {
  const worth = mapWorth(m.value);
  if (!worth) return null;
  if (worth === 'no price') return <p className="my-0 text-muted">No price</p>;
  return (
    <>
      {worth.map((w) => (
        <p key={w.text} className="my-0">
          {w.text}
          <span className="type-mono text-muted"> {w.source}</span>
        </p>
      ))}
    </>
  );
}

/** What the map says about itself, beside it. */
function Readings({ m }: { m: MapCard }) {
  const name = viewName(m);
  // What it maps, unless that only says its name again, and its address when it has one.
  const about = m.about !== name ? m.about : null;
  return (
    <>
      {(about || m.address) && (
        <p className="my-0">
          {about}
          {about && m.address && '   ·   '}
          {m.address && <Mono as="span">{shortId(m.address)}</Mono>}
        </p>
      )}
      <Worth m={m} />
      <LegendKeys keys={drawingsKeys(m)} />
      {m.readings.map((r) => (
        <section key={r.snapshot} className="mt-block-gap flex flex-col gap-block-gap">
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
    </>
  );
}

export default async function MapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const map = decodeURIComponent(id);
  const { hash } = await viewerView();
  const [got, at] = await Promise.all([mapOne(map, hash), powerMapAt(hash, { map })]);
  if (!got.ok) {
    // not there: the site's 404, the bouncer (#78)
    if (isMissing(got.error)) notFound();
    return (
      <ReadingColumn>
        <h1>Power Map</h1>
        <p className="error">{`${got.error.code}: ${got.error.message}`}</p>
        <p>
          <a href={siteLinks.map}>Back to the Power Map</a>
        </p>
      </ReadingColumn>
    );
  }
  const m = got.value.map;
  // The map couldn't be read whole: its readings still show, as a page.
  if ('error' in at || at.focus < 0) {
    return (
      <ReadingColumn>
        <h1>{viewName(m)}</h1>
        <Readings m={m} />
        <p className="mt-column-gap">
          <a href={siteLinks.map}>Back to the Power Map</a>
        </p>
      </ReadingColumn>
    );
  }
  return (
    <MapAt land={at.land} focus={at.focus} title={viewName(m)}>
      <Readings m={m} />
    </MapAt>
  );
}

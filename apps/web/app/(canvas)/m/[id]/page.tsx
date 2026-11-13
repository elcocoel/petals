// A map's page (one map per address, its versions together; a flower is the map zoomed in). The Power Map
// opens inside this map's flower, and the box beside it says what it maps, the key to its colours, and its
// readings newest first, each with who made it and its drawings. No sign-in.
import { notFound } from 'next/navigation';
import { MapList } from '../../../../components/MapList.tsx';
import { ReadingColumn } from '../../../../components/SiteChrome.tsx';
import { Mono } from '../../../../components/ui/Mono.tsx';
import { SourceLink } from '../../../../components/ui/SourceLink.tsx';
import { MapAt } from '../../../../flower/OnTheMap.tsx';
import { powerMapAt } from '../../../../landscape/land.ts';
import { shortId } from '../../../../lib/flower-view.ts';
import { viewName } from '../../../../lib/map-views.ts';
import { drawingTile, type MapCard, mapOne, readingLine } from '../../../../lib/maps.ts';
import { isMissing } from '../../../../lib/missing.ts';
import { siteLinks } from '../../../../lib/site-links.ts';
import { mapWorth } from '../../../../lib/value-view.ts';
import { viewerView } from '../../../../lib/viewer-view.ts';

export const dynamic = 'force-dynamic';

/** What its token is worth: the reading's total and the supply, each with where and when; or no price. */
function Worth({ m }: { m: MapCard }) {
  const worth = mapWorth(m.value);
  if (!worth) return null;
  if (worth === 'no price') return <p className="my-0 type-ui text-muted">No price</p>;
  return (
    <>
      {worth.map((w) => (
        <p key={w.text} className="my-0 type-ui">
          {w.text}
          <span className="type-mono text-muted"> {w.source}</span>
          {w.link && <SourceLink href={w.link} name={w.source} />}
        </p>
      ))}
    </>
  );
}

/**
 * What the map says about itself, first in the map's Information box, at the app's scale as the side panel's
 * words are: what it maps and its address, its worth, and each reading's drawings. Its colours' key is Tools'
 * Colour row.
 */
function Readings({ m }: { m: MapCard }) {
  const name = viewName(m);
  // What it maps, unless that only says its name again, and its address when it has one.
  const about = m.about !== name ? m.about : null;
  return (
    <>
      {(about || m.address) && (
        <p className="my-0 type-ui">
          {about}
          {about && m.address && ' · '}
          {m.address && (
            <Mono as="span" tone="muted">
              {shortId(m.address)}
            </Mono>
          )}
        </p>
      )}
      <Worth m={m} />
      {m.readings.map((r) => (
        // each reading's line is in Layers, with its period; here its drawings, named by it
        <section key={r.snapshot} className="mt-space-8 flex flex-col">
          <MapList
            label={readingLine(r)}
            rows={r.drawings.map((d) => ({ key: d.sha, ...drawingTile(m, r, d) }))}
          />
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
    // not there: the site's 404, the bouncer
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

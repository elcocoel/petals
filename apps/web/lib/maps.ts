// One map per address (Elco, 10 Nov: "maps that map the same address need to come together as versions of
// the same map"; coordinator/one-map-per-address.md). SYSTEMS's GET /api/v1/maps gives one card per address,
// newest first: its newest drawing's name, picture and colours, and its readings (the sediments), newest
// first, each with who made it and its drawings. The web shows them as given.
import { api } from './api.ts';
import { chainLabel, dateLabel, keysOf, type LegendKey, oneKey, shortId } from './flower-view.ts';
import { viewName } from './map-views.ts';
import { viewQuery } from './person-view.ts';
import type { MapValue } from './value-view.ts';

type Keys = { label: string; swatch: string }[];

export interface MapDrawing {
  sha: string;
  name: string | null;
  view_url: string;
  picture: string;
  keys: Keys;
  made_by: string | null;
}

export interface MapReading {
  snapshot: string;
  as_of: string;
  network: string;
  /** what was read, in people's words: "ERC-20 token holders on Gnosis" */
  about: string;
  title: string;
  count: number | null;
  /** who made it: the maker of its first drawing */
  made_by: string | null;
  /** oldest first */
  drawings: MapDrawing[];
}

export interface MapCard {
  /** the address, by the flower's own rule: chain:address, or chain:population for a whole network */
  id: string;
  name: string | null;
  title: string;
  about: string;
  chain: string;
  /** what tells same-titled maps apart; null for a whole network */
  address: string | null;
  picture: string;
  view_url: string;
  keys: Keys;
  /** what its token is worth (#91), or null until it's read; older servers leave it out */
  value?: MapValue | null;
  /** what tells its organisation from another (#85): its name, its token's symbol, its logo; null until read */
  mark?: MapMark | null;
  /** newest first */
  readings: MapReading[];
}

/** A map's mark as its card carries it (mark/v1): each part with how it's known, or null. */
export interface MapMark {
  name: { value: string; status: string; source: string } | null;
  symbol: { value: string; status: string; source: string } | null;
  logo: { url: string; status: string; source: string } | null;
  /** mark/v2 (#97): what kind of thing it is, each word once, in the order its is_a claims were found */
  type_words?: string[];
  read_at: string;
}

/** The maps, their pictures, keys and readings in the view whose hash is given (the person's: lib/viewer-view.ts). */
export const mapList = (view: string) =>
  api<{ maps: MapCard[] }>(`/api/v1/maps?${viewQuery(view)}`);
export const mapOne = (id: string, view: string) =>
  api<{ map: MapCard }>(`/api/v1/maps/${encodeURIComponent(id)}?${viewQuery(view)}`);

/** A map's page (the id holds colons, so it's encoded). */
export const mapHref = (id: string) => `/m/${encodeURIComponent(id)}`;

/** Who made a reading, in people's words. */
export const makerWords = (by: string | null) =>
  by === 'mapping.petals.near' ? "Petals' own mapping" : by;

const oneLine = (date: string) => date.replaceAll(' ', ' ');

/** A map as a tile: its name; its address, shortened, when it has one; how many readings when more than one; its newest date. */
export function mapTile(m: MapCard) {
  const n = m.readings.length;
  const newest = m.readings[0]?.as_of;
  return {
    title: viewName(m),
    where: [
      m.address ? shortId(m.address) : null,
      n > 1 ? `${n} readings` : null,
      newest ? oneLine(dateLabel(newest)) : null,
    ]
      .filter(Boolean)
      .join('   /   '),
    badge: chainLabel(m.chain),
    image: m.picture,
    href: mapHref(m.id),
  };
}

/** One key for the maps' pictures. */
export const mapsKeys = (maps: readonly Pick<MapCard, 'keys'>[]): LegendKey[] =>
  oneKey(maps.map((m) => keysOf(m.keys)));

/** One key for every drawing on a map's page. */
export const drawingsKeys = (m: MapCard): LegendKey[] =>
  oneKey(m.readings.flatMap((r) => r.drawings.map((d) => keysOf(d.keys))));

/** A reading's line: what it read, when, how many, and who made it. */
export function readingLine(r: MapReading): string {
  return [
    r.title,
    oneLine(dateLabel(r.as_of)),
    r.count === null ? null : `${r.count.toLocaleString('en-US')} accounts`,
    makerWords(r.made_by),
  ]
    .filter(Boolean)
    .join('   ·   ');
}

/** A drawing as a tile on its map's page: it opens the drawing. */
export const drawingTile = (m: MapCard, r: MapReading, d: MapDrawing) => ({
  title: d.name ? viewName({ name: d.name, title: r.title }) : r.title,
  where: oneLine(dateLabel(r.as_of)),
  badge: chainLabel(m.chain),
  image: d.picture,
  href: d.view_url,
});

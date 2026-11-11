// Server only. The map's data (specs/006-the-map, plan, bench v2; coordinator/one-source.md, step 5): the one
// shared map, read live from GET /api/v1/map in the person's view (Elco's go, 10 Nov: the lab and Petals'
// agent see the same map), joined to the places in the address book, the connections between them, and each
// flower's name and mark. The Power Map (/map) places one flower per map, an address with all its readings;
// the lab's bench places every drawing. A view the address book doesn't have yet gets a place worked out
// here, and nobody else moves. Only what a drawing needs goes to the browser.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { FlowerReading } from '../flower/model.ts';
import { api } from '../lib/api.ts';
import { repoRoot } from '../lib/config.ts';
import { chainLabel, type LegendKey } from '../lib/flower-view.ts';
import { type MapMark, mapList, mapsKeys } from '../lib/maps.ts';
import { viewQuery } from '../lib/person-view.ts';
import {
  LOGOS_DIR,
  linksOf,
  logoFile,
  NIGHT_FIXTURE,
  type Night,
  type NightView,
  PLACES_FILE,
  seedsOf,
} from './night.ts';
import { type Continent, type Place, type Places, placeFlowers } from './places.ts';
import { type Road, roadsBetween } from './roads.ts';

/** A flower's mark: its logo when Trust Wallet's list has one, and always its token symbol. */
export interface Mark {
  logo: string | null;
  symbol: string;
  /** what kind of thing it is, each word once (#97), from its map's card */
  types?: readonly string[];
}

export interface BenchFlower {
  name: string;
  mark: Mark;
  place: Place;
  reading: FlowerReading;
  /** the map it stands for, an address, when the live map says */
  map: string | null;
  /** its reading's snapshot, the relations index's name for its group */
  snapshot?: string;
  /** how many proposals its map has (#93): a flower with any draws its vote ring up close */
  proposals?: number;
}

export interface BenchChain {
  chain: string;
  label: string;
  continent: Continent;
}

export interface BenchLandscape {
  flowers: BenchFlower[];
  roads: Road[];
  chains: BenchChain[];
  /** the colours its maps paint, as their cards' keys give them: the legend's (#92) */
  keys?: LegendKey[];
}

/** A name is cut here, so no name is wider than a flower's room. */
const NAME_MOST = 28;
/** "SYM holders, Chain", "SYM active holders, Chain", "SYM delegates": the role and the symbol. */
const TITLE = /^(\S+) ((?:active )?holders|delegates)\b/;

const cut = (s: string) => (s.length > NAME_MOST ? `${s.slice(0, NAME_MOST - 1).trimEnd()}…` : s);

/** The run's name for a view, without its notes in brackets; "Jito / JTO" is Jito. */
function shortName(v: NightView): string {
  const plain = v.name.replace(/\s*\([^)]*\)/g, '').trim();
  const [before] = plain.split(' / ');
  return (before ?? plain).trim() || v.reading.title;
}

/** Its token symbol: after the slash in the run's name, else the first word of its title, else a letter. */
function symbolOf(v: NightView, name: string): string {
  const slash = v.name
    .replace(/\s*\([^)]*\)/g, '')
    .split(' / ')[1]
    ?.trim();
  if (slash) return slash;
  const m = TITLE.exec(v.reading.title);
  if (m?.[1] && m[1] !== 'SPL') return m[1];
  return (name[0] ?? '?').toUpperCase();
}

/** A view as GET /api/v1/map gives it (SYSTEMS, 10 Nov). */
interface LiveView {
  sha: string;
  name: string | null;
  title: string;
  network: string;
  chain: string;
  address: string | null;
  count: number | null;
  as_of: string;
  snapshot: string;
  /** the map it's on: its reading's address (core's mapOf), as GET /api/v1/maps groups them */
  map: string;
  reading: NightView['reading'];
}

/**
 * One drawing per map, as GET /api/v1/maps makes each card: the map's newest drawing, by the list's order,
 * named by its newest drawing that has a name.
 */
export function oneEach(views: readonly LiveView[]): LiveView[] {
  const byMap = new Map<string, LiveView[]>();
  for (const v of views) byMap.set(v.map, [...(byMap.get(v.map) ?? []), v]);
  return [...byMap.values()].map((drawn) => {
    const newest = drawn.at(-1) as LiveView;
    return { ...newest, name: drawn.findLast((v) => v.name)?.name ?? null };
  });
}

type LiveMap = Omit<Night, 'views'> & { views: LiveView[] };

/** The live map in the view whose hash is given, as GET /api/v1/map gives it. */
async function liveMap(view: string): Promise<LiveMap | { error: string }> {
  const got = await api<LiveMap>(`/api/v1/map?${viewQuery(view)}`);
  return got.ok ? got.value : { error: got.error.message };
}

/** In the shape the bench's fixture has: a view without a name from the run takes its title. */
function nightOf({ views, ...rest }: LiveMap): Night {
  return {
    ...rest,
    run: 'GET /api/v1/map',
    views: views.map((v) => ({
      sha: v.sha,
      name: v.name ?? v.title,
      chain: v.chain,
      address: v.address ?? '',
      reader: v.network,
      count: v.count === null ? '' : String(v.count),
      status: '',
      as_of: v.as_of,
      snapshot: v.snapshot,
      map: v.map,
      reading: v.reading,
    })),
  };
}

/** The live map in the view whose hash is given, as the bench's fixture is. `each` keeps one drawing per map. */
export async function liveNight(
  view: string,
  each: 'drawing' | 'map' = 'drawing',
): Promise<Night | { error: string }> {
  const live = await liveMap(view);
  if ('error' in live) return live;
  return nightOf(each === 'map' ? { ...live, views: oneEach(live.views) } : live);
}

/** The night as the fixture holds it: what the tests read, with no network. */
export function fixtureNight(): Night {
  return JSON.parse(
    gunzipSync(readFileSync(join(repoRoot(), NIGHT_FIXTURE))).toString('utf8'),
  ) as Night;
}

/** The lab's bench, from the live map: every drawing, in the view whose hash is given. */
export async function benchLandscape(view: string): Promise<BenchLandscape | { error: string }> {
  const night = await liveNight(view);
  return 'error' in night ? night : landscapeOf(night);
}

/**
 * The map's flowers named and marked by their maps' own marks (#85), with the colours the maps paint for the
 * legend (#92), from the maps' cards; as they were without.
 */
async function marked(land: BenchLandscape, view: string): Promise<BenchLandscape> {
  const cards = await mapList(view);
  if (!cards.ok) return land;
  const maps = cards.value.maps;
  const marks = withMarks(land, new Map(maps.map((c) => [c.id, c.mark])));
  const counts = new Map(maps.map((c) => [c.id, c.proposals?.count ?? 0]));
  return { ...withProposals(marks, counts), keys: mapsKeys(maps) };
}

/** Each flower with how many proposals its map's card counts (#93), where it counts any. */
export function withProposals(
  land: BenchLandscape,
  counts: ReadonlyMap<string, number>,
): BenchLandscape {
  return {
    ...land,
    flowers: land.flowers.map((f) => {
      const n = f.map ? (counts.get(f.map) ?? 0) : 0;
      return n > 0 ? { ...f, proposals: n } : f;
    }),
  };
}

/** The Power Map: one flower per map, in the view whose hash is given (the person's: lib/viewer-view.ts). */
export async function powerMapLandscape(view: string): Promise<BenchLandscape | { error: string }> {
  const night = await liveNight(view, 'map');
  return 'error' in night ? night : marked(landscapeOf(night), view);
}

/**
 * The Power Map opened at one map (coordinator/one-source.md, step 6), by its address or by a reading of it
 * (a snapshot, as a flower's spec names it): the map, and which of its flowers is that map, or -1 when it
 * isn't on the map.
 */
export async function powerMapAt(
  view: string,
  at: { map: string } | { snapshot: string },
): Promise<{ land: BenchLandscape; focus: number } | { error: string }> {
  const live = await liveMap(view);
  if ('error' in live) return live;
  const map =
    'map' in at ? at.map : (live.views.find((v) => v.snapshot === at.snapshot)?.map ?? null);
  const land = await marked(landscapeOf(nightOf({ ...live, views: oneEach(live.views) })), view);
  return { land, focus: map === null ? -1 : land.flowers.findIndex((f) => f.map === map) };
}

/**
 * The map's flowers named and marked by their maps' own marks (#85, SYSTEMS's; for the far wave, #84: Elco, 11 Nov,
 * "a clear way for showing the logo and the name"): the organisation's name, its token's symbol and its logo,
 * where its card has them; what the flower had where it doesn't.
 */
export function withMarks(
  land: BenchLandscape,
  marks: ReadonlyMap<string, MapMark | null | undefined>,
): BenchLandscape {
  return {
    ...land,
    flowers: land.flowers.map((f) => {
      const m = f.map ? marks.get(f.map) : null;
      if (!m) return f;
      return {
        ...f,
        name: m.name ? cut(m.name.value) : f.name,
        mark: {
          logo: m.logo?.url ?? f.mark.logo,
          symbol: m.symbol?.value ?? f.mark.symbol,
          types: m.type_words ?? [],
        },
      };
    }),
  };
}

/** A map's flowers at their places: the address book's, and a new place for any view it doesn't have. */
export function landscapeOf(night: Night): BenchLandscape {
  const root = repoRoot();
  const saved = JSON.parse(readFileSync(join(root, PLACES_FILE), 'utf8')) as Places;
  const places = placeFlowers(seedsOf(night), linksOf(night), saved);
  const views = new Map(night.views.map((v) => [v.sha, v]));
  const placed = places.flowers.filter((p) => views.has(p.id));

  // Two flowers on one chain with the same name take their role from their titles: ENS delegates,
  // ENS active holders.
  const names = placed.map((p) => shortName(views.get(p.id) as NightView));
  const seen = new Map<string, number>();
  placed.forEach((p, i) => {
    const key = `${p.chain} ${names[i]}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  });

  const flowers = placed.map((place, i) => {
    const v = views.get(place.id) as NightView;
    let name = names[i] as string;
    const role = TITLE.exec(v.reading.title)?.[2];
    if ((seen.get(`${place.chain} ${name}`) ?? 0) > 1 && role) name = `${name} ${role}`;
    const file = logoFile(v.chain, v.address);
    const path = file ? join(root, LOGOS_DIR, file) : null;
    const logo =
      path && existsSync(path)
        ? `data:image/png;base64,${readFileSync(path).toString('base64')}`
        : null;
    return {
      name: cut(name),
      mark: { logo, symbol: symbolOf(v, name) },
      place,
      // On the map a flower's name is drawn under it, one way for all, so the flower draws no title.
      reading: { title: '', petals: v.reading.petals },
      map: v.map ?? null,
      snapshot: v.snapshot,
    };
  });
  return {
    flowers,
    roads: roadsBetween(placed, linksOf(night)),
    chains: places.continents
      .map((continent) => ({
        chain: continent.chain,
        label: chainLabel(continent.chain),
        continent,
      }))
      .sort(
        (a, b) =>
          placed.filter((p) => p.chain === b.chain).length -
          placed.filter((p) => p.chain === a.chain).length,
      ),
  };
}

// Server only. The map bench's data (specs/006-the-map, plan, bench v2): the one shared map, read live from
// GET /api/v1/map (Elco's go, 10 Nov: the lab and Petals' agent see the same map), joined to the places in
// the address book, the connections between them, and each flower's name and mark. A view the address book
// doesn't have yet gets a place worked out here, and nobody else moves. Only what a drawing needs goes to the
// browser.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { FlowerReading } from '../../flower/model.ts';
import {
  LOGOS_DIR,
  linksOf,
  logoFile,
  NIGHT_FIXTURE,
  type Night,
  type NightView,
  PLACES_FILE,
  seedsOf,
} from '../../landscape/night.ts';
import { type Continent, type Place, type Places, placeFlowers } from '../../landscape/places.ts';
import { type Road, roadsBetween } from '../../landscape/roads.ts';
import { api } from '../../lib/api.ts';
import { repoRoot } from '../../lib/config.ts';
import { chainLabel } from '../../lib/flower-view.ts';

/** A flower's mark: its logo when Trust Wallet's list has one, and always its token symbol. */
export interface Mark {
  logo: string | null;
  symbol: string;
}

export interface BenchFlower {
  name: string;
  mark: Mark;
  place: Place;
  reading: FlowerReading;
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
  reading: NightView['reading'];
}

/** The live map, in the shape the bench's fixture has: a view without a name from the run takes its title. */
export async function liveNight(): Promise<Night | { error: string }> {
  const got = await api<Omit<Night, 'views'> & { views: LiveView[] }>('/api/v1/map');
  if (!got.ok) return { error: got.error.message };
  const { views, ...rest } = got.value;
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
      reading: v.reading,
    })),
  };
}

/** The night as the fixture holds it: what the tests read, with no network. */
export function fixtureNight(): Night {
  return JSON.parse(
    gunzipSync(readFileSync(join(repoRoot(), NIGHT_FIXTURE))).toString('utf8'),
  ) as Night;
}

/** The bench, from the live map. */
export async function benchLandscape(): Promise<BenchLandscape | { error: string }> {
  const night = await liveNight();
  return 'error' in night ? night : landscapeOf(night);
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

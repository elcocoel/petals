// Server only. The map bench's data (specs/006-the-map, plan, bench v2): the night's views from the
// fixture, joined to their places in the address book, the connections between them, and each flower's
// name and mark. Only what a drawing needs goes to the browser.
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
} from '../../landscape/night.ts';
import type { Continent, Place, Places } from '../../landscape/places.ts';
import { type Road, roadsBetween } from '../../landscape/roads.ts';
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

export function benchLandscape(): BenchLandscape {
  const root = repoRoot();
  const night = JSON.parse(
    gunzipSync(readFileSync(join(root, NIGHT_FIXTURE))).toString('utf8'),
  ) as Night;
  const places = JSON.parse(readFileSync(join(root, PLACES_FILE), 'utf8')) as Places;
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

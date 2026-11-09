// node apps/web/scripts/landscape-places.ts: the map's address book (specs/006-the-map, places/v1). Places every
// flower in the bench's fixture on its chain's continent, by the accounts it shares with the others, and
// writes apps/web/lab/map/places.json. A flower that already has a place there keeps it; only new flowers
// are placed. Add --fresh to place everything again from nothing.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { linksOf, NIGHT_FIXTURE, type Night, PLACES_FILE, seedsOf } from '../landscape/night.ts';
import { type Places, placeFlowers } from '../landscape/places.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const fresh = process.argv.includes('--fresh');
const night = JSON.parse(
  gunzipSync(readFileSync(join(root, NIGHT_FIXTURE))).toString('utf8'),
) as Night;
const path = join(root, PLACES_FILE);
const before =
  !fresh && existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Places) : undefined;

const seeds = seedsOf(night);
const links = linksOf(night);
const places = placeFlowers(seeds, links, before);
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, `${JSON.stringify(places, null, 2)}\n`);
const kept = before
  ? places.flowers.filter((p) => before.flowers.some((b) => b.id === p.id)).length
  : 0;
process.stdout.write(
  `${places.flowers.length} flowers on ${places.continents.length} continents (${kept} kept, ${places.flowers.length - kept} placed), ${links.length} links -> ${PLACES_FILE}\n`,
);

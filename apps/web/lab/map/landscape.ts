// Server only. The map bench's data (specs/006-the-map, plan): the night's views from the fixture, joined
// to their places in the address book, and the roads between them. Only what a drawing needs goes to the
// browser: each flower's title, place and reading.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { Home } from '../../flower/camera.ts';
import type { FlowerReading } from '../../flower/model.ts';
import { linksOf, NIGHT_FIXTURE, type Night, PLACES_FILE } from '../../landscape/night.ts';
import { type Continent, homeOf, type Place, type Places } from '../../landscape/places.ts';
import { type Road, roadsBetween } from '../../landscape/roads.ts';
import { repoRoot } from '../../lib/config.ts';
import { chainLabel } from '../../lib/flower-view.ts';

export interface BenchFlower {
  title: string;
  place: Place;
  reading: FlowerReading;
}

export interface BenchLandscape {
  flowers: BenchFlower[];
  roads: Road[];
  continents: Continent[];
  continentNames: string[];
  home: Home;
}

export function benchLandscape(): BenchLandscape {
  const root = repoRoot();
  const night = JSON.parse(
    gunzipSync(readFileSync(join(root, NIGHT_FIXTURE))).toString('utf8'),
  ) as Night;
  const places = JSON.parse(readFileSync(join(root, PLACES_FILE), 'utf8')) as Places;
  const views = new Map(night.views.map((v) => [v.sha, v]));
  const placed = places.flowers.filter((p) => views.has(p.id));
  const flowers = placed.map((place) => {
    const v = views.get(place.id) as Night['views'][number];
    return {
      title: v.reading.title,
      place,
      reading: { title: v.reading.title, petals: v.reading.petals },
    };
  });
  return {
    flowers,
    roads: roadsBetween(placed, linksOf(night)),
    continents: places.continents,
    continentNames: places.continents.map((c) => chainLabel(c.chain)),
    home: homeOf(places),
  };
}

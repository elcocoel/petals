// The Power Map on the landing (Elco, 9 Nov: "instead of these shitty place holders let's see how to put the
// actual map here - research yesterday grabbed data for SEVERAL DAOs"). Nine views of the one shared map, by
// their hash, each with the picture the server draws for it in the default view, its address and its colours
// (GET /api/v1/map/views; Elco, 10 Nov, fix 2: the landing reads the map). The list is read at most hourly.
// A view that isn't on the map is left out. Titles and counts are the night run's own.

import { hourly } from './api.ts';
import { type LegendKey, oneKey } from './flower-view.ts';
import { type MapViewRow, rowKeys } from './map-views.ts';
import { mapHref } from './maps.ts';

export interface PowerMapView {
  sha: string;
  title: string;
  where: string;
  badge: string;
}

export const POWER_MAP: readonly PowerMapView[] = [
  {
    sha: '37def7bc0670b27a8d5145cdcef00eea579539ca07fd485bb582b4abffe6e49f',
    title: 'NEAR validators',
    where: '371 validators',
    badge: 'NEAR',
  },
  {
    sha: 'adbe90223b1db8f3476514d87027266196752759837b8948e586d15857f0cfd3',
    title: 'NEAR House of Stake',
    where: '507 veNEAR accounts',
    badge: 'NEAR',
  },
  {
    sha: '3e4bf8dba273d73fe1ce9061fc9fe6f15fe9c024d7a175357924c8bbf5ce3cac',
    title: 'ENS delegates',
    where: '8,561 delegates',
    badge: 'Ethereum',
  },
  {
    sha: '5ea0a48c55ae0b33057aaa77855dd5d27e70492bc0c926ef8e020dd1472edefb',
    title: 'Uniswap delegates',
    where: '21,919 delegates',
    badge: 'Ethereum',
  },
  {
    sha: '6c2bb46decd6c8a0d48a0efd5ea7ddd8f612a303799380eca131fb00bb6f98d5',
    title: 'Compound delegates',
    where: '4,283 delegates',
    badge: 'Ethereum',
  },
  {
    sha: 'dce5fa4984305c6a45335d8d42cd8562654fc026a72bcbb9c4918221306e91ab',
    title: 'Beanstalk, block 14,602,790',
    where: '2,036 voters',
    badge: 'Ethereum',
  },
  {
    sha: '78467e34ff252b1871a74706516bac0fb71fcfa3309b3f75db7f1bb64ad3250f',
    title: 'RaidGuild',
    where: '158 members',
    badge: 'Gnosis',
  },
  {
    sha: '0d19511cccd6601d059edca1d082fcf004cf8fed030f8f6e49b04cd47ef483fa',
    title: 'MetaCartel',
    where: '86 members',
    badge: 'Ethereum',
  },
  {
    sha: '0315b4b810fb5b5ebde03cdde4fb7b55d0f503bb2ebdc9ebb7d16641475c43ba',
    title: 'Jito',
    where: '89,708 holders',
    badge: 'Solana',
  },
];

export interface PowerMapTile extends PowerMapView {
  image: string;
  href: string;
  /** the colours its picture paints */
  keys: LegendKey[];
}

/** The hero's flower (Elco, 10 Nov: the landing's first flower in the one look): NEAR's validators, the map's one flower coloured all the way round today. */
export const HERO_SHA = '37def7bc0670b27a8d5145cdcef00eea579539ca07fd485bb582b4abffe6e49f';

/** One key for a set of tiles: each colour any of them paints, once. */
export const powerMapKeys = (tiles: readonly PowerMapTile[]) => oneKey(tiles.map((t) => t.keys));

/** The tiles for these views, from the map's rows. */
export function tilesOf(rows: readonly MapViewRow[]): PowerMapTile[] {
  const bySha = new Map(rows.map((r) => [r.sha, r]));
  return POWER_MAP.flatMap((view) => {
    const row = bySha.get(view.sha);
    // A tile opens its map's page, as the Power Map's cards do.
    const href = row?.map ? mapHref(row.map) : row?.view_url;
    return row && href ? [{ ...view, image: row.picture, href, keys: rowKeys(row) }] : [];
  });
}

export async function powerMapTiles(): Promise<PowerMapTile[]> {
  try {
    const res = await hourly('/api/v1/map/views');
    if (!res?.ok) return [];
    return tilesOf(((await res.json()) as { views: MapViewRow[] }).views);
  } catch {
    return [];
  }
}

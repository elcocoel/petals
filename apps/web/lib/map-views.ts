// The one shared map as a list (SYSTEMS, 10 Nov: GET /api/v1/map/views, Elco's fix 2): every view on the map,
// oldest first, with the picture the server draws for it in the default view and the address that opens it.
// The web uses both as given, so a view looks and opens the same everywhere it's listed.
import { api } from './api.ts';
import { chainLabel, dateLabel, keysOf, oneKey } from './flower-view.ts';

/** A row of GET /api/v1/map/views. */
export interface MapViewRow {
  sha: string;
  /** the mapping run's name for it, with its notes in brackets; null for a view made by hand */
  name: string | null;
  /** the reading's own title */
  title: string;
  network: string;
  chain: string;
  address: string | null;
  count: number | null;
  as_of: string;
  view_url: string;
  picture: string;
  /** the colours its picture draws: colour's keys, then the tail's, each { label, swatch: var(--k-…) } */
  keys: { label: string; swatch: string }[];
  made_by: string | null;
}

export const mapViewList = () => api<{ views: MapViewRow[] }>('/api/v1/map/views');

/** A view's name as people would say it: the run's name without its notes, "Jito / JTO" as Jito. */
export function viewName(v: Pick<MapViewRow, 'name' | 'title'>): string {
  const plain = (v.name ?? '').replace(/\s*\([^)]*\)/g, '').trim();
  return (plain.split(' / ')[0] ?? plain).trim() || v.title;
}

/** A view as a tile: its name, then the reading's own title when it says more, and its date; its chain. */
export function viewTile(v: MapViewRow) {
  const name = viewName(v);
  return {
    title: name,
    // A date stays on one line (design/minimally-good.md, rule 7).
    where: [v.title !== name ? v.title : null, dateLabel(v.as_of).replaceAll(' ', '\u00a0')]
      .filter(Boolean)
      .join('   /   '),
    badge: chainLabel(v.chain),
    image: v.picture,
    href: v.view_url,
  };
}

/** A row's colours as a key. */
export const rowKeys = (v: Pick<MapViewRow, 'keys'>) => keysOf(v.keys ?? []);

/** One key for a list of views: every colour their pictures draw, once. */
export function listKeys(views: readonly Pick<MapViewRow, 'keys'>[]) {
  return oneKey(views.map(rowKeys));
}

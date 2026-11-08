// The lobby (specs/004-workspace, W3): where a person's work sits when they come back. A skeleton, built so
// Elco can sense what's needed. Pure: its words and where each thing goes are decided here, and the view
// only lays them out. Every word below is a proposal, listed in design/journey-strings.md, "The lobby".
import { dateLabel, type ListedFlower, networkLabel } from './flower-view.ts';

export const lobbyWords = {
  /** What a screen reader hears for the page and for the menu. */
  page: 'Lobby',
  menu: 'Your work',
  /** The menu's bar, and the way to a new conversation: the words the workspace's list box already uses. */
  conversations: 'Conversations',
  newConversation: 'New',
  /** Where folders go once SYSTEMS has them (W4). Until then the space is there with nothing in it. */
  folders: 'Folders',
  /** The flowers on the shared map, each opening on the canvas. */
  map: 'On the map',
  /** Folding the menu away, and bringing it back. */
  fold: 'Hide',
  unfold: 'Menu',
} as const;

/** A flower on the map as the lobby shows it: the gallery's tile, opening in the workspace. */
export interface MapTile {
  key: string;
  title: string;
  where: string;
  badge: string;
  image: string;
  href: string;
}

/** In the order the API lists them. A tile opens the flower on the canvas, as a stored flower. */
export function mapTiles(flowers: readonly ListedFlower[]): MapTile[] {
  return flowers.map((f) => ({
    key: `${f.where}:${f.id}`,
    title: f.title ?? f.id,
    // the gallery's own line and badge, so a flower reads the same in both
    where: `${networkLabel(f.network)}   /   ${dateLabel(f.as_of)}`,
    badge: f.where === 'map' ? 'on NEAR' : 'fixture',
    image: `/api/v1/flowers/${encodeURIComponent(f.id)}/svg`,
    href: `/make?stored=${encodeURIComponent(f.id)}`,
  }));
}

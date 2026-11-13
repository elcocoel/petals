// Where a new conversation starts: the readiest maps on the one shared map (GET /api/v1/maps; one map per
// address), offered by the page itself, not by the agent, so opening the app costs nothing and nothing written
// here poses as the agent or reaches the model.
import { viewName } from './map-views.ts';
import { type MapCard, mapHref } from './maps.ts';

/** A map's size: its largest reading's count of accounts. */
const sizeOf = (m: Pick<MapCard, 'readings'>) =>
  Math.max(0, ...m.readings.map((r) => r.count ?? 0));

const MAX_SHOWN = 3;

/**
 * What's offered as already mapped, in the first message and on /make's shelf alike: maps, one per address
 * the largest first, as the readiest first cases. Two maps that read the same name are
 * offered once, the larger (else two 'Marinade MNDE deposits and lock schedules' sit side by side).
 */
export function firstCases<M extends Pick<MapCard, 'readings' | 'name' | 'title'>>(
  maps: readonly M[],
): M[] {
  const seen = new Set<string>();
  return [...maps]
    .sort((a, b) => sizeOf(b) - sizeOf(a))
    .filter((m) => {
      const name = viewName(m).toLowerCase();
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    })
    .slice(0, MAX_SHOWN);
}

/** An empty conversation's own words: the page's, not the agent's (components/chat/NewConversation.tsx). */
export const newConversationWords = {
  heading: 'What are you curious about?',
  powerMap: 'The whole Power Map',
} as const;

/** Where an empty conversation offers to start: the readiest maps, then the whole Power Map. */
export function newConversationStarts(maps: readonly MapCard[]): { label: string; href: string }[] {
  return [
    ...firstCases(maps).map((m) => ({ label: viewName(m), href: mapHref(m.id) })),
    { label: newConversationWords.powerMap, href: '/map' },
  ];
}

/** The room beside the conversation while the Power Map is on its way (megabytes). */
export const groundWords = { opening: 'Opening the Power Map…' } as const;

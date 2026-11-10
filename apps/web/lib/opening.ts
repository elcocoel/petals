// What the agent says first (M-Talk). Written text with real maps from the one shared map (GET /api/v1/maps;
// Elco, 10 Nov: one map per address), not a model call: a person opening the app should cost nothing. It
// goes to the model with the first question, so the agent knows what it already said.
import { viewName } from './map-views.ts';
import { type MapCard, mapHref } from './maps.ts';

/** A map's size: its largest reading's count of accounts. */
const sizeOf = (m: Pick<MapCard, 'readings'>) =>
  Math.max(0, ...m.readings.map((r) => r.count ?? 0));

const MAX_SHOWN = 3;

/**
 * What's offered as already mapped, in the first message and on /make's shelf alike: maps, one per address
 * (Elco, 10 Nov), the largest first, as the readiest first cases.
 */
export function firstCases<M extends Pick<MapCard, 'readings'>>(maps: readonly M[]): M[] {
  return [...maps].sort((a, b) => sizeOf(b) - sizeOf(a)).slice(0, MAX_SHOWN);
}

export function openingMessage(maps: readonly MapCard[]): string {
  const links = firstCases(maps).map(
    (m) => `[${viewName(m).replace(/[[\]]/g, '')}](${mapHref(m.id)})`,
  );
  const mapped = links.length
    ? `Or start from what's already mapped: ${links.join(', ')}, or the whole [Power Map](/gallery).`
    : '';
  return [
    "Hi. I'm Petals. I dig into who holds power in a network, then draw what I find as a flower.",
    'Give me somewhere to start: a DAO, a token or a contract address. Moloch DAO and UNI on Base are good first cases.',
    mapped,
    'What are you curious about?',
  ]
    .filter(Boolean)
    .join('\n\n');
}

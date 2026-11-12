// Search on the Power Map (#105; Elco, 11 Nov: "search with the embedding model on the server being super smart to
// find shit all sorts of different ways"): what GET /api/v1/search answers, as the rows the chain list shows in
// its place while something's typed. One row per map on this map, with what matched under it (a proposal, what
// Petals' mapping says); the rest of what search finds (a person's own work, a claim about no map here) isn't a
// place on this map, so it's left out. Words are drafts for Elco.

/** One answer, as GET /api/v1/search gives it (search-petals.ts, SearchAnswer). */
export interface SearchAnswer {
  kind: string;
  id: string;
  title: string;
  about?: string | null;
  /** the words around the match, in pieces, each saying whether it matched */
  snippet?: { text: string; hit: boolean }[];
  matched?: { kind: string; id: string; title: string }[];
}

export interface SearchBody {
  results: SearchAnswer[];
  meaning?: 'on' | 'off';
  says?: string;
}

/** A row: the map's flower, by its place in the canvas's flowers, its name, its chain, and what matched. */
export interface SearchRow {
  at: number;
  map: string;
  name: string;
  chain: string;
  matched: string | null;
}

/** The search field's id: Cmd+K puts the cursor in it. */
export const MAP_SEARCH_ID = 'map-search';

export const mapSearchWords = {
  label: 'Search the map',
  placeholder: 'Search the map',
  ordering: 'Ordering by meaning…',
  searching: 'Searching…',
  none: 'Nothing on the map matches.',
  failed: "Search couldn't answer just now.",
  wordsOnly: 'By words alone: search by meaning is off right now.',
  kind: { proposal: 'Proposal', claim: 'Insights' } as Record<string, string>,
} as const;

/** What matched under a map, in a line: its kind, then its words. */
function matchedLine(m: { kind: string; title: string } | undefined): string | null {
  if (!m) return null;
  const kind = mapSearchWords.kind[m.kind];
  return kind ? `${kind} · ${m.title}` : m.title;
}

/** The answers that are maps on this map, as rows, in search's order. */
export function searchRows(
  body: SearchBody,
  flowers: readonly { name: string; map?: string | null | undefined; place: { chain: string } }[],
  chainLabel: (chain: string) => string,
): SearchRow[] {
  const at = new Map<string, number>();
  flowers.forEach((f, i) => {
    if (f.map && !at.has(f.map)) at.set(f.map, i);
  });
  return body.results.flatMap((r) => {
    if (r.kind !== 'map') return [];
    const i = at.get(r.id);
    const f = i === undefined ? undefined : flowers[i];
    if (i === undefined || !f) return [];
    return [
      {
        at: i,
        map: r.id,
        name: r.title || f.name,
        chain: chainLabel(f.place.chain),
        matched: matchedLine(r.matched?.[0]),
      },
    ];
  });
}

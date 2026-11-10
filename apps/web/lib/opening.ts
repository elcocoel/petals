// What the agent says first (M-Talk). Written text with real views from the one shared map (GET
// /api/v1/map/views; Elco's fix 2, 10 Nov: one map), not a model call: a person opening the app should cost
// nothing. It goes to the model with the first question, so the agent knows what it already said.
export interface OpeningView {
  title: string;
  /** the participants its snapshot holds */
  count: number;
  /** its flower on the site (/d/<sha>), the link Petals' agent gives too */
  view_url: string;
}

const MAX_SHOWN = 3;

/** The largest views first, as the readiest first cases; one per title. */
export function openingMessage(views: OpeningView[]): string {
  const seen = new Set<string>();
  const shown = [...views]
    .sort((a, b) => b.count - a.count)
    .filter((v) => {
      if (seen.has(v.title)) return false;
      seen.add(v.title);
      return true;
    })
    .slice(0, MAX_SHOWN);
  const links = shown.map((v) => `[${v.title.replace(/[[\]]/g, '')}](${v.view_url})`);
  const mapped = links.length
    ? `Or start from what's already mapped: ${links.join(', ')}, or the whole [gallery](/gallery).`
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

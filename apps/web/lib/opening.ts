// What the agent says first (M-Talk). Written text with real gallery entries, not a model call: a
// person opening the app should cost nothing. It goes to the model with the first question, so the
// agent knows what it already said.
export interface OpeningFlower {
  id: string;
  title: string | null;
  where: 'map' | 'fixture';
}

const MAX_SHOWN = 3;

export function openingMessage(flowers: OpeningFlower[]): string {
  const published = flowers.filter((f) => f.where === 'map');
  const shown = (published.length ? published : flowers).slice(0, MAX_SHOWN);
  const links = shown.map((f) => `[${(f.title ?? f.id).replace(/[[\]]/g, '')}](/f/${f.id})`);
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

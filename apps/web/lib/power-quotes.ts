// The illustrated power quotes, the approved selection of eighteen, shown wherever a screen is empty. The pictures are in
// public/quotes/, 960 px wide. Pure.

export interface PowerQuoteItem {
  id: string;
  quote: string;
  /** who said it, and where */
  author: string;
  image: string;
}

/** The quote's one control: the next quote in the list, round again after the last. */
export const quoteWords = { next: 'Another quote' } as const;

export const POWER_QUOTES: readonly PowerQuoteItem[] = [
  {
    id: '01-sunlight',
    quote: 'Sunlight is said to be the best of disinfectants.',
    author: "Louis Brandeis, Other People's Money (1914)",
    image: '/quotes/01-sunlight.webp',
  },
  {
    id: '02-watchers',
    quote: 'Who will guard the guards themselves?',
    author: 'Juvenal, Satires (c. 120 CE)',
    image: '/quotes/02-watchers.webp',
  },
  {
    id: '03-throne',
    quote: 'On the highest throne in the world, we still sit only on our own bottom.',
    author: 'Michel de Montaigne, Essays (1588)',
    image: '/quotes/03-throne.webp',
  },
  {
    id: '04-politics',
    quote: 'Politics: a strife of interests masquerading as a contest of principles.',
    author: "Ambrose Bierce, The Devil's Dictionary (1911)",
    image: '/quotes/04-politics.webp',
  },
  {
    id: '06-fish',
    quote:
      'Just as fish moving under water cannot possibly be found out either as drinking or not drinking water, so government servants... cannot be found out (while) taking money.',
    author: 'Kautilya, Arthashastra (c. 300 BCE)',
    image: '/quotes/06-fish.webp',
  },
  {
    id: '08-caesar',
    quote: 'Take care that thou art not made into a Caesar.',
    author: 'Marcus Aurelius, Meditations (c. 170 CE)',
    image: '/quotes/08-caesar.webp',
  },
  {
    id: '10-small-fish',
    quote:
      'Governing a large country is like frying a small fish. You spoil it with too much poking.',
    author: "Laozi, Tao Te Ching (Stephen Mitchell's translation)",
    image: '/quotes/10-small-fish.webp',
  },
  {
    id: '11-money',
    quote: "Money doesn't stink.",
    author: 'Emperor Vespasian, defending a tax on public toilets',
    image: '/quotes/11-money.webp',
  },
  {
    id: '12-magnetic',
    quote: 'It is not that power corrupts but that it is magnetic to the corruptible.',
    author: 'Frank Herbert, Chapterhouse: Dune (1985)',
    image: '/quotes/12-magnetic.webp',
  },
  {
    id: '13-candle',
    quote: 'To light a candle is to cast a shadow.',
    author: 'Ursula K. Le Guin, A Wizard of Earthsea (1968)',
    image: '/quotes/13-candle.webp',
  },
  {
    id: '14-grip',
    quote:
      'The more you tighten your grip, Tarkin, the more star systems will slip through your fingers.',
    author: 'Princess Leia, Star Wars (1977)',
    image: '/quotes/14-grip.webp',
  },
  {
    id: '15-feed-us',
    quote: 'Make us your slaves, but feed us.',
    author: 'The Grand Inquisitor, Fyodor Dostoevsky, The Brothers Karamazov (1880)',
    image: '/quotes/15-feed-us.webp',
  },
  {
    id: '16-sausages',
    quote: 'Laws are like sausages. It is better not to see them being made.',
    author:
      'Usually credited to Bismarck. The earliest version is the poet John Godfrey Saxe (1869).',
    image: '/quotes/16-sausages.webp',
  },
  {
    id: '18-water',
    quote: 'Do not, my friends, become addicted to water.',
    author: 'Immortan Joe, Mad Max: Fury Road (2015)',
    image: '/quotes/18-water.webp',
  },
  {
    id: '19-animals',
    quote: 'All animals are equal, but some animals are more equal than others.',
    author: 'George Orwell, Animal Farm (1945)',
    image: '/quotes/19-animals.webp',
  },
  {
    id: '21-feared-loved',
    quote:
      'Would I rather be feared or loved? Easy. Both. I want people to be afraid of how much they love me.',
    author: 'Michael Scott, The Office (2006)',
    image: '/quotes/21-feared-loved.webp',
  },
  {
    id: '22-equal-law',
    quote:
      'The law, in its majestic equality, forbids rich and poor alike to sleep under bridges, to beg in the streets, and to steal bread.',
    author: 'Anatole France, The Red Lily (1894)',
    image: '/quotes/22-equal-law.webp',
  },
  {
    id: '23-crew',
    quote: 'Crew expendable.',
    author: 'Special Order 937, Alien (1979)',
    image: '/quotes/23-crew.webp',
  },
];

/** One quote for a seed, any whole number: the same seed, the same quote. */
export function quoteFor(seed: number): PowerQuoteItem {
  const n = POWER_QUOTES.length;
  return POWER_QUOTES[((Math.trunc(seed) % n) + n) % n] as PowerQuoteItem;
}

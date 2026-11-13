// The landing map plays a fixed set of moves by itself, each with its card; nobody steers it there, and a click
// opens the Power Map.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { landingCopy } from '../lib/landing-copy.ts';
import { cardOf, LANDING_TOUR, type TourData, tourOn } from '../lib/landing-tour.ts';

const text = (f: string) => readFileSync(join(import.meta.dirname, '..', f), 'utf8');

test('the map plays only the moves whose maps it has', () => {
  const all = new Set(
    LANDING_TOUR.flatMap((m) =>
      'map' in m.show
        ? [m.show.map]
        : 'proposal' in m.show
          ? [m.show.proposal.map]
          : 'line' in m.show
            ? [...m.show.line]
            : [],
    ),
  );
  expect(tourOn(all)).toHaveLength(LANDING_TOUR.length);
  // without Solana's maps, its moves drop out; a wallet's move needs no map
  const noSolana = new Set([...all].filter((id) => !id.startsWith('solana:')));
  const moves = tourOn(noSolana);
  expect(moves.length).toBeLessThan(LANDING_TOUR.length);
  expect(moves.some((m) => 'wallet' in m.show)).toBe(true);
  expect(tourOn(new Set())).toEqual(LANDING_TOUR.filter((m) => 'wallet' in m.show));
});

test('the section: the map to the window, the whole of it and the button over it open the Power Map', () => {
  const section = text('components/landing/GallerySection.tsx');
  expect(section).toMatch(/left-1\/2 -mb-page-inset w-screen -translate-x-1\/2/);
  expect(section).toMatch(
    /<LandingMap into=\{\{ href: siteLinks\.map, label: copy\.open, cards: copy\.cards \}\} \/>/,
  );
  const map = text('components/landing/LandingMap.tsx');
  expect(map).toMatch(/<CoverLink href=\{into\.href\} label=\{into\.label\} \/>/);
  // the card and the button share the foot, which lets a press through to the map's link but on the button
  expect(map).toMatch(/className="pointer-events-none absolute inset-x-0 bottom-0 /);
  expect(map).toMatch(
    /<div className="pointer-events-auto md:col-start-2 md:justify-self-center">/,
  );
  // the card is a box over the map: the map's names keep clear of it
  expect(map).toMatch(/<section\s+data-float=""\s+data-b="box"\s+data-kind="float"/);
  expect(text('components/ui/CoverLink.tsx')).toMatch(
    /<span className="sr-only">\{label\}<\/span>/,
  );
  expect(text('viewmodels/useTour.ts')).toMatch(/prefers-reduced-motion: reduce/);
});

test('every move has its own card, and the copy has one for each', () => {
  const cards = landingCopy.gallery.cards;
  expect(Object.keys(cards)).toHaveLength(7);
  expect(new Set(LANDING_TOUR.map((m) => m.card))).toEqual(new Set(Object.keys(cards)));
  expect(LANDING_TOUR).toHaveLength(7);
});

test("a card's numbers are the map's own: a line's shared wallets, a flower's biggest share", () => {
  const cards = landingCopy.gallery.cards;
  const [ref, , refBoard, wallet, trump, trumpRender] = LANDING_TOUR;
  if (!ref || !refBoard || !wallet || !trump || !trumpRender)
    throw new Error('the tour lost a move');
  const ids = (m: typeof ref) =>
    'line' in m.show ? m.show.line : 'map' in m.show ? [m.show.map] : [];
  const [refId, boardId] = ids(refBoard);
  const [trumpId, renderId] = ids(trumpRender);
  const flower = (map: string | undefined, shares: number[] = [0.1]) => ({
    map: map ?? null,
    reading: { petals: shares.map((share) => ({ share })) },
  });
  const data: TourData = {
    flowers: [
      flower(refId),
      flower(boardId),
      flower(trumpId, [0.057, 0.718133, 0.04]),
      flower(renderId),
    ],
    roads: [
      { a: 1, b: 0, shared: 13 },
      { a: 2, b: 3, shared: 1570 },
    ],
  };
  expect(cardOf(refBoard, cards, data)).toBe(
    '13 wallets sit in both Ref Finance and its community board.',
  );
  expect(cardOf(trumpRender, cards, data)).toBe('1,570 wallets hold both TRUMP and Render.');
  expect(cardOf(trump, cards, data)).toBe('OFFICIAL TRUMP on Solana: one wallet holds 72%.');
  // words with nothing to fill are said as written
  expect(cardOf(ref, cards, data)).toBe(cards.ref);
  expect(cardOf(wallet, cards, data)).toBe(cards.wallet);
  // a number the map doesn't have: no card
  expect(cardOf(refBoard, cards, { ...data, roads: [] })).toBeNull();
});

// The landing map plays a fixed set of moves by itself; nobody steers it there, and a click opens the Power Map.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { LANDING_TOUR, tourOn } from '../lib/landing-tour.ts';

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
  expect(section).toMatch(/<LandingMap into=\{\{ href: siteLinks\.map, label: copy\.open \}\} \/>/);
  const map = text('components/landing/LandingMap.tsx');
  expect(map).toMatch(/<CoverLink href=\{into\.href\} label=\{into\.label\} \/>/);
  expect(text('components/ui/CoverLink.tsx')).toMatch(/aria-label=\{label\} tabIndex=\{-1\}/);
  expect(text('viewmodels/useTour.ts')).toMatch(/prefers-reduced-motion: reduce/);
});

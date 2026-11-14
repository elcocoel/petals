'use client';
// The Power Map on the landing: the same live map as /map, lying on the page with no box around it, its chains down
// its left. It loads once it's near the window (viewmodels/useLandingMap). Inside a page that scrolls, scrolling goes
// on past it; a pinch, or the wheel with Ctrl or ⌘, zooms it (LandscapeCanvas's inPage).
//
// With `into`, it plays lib/landing-tour.ts's moves while it's on the screen, each with its card right above the
// button over its foot, and the whole of it is a link into the Power Map, so nobody steers it here.
import { useMemo, useRef } from 'react';
import { LandscapeCanvas } from '../../landscape/LandscapeCanvas.tsx';
import { cardOf, type TourCard, tourOn } from '../../lib/landing-tour.ts';
import { useLandingMap } from '../../viewmodels/useLandingMap.ts';
import { useTour } from '../../viewmodels/useTour.ts';
import { Button } from '../ui/Button.tsx';
import { CoverLink } from '../ui/CoverLink.tsx';

export function LandingMap({
  into,
}: {
  into?: { href: string; label: string; cards: Readonly<Record<TourCard, string>> };
} = {}) {
  const frame = useRef<HTMLDivElement>(null);
  const map = useLandingMap(frame);
  const moves = useMemo(
    () =>
      into && map.state === 'ready'
        ? tourOn(new Set(map.land.flowers.flatMap((f) => (f.map ? [f.map] : []))))
        : [],
    [into, map],
  );
  const move = useTour(moves, frame);
  const card = into && move && map.state === 'ready' ? cardOf(move, into.cards, map.land) : null;
  return (
    <div
      ref={frame}
      className={`relative w-full overflow-hidden ${into ? 'aspect-square md:aspect-21/9' : 'aspect-square md:aspect-16/9'}`}
    >
      {map.state === 'ready' && (
        <LandscapeCanvas
          data={map.land}
          fill="area"
          inPage
          {...(into ? { show: move?.show } : {})}
        />
      )}
      {map.state === 'failed' && (
        <p className="error m-0 p-block-gap">The map couldn't be read: {map.error}</p>
      )}
      {/* the whole map opens the Power Map; the button over it says so, and is the one a keyboard reaches */}
      {into && <CoverLink href={into.href} label={into.label} />}
      {into && (
        // the foot: the move's card, then right under it the button, the way in
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-space-8 p-block-gap md:p-page-inset">
          {card && (
            // the landing's own card (PlateLink's paper box), rising in with each move; a box over the map, so the
            // map's names keep clear of it (data-float), and a press goes through it to the map's link
            <section
              key={card}
              data-float=""
              data-b="box"
              data-kind="plate"
              className="w-full max-w-conversation-width border border-hairline p-block-gap"
            >
              <p className="m-0 type-body text-primary md:type-lead">{card}</p>
            </section>
          )}
          <div className="pointer-events-auto">
            <Button href={into.href} arrow>
              {into.label}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

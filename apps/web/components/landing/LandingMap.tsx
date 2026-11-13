'use client';
// The Power Map on the landing: the same live map as /map, lying on the page with no box around it, its chains down
// its left. It loads once it's near the window (viewmodels/useLandingMap). Inside a page that scrolls, scrolling goes
// on past it; a pinch, or the wheel with Ctrl or ⌘, zooms it (LandscapeCanvas's inPage).
//
// With `into`, it plays lib/landing-tour.ts's moves while it's on the screen, and the whole of it is a link into the
// Power Map, so nobody steers it here.
import { useMemo, useRef } from 'react';
import { LandscapeCanvas } from '../../landscape/LandscapeCanvas.tsx';
import { tourOn } from '../../lib/landing-tour.ts';
import { useLandingMap } from '../../viewmodels/useLandingMap.ts';
import { useTour } from '../../viewmodels/useTour.ts';
import { CoverLink } from '../ui/CoverLink.tsx';

export function LandingMap({ into }: { into?: { href: string; label: string } } = {}) {
  const frame = useRef<HTMLDivElement>(null);
  const map = useLandingMap(frame);
  const moves = useMemo(
    () =>
      into && map.state === 'ready'
        ? tourOn(new Set(map.land.flowers.flatMap((f) => (f.map ? [f.map] : []))))
        : [],
    [into, map],
  );
  const show = useTour(moves, frame);
  return (
    <div
      ref={frame}
      className={`relative w-full overflow-hidden ${into ? 'aspect-square md:aspect-21/9' : 'aspect-square md:aspect-16/9'}`}
    >
      {map.state === 'ready' && (
        <LandscapeCanvas data={map.land} fill="area" inPage {...(into ? { show } : {})} />
      )}
      {map.state === 'failed' && (
        <p className="error m-0 p-block-gap">The map couldn't be read: {map.error}</p>
      )}
      {/* the whole map opens the Power Map; the button over it says so, and is the one a keyboard reaches */}
      {into && <CoverLink href={into.href} label={into.label} />}
    </div>
  );
}

'use client';
// The Power Map on the landing (Elco, 10 Nov: "this should be the global map not a bunch of digusting
// squares"): the same live map as /map, lying on the page with no box around it (Elco, 12 Nov: "sitting in a
// box is not cool"), with its chains down its left. It loads
// once it's near (viewmodels/useLandingMap). Inside a page that scrolls, scrolling goes on past it; a pinch,
// or the wheel with Ctrl or ⌘, zooms it (LandscapeCanvas's inPage).
import { useRef } from 'react';
import { LandscapeCanvas } from '../../landscape/LandscapeCanvas.tsx';
import { useLandingMap } from '../../viewmodels/useLandingMap.ts';

export function LandingMap() {
  const frame = useRef<HTMLDivElement>(null);
  const map = useLandingMap(frame);
  return (
    <div ref={frame} className="relative aspect-square w-full overflow-hidden md:aspect-16/9">
      {map.state === 'ready' && <LandscapeCanvas data={map.land} fill="area" inPage />}
      {map.state === 'failed' && (
        <p className="error m-0 p-block-gap">The map couldn't be read: {map.error}</p>
      )}
    </div>
  );
}

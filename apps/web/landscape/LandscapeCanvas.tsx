'use client';
// The map, live (specs/006-the-map): an empty SVG for the map's scene and its live flowers to draw in,
// filling the window. Each flower's drawing model is made here from its reading, once.
import { useMemo, useRef } from 'react';
import type { Home } from '../flower/camera.ts';
import { type FlowerReading, modelOf } from '../flower/model.ts';
import type { Continent, Place } from './places.ts';
import type { Road } from './roads.ts';
import { type LandscapeData, useLandscape } from './useLandscape.ts';

export function LandscapeCanvas({
  data,
  probe = false,
}: {
  data: {
    flowers: { title: string; place: Place; reading: FlowerReading }[];
    roads: Road[];
    continents: Continent[];
    continentNames: string[];
    home: Home;
  };
  probe?: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const land = useMemo<LandscapeData>(
    () => ({
      ...data,
      flowers: data.flowers.map((f) => ({
        title: f.title,
        place: f.place,
        model: modelOf(f.reading),
      })),
    }),
    [data],
  );
  useLandscape(svg, land, probe);
  return (
    // surface.canvas
    <svg
      ref={svg}
      role="img"
      aria-label="Power Map"
      className="fixed inset-0 block size-full touch-none select-none bg-surface"
    />
  );
}

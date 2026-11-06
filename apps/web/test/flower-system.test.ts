// The ring's other order, and the flower's place in the system's behaviours.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Reading } from '@petal/core/types';
import { behaviours, parentOf, parents } from '@petal/tokens';
import { describe, expect, test } from 'vitest';
import { modelOf } from '../flower/model.ts';
import { scatter } from '../flower/order.ts';
import { widthBefore } from '../flower/ring.ts';

const GOLDEN = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'golden');
const reading: Reading = JSON.parse(
  readFileSync(join(GOLDEN, 'near-validators-default.reading.json'), 'utf8'),
).reading;

describe('?order=scatter', () => {
  test('is the same every time, from the ids alone, whatever order they came in', () => {
    const a = scatter(reading.petals).map((p) => p.id);
    expect(scatter(reading.petals).map((p) => p.id)).toEqual(a);
    expect(scatter([...reading.petals].reverse()).map((p) => p.id)).toEqual(a);
  });

  test('moves nobody out and changes no one', () => {
    const shuffled = scatter(reading.petals);
    expect(shuffled).toHaveLength(reading.petals.length);
    expect(new Set(shuffled)).toEqual(new Set(reading.petals));
    expect(reading.petals[0]?.rank).toBe(1);
  });

  test('spreads the big petals round the ring', () => {
    const shuffled = scatter(reading.petals);
    const places = reading.petals.slice(0, 8).map((p) => shuffled.indexOf(p));
    places.sort((a, b) => a - b);
    expect((places.at(-1) as number) - (places[0] as number)).toBeGreaterThan(30);
    expect(places).not.toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  test('draws the same petals, by the same rank', () => {
    const m = modelOf({ ...reading, petals: scatter(reading.petals) });
    const top = m.petals.findIndex((p) => p.rank === 1);
    expect(m.notes[top]).toContain(reading.petals[0]?.name);
    expect(m.order[0]).toBe(top);
    expect(widthBefore(m.ring, top, 100)).toBeGreaterThan(0);
  });
});

describe('the flower’s behaviours', () => {
  const FLOWER = [
    'surface.canvas',
    'figure.flower-ring',
    'figure.flower-silhouette',
    'figure.petal-wedge',
    'figure.petal-focus',
    'figure.petal-neighbour',
    'figure.petal-bands',
    'figure.account-opening',
    'figure.way-back-map',
    'figure.relations-sketch',
    'mark.petal-note',
    'mark.focus-note',
    'mark.band-label',
    'head.flower-title',
    'box.account-panel',
  ];
  const inTable = FLOWER.map((name) => behaviours.find((b) => b.name === name));

  test.each(FLOWER.map((name, i) => [name, inTable[i]] as const))(
    '%s is in the one table, under a known parent, a view, in one line',
    (name, b) => {
      expect(b, name).toBeDefined();
      expect(Object.keys(parents)).toContain(parentOf(name));
      expect(b?.via).toBe('view');
      expect(b?.purpose.length).toBeGreaterThan(10);
      expect(b?.purpose.length).toBeLessThanOrEqual(100);
      expect(b?.purpose).not.toContain('\n');
    },
  );
});

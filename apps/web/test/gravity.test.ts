// Gravity (Elco, 12 Nov walk: "we're unnecessarily hyper clustering ... gravity so how much things attract each
// other so we can give more space between them"): places stay addresses; gravity only spreads a chain's flowers
// about its middle, each along its own line.
import { expect, test } from 'vitest';
import { GRAVITY_DEFAULT, spreadOf, spreadPlace } from '../landscape/places.ts';

test('1 keeps the saved places, 0 gives three times the room, the default half as much again', () => {
  expect(spreadOf(1)).toBe(1);
  expect(spreadOf(0)).toBe(3);
  expect(spreadOf(GRAVITY_DEFAULT)).toBe(1.5);
  expect(spreadOf(-1)).toBe(3);
  expect(spreadOf(2)).toBe(1);
});

test('a place moves out from its continent along its own line, keeping its size', () => {
  const p = { id: 'a', chain: 'c', x: 110, y: 90, s: 2 };
  expect(spreadPlace(p, { x: 100, y: 100 }, 2)).toEqual({
    id: 'a',
    chain: 'c',
    x: 120,
    y: 80,
    s: 2,
  });
});

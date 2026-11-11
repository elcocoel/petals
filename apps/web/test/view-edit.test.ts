// The Settings section's choices, as edits of the person's view.
import { DEFAULT_VIEW, DEFAULT_VIEW_V2_0, EVERY_FLOWER } from '@petal/core/view';
import { describe, expect, test } from 'vitest';
import { viewChoices } from '../lib/person-view.ts';
import { dataOf, isDefault, scaleOf, takesScale, withData, withScale } from '../lib/view-edit.ts';

describe('a choice in Settings', () => {
  test('colour switches from kind to identity, and nothing else moves', () => {
    const next = withData(DEFAULT_VIEW, 'colour', 'identity', EVERY_FLOWER, DEFAULT_VIEW);
    expect(dataOf(next, 'colour')).toBe('identity');
    for (const d of ['height', 'width', 'order', 'outline'] as const)
      expect(next.dimensions[d]).toEqual(DEFAULT_VIEW.dimensions[d]);
    expect(isDefault(next, DEFAULT_VIEW)).toBe(false);
  });

  test('none takes a dimension out of use', () => {
    expect(
      withData(DEFAULT_VIEW, 'outline', null, EVERY_FLOWER, DEFAULT_VIEW).dimensions.outline,
    ).toBeNull();
  });

  test('a number keeps its scale; a category has none to choose', () => {
    const amount = withData(DEFAULT_VIEW, 'height', 'amount', EVERY_FLOWER, DEFAULT_VIEW);
    expect(scaleOf(amount, 'height', EVERY_FLOWER)).toBe('linear');
    expect(takesScale(DEFAULT_VIEW, 'colour', EVERY_FLOWER)).toBe(false);
    // the default has every petal as wide since 11 Nov; the one before had width, so it shows the scale kept
    expect(takesScale(DEFAULT_VIEW, 'width', EVERY_FLOWER)).toBe(false);
    expect(takesScale(DEFAULT_VIEW_V2_0, 'width', EVERY_FLOWER)).toBe(true);
    expect(
      withData(DEFAULT_VIEW_V2_0, 'width', 'amount', EVERY_FLOWER, DEFAULT_VIEW_V2_0).dimensions
        .width,
    ).toEqual({
      data: 'amount',
      scale: 'log',
      max_ratio: 2,
    });
  });

  test('a scale changes only its dimension', () => {
    const straight = withScale(DEFAULT_VIEW, 'height', 'linear');
    expect(straight.dimensions.height).toEqual({ data: 'share', scale: 'linear' });
    expect(withScale(DEFAULT_VIEW, 'order', 'log')).toBe(DEFAULT_VIEW);
  });

  test('every choice offered keeps the view valid: the data fits the dimension', () => {
    const choices = viewChoices();
    for (const [d, pieces] of Object.entries(choices))
      for (const p of pieces)
        expect(
          dataOf(
            withData(DEFAULT_VIEW, d as never, p.name, EVERY_FLOWER, DEFAULT_VIEW),
            d as never,
          ),
        ).toBe(p.name);
  });

  test('the default is the default', () => {
    expect(isDefault(DEFAULT_VIEW, DEFAULT_VIEW)).toBe(true);
  });
});

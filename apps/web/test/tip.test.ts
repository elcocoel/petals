// The tip: a typical turn is the default model's measured one, and
// what a tip adds to it reads as every amount does, dollars first, NEAR beside.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { TipControl } from '../components/workspace/TipControl.tsx';
import type { Catalogue } from '../lib/composer-options.ts';
import { tipLine, tipWords, typicalTurn } from '../lib/tip.ts';

const model = (id: string, usd_per_turn: number | null) => ({
  id,
  name: id === 'a' ? 'Model A' : 'Model B',
  promise: 'signed' as const,
  runs_at: 'here',
  default_effort: null,
  usd_per_flower: 0,
  usd_per_turn,
});
const catalogue = (a: number | null): Catalogue => ({
  default: { provider: 'p', model: 'a', effort: null, permissions: 'ask' },
  providers: [{ id: 'p', models: [model('b', 0.5), model('a', a)] }],
});

describe('a typical turn', () => {
  test("is the default model's, as measured", () => {
    expect(typicalTurn(catalogue(0.008))).toEqual({ model: 'Model A', usd: 0.008 });
  });

  test('is none until the default model has a measured turn', () => {
    expect(typicalTurn(catalogue(null))).toBeNull();
    expect(typicalTurn(null)).toBeNull();
  });
});

describe('what a tip adds', () => {
  const turn = { model: 'Model A', usd: 0.008 };

  test('on a typical turn, dollars first and NEAR beside, as the model list says a cost', () => {
    expect(tipLine(10, turn, 4)).toBe(
      '+$0.0008 · 0.0002 NEAR a turn, on a typical turn of $0.008 · 0.002 NEAR with Model A.',
    );
  });

  test('in dollars alone while NEAR has no price', () => {
    expect(tipLine(10, turn, null)).toBe(
      '+$0.0008 a turn, on a typical turn of $0.008 with Model A.',
    );
  });

  test('nothing at 0%, and only the percent while no turn is measured', () => {
    expect(tipLine(0, turn, 4)).toBe(tipWords.nothing);
    expect(tipLine(12, null, 4)).toBe('12% of what the AI costs, each turn.');
  });
});

describe('the row', () => {
  const props = {
    percent: 5,
    scale: { min: 0, max: 50, step: 1 },
    open: false,
    onOpen: () => {},
    onSlide: () => {},
    onSet: () => {},
    line: 'the line',
    failed: null,
  };
  const html = (o: Partial<typeof props> = {}) =>
    renderToStaticMarkup(createElement(TipControl, { ...props, ...o }));

  test('says its percent at its end, and opens', () => {
    expect(html()).toContain('5%');
    expect(html()).toContain('aria-expanded="false"');
    expect(html()).not.toContain('type="range"');
  });

  test('open, says what it is, then the slider on the scale, then what it adds', () => {
    const out = html({ open: true });
    expect(out).toContain(tipWords.about);
    expect(out).toContain('type="range"');
    expect(out).toContain('min="0"');
    expect(out).toContain('max="50"');
    expect(out).toContain('the line');
    expect(out.indexOf(tipWords.about)).toBeLessThan(out.indexOf('type="range"'));
  });

  test('is not there until Petals has said what it is', () => {
    expect(html({ percent: null as unknown as number })).toBe('');
  });
});

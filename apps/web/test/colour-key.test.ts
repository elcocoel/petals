// The key to a flower's colours (colours by kind get a key wherever a flower shows): the
// legend's colours by kind, then "everyone else", each once, and the hero drawing its flower with that key.
import type { LegendItem } from '@petal/core/types';
import { DEFAULT_VIEW } from '@petal/core/view';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { Hero } from '../components/landing/Hero.tsx';
import { colourKeys } from '../lib/flower-view.ts';
import { HERO_SHA, type PowerMapTile } from '../lib/power-map.ts';

const validators: LegendItem[] = [
  { primitive: 'height', meaning: 'share', sources: [] },
  {
    primitive: 'colour',
    meaning: 'kind of account',
    sources: [],
    keys: [
      { label: 'pool', swatch: 'var(--k-pool)' },
      { label: 'liquid staking', swatch: 'var(--k-entity)' },
    ],
  },
  {
    primitive: 'segments',
    meaning: 'backers',
    sources: [],
    keys: [{ label: 'lockups', swatch: 'var(--seg-lockup)' }],
  },
  {
    primitive: 'tail',
    meaning: 'everyone else',
    sources: [],
    keys: [{ label: 'everyone else', swatch: 'var(--tail)' }],
  },
];
const stake: LegendItem[] = [
  {
    primitive: 'colour',
    meaning: 'kind of account',
    sources: [],
    keys: [
      { label: 'person or organisation', swatch: 'var(--k-org)' },
      { label: 'pool', swatch: 'var(--k-pool)' },
    ],
  },
  {
    primitive: 'tail',
    meaning: 'everyone else',
    sources: [],
    keys: [{ label: 'everyone else', swatch: 'var(--tail)' }],
  },
];

describe('colourKeys', () => {
  test('the colours by kind and by band, then everyone else', () => {
    expect(colourKeys([validators])).toEqual([
      { label: 'pool', swatch: 'k-pool' },
      { label: 'liquid staking', swatch: 'k-entity' },
      { label: 'lockups', swatch: 'seg-lockup' },
      { label: 'everyone else', swatch: 'tail' },
    ]);
  });
  test('everyone else last, though grey like a value past the fifth (the keys)', () => {
    const tail = { label: 'everyone else (311) 13.8%', swatch: 'var(--key-grey)' };
    const keyed: LegendItem[] = [
      { primitive: 'tail', meaning: 'everyone else', sources: [], keys: [tail] },
      {
        primitive: 'colour',
        meaning: 'kind',
        sources: [],
        keys: [{ label: 'pool', swatch: 'var(--key-mint)' }],
      },
    ];
    expect(colourKeys([keyed]).map((k) => k.label)).toEqual(['pool', tail.label]);
  });
  test('several drawings give one key, each colour once', () => {
    expect(colourKeys([validators, stake]).map((k) => k.label)).toEqual([
      'pool',
      'liquid staking',
      'lockups',
      'person or organisation',
      'everyone else',
    ]);
  });
});

describe('the hero', () => {
  const tile: PowerMapTile = {
    sha: HERO_SHA,
    title: 'NEAR validators',
    where: '371 validators',
    badge: 'NEAR',
    image: 'data:image/svg+xml;base64,PHN2Zy8+',
    href: `/d/${HERO_SHA}`,
    keys: colourKeys([validators]),
  };
  // The first hero, in the lab since the hero story took its place on the landing.
  test('draws its flower in the one look, with the key to its colours', () => {
    const html = renderToStaticMarkup(createElement(Hero, { flower: tile }));
    expect(html).toContain('src="data:image/svg+xml;base64,PHN2Zy8+"');
    expect(html).toContain('data-swatch="k-pool"');
    expect(html).not.toContain('data-kind="hero-flower"');
  });
});

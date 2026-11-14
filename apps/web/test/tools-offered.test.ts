// Tools offers a dimension only where some data can go in it: Texture, Markings and Lines take none yet, so they
// aren't listed, and each comes back by itself once a piece of data fits it.
import { DEFAULT_VIEW, inUse } from '@petal/core/view';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ViewLegend } from '../components/ViewLegend.tsx';
import { panelWords } from '../lib/panel-words.ts';
import { CHOOSABLE, viewChoices } from '../lib/person-view.ts';
import type { LegendEdit } from '../lib/view-edit.ts';

const draw = (choices: LegendEdit['choices']) =>
  renderToStaticMarkup(
    createElement(ViewLegend, {
      view: DEFAULT_VIEW,
      drawn: inUse(DEFAULT_VIEW, CHOOSABLE),
      pieces: CHOOSABLE,
      keys: [],
      edit: {
        defaults: DEFAULT_VIEW,
        choices,
        open: null,
        onOpen: () => undefined,
        onPick: () => undefined,
        onScale: () => undefined,
        onReset: () => undefined,
        failed: null,
      },
      bare: true,
    }),
  );

test('a dimension no data can go in yet is not offered, and comes back when data fits it', () => {
  // Width, Outline and Segments take data today; Texture, Markings and Lines don't
  expect(draw(viewChoices())).toContain(panelWords.legendMore(3));
  const ties = { name: 'votes_alike', kind: 'relation' } as const;
  expect(draw({ ...viewChoices(), lines: [ties] })).toContain(panelWords.legendMore(4));
});

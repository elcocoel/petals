// Tools changes the person's view where petals are drawn: a change the server refuses leaves the view as it
// was, and Tools says why, above its reset.
import { DEFAULT_VIEW, inUse } from '@petal/core/view';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { ViewLegend } from '../components/ViewLegend.tsx';
import { panelWords } from '../lib/panel-words.ts';
import { CHOOSABLE, viewChoices } from '../lib/person-view.ts';
import type { LegendEdit } from '../lib/view-edit.ts';

const edit = (failed: string | null): LegendEdit => ({
  defaults: DEFAULT_VIEW,
  choices: viewChoices(),
  open: null,
  onOpen: () => undefined,
  onPick: () => undefined,
  onScale: () => undefined,
  onReset: () => undefined,
  failed,
});
const draw = (failed: string | null) =>
  renderToStaticMarkup(
    createElement(ViewLegend, {
      view: DEFAULT_VIEW,
      drawn: inUse(DEFAULT_VIEW, CHOOSABLE),
      pieces: CHOOSABLE,
      keys: [],
      edit: edit(failed),
      bare: true,
    }),
  );

describe('Tools says when a change was not saved', () => {
  test('the reason, in the words Settings used', () => {
    expect(draw('session expired')).toContain(panelWords.settings.failed('session expired'));
  });

  test('nothing while every change is saved', () => {
    expect(draw(null)).not.toContain(panelWords.settings.failed(''));
  });
});

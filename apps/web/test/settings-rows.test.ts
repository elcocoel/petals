// Settings never lets a person break their view (Elco, 12 Nov: "don't let users break their views and keep a
// reset to default button handy"): no row hides or locks because of what it shows, so every choice can be
// switched back, and Put the default back is there while the view isn't the default.
import type { View } from '@petal/core/types';
import { DEFAULT_VIEW } from '@petal/core/view';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { ViewControls } from '../components/workspace/ViewControls.tsx';
import { panelWords } from '../lib/panel-words.ts';
import { CHOOSABLE, SETTINGS_ROWS, viewChoices } from '../lib/person-view.ts';
import { withData } from '../lib/view-edit.ts';

const words = panelWords.settings;
const draw = (view: View, choices = viewChoices(), onReset?: () => void) =>
  renderToStaticMarkup(
    createElement(ViewControls, {
      dimensions: SETTINGS_ROWS,
      view,
      defaults: DEFAULT_VIEW,
      choices,
      pieces: CHOOSABLE,
      open: null,
      onOpen: () => undefined,
      onPick: () => undefined,
      onScale: () => undefined,
      onReset,
      failed: null,
    }),
  );
/** Whether the row named `label` is a button that opens its choices. */
const opens = (html: string, label: string) =>
  new RegExp(`<button[^>]*aria-expanded="false"[^>]*>(?:(?!</button>).)*${label}`).test(html);

describe("Settings' rows whatever they show", () => {
  test('Height set to None keeps its row, and it still opens', () => {
    const none = withData(DEFAULT_VIEW, 'height', null, CHOOSABLE, DEFAULT_VIEW);
    const html = draw(none);
    expect(html).toContain(words.dimensions.height);
    expect(opens(html, words.dimensions.height)).toBe(true);
  });

  test('a row showing data opens even when nothing else fits it, so None can switch it back', () => {
    const shown = CHOOSABLE[0];
    if (!shown) throw new Error('no data to choose');
    const view: View = {
      ...DEFAULT_VIEW,
      dimensions: { ...DEFAULT_VIEW.dimensions, segments: { data: shown.name } },
    } as View;
    const html = draw(view, { ...viewChoices(), segments: [] });
    expect(opens(html, words.dimensions.segments)).toBe(true);
  });

  test('a row with nothing to choose and nothing shown stays shut', () => {
    const html = draw(DEFAULT_VIEW, { ...viewChoices(), segments: [] });
    expect(opens(html, words.dimensions.segments)).toBe(false);
  });

  test('Put the default back is there while the view isn’t the default', () => {
    const none = withData(DEFAULT_VIEW, 'height', null, CHOOSABLE, DEFAULT_VIEW);
    expect(draw(none, viewChoices(), () => undefined)).toContain(words.reset);
    expect(draw(DEFAULT_VIEW)).not.toContain(words.reset);
  });
});

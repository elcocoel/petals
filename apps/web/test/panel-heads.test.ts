// The side panel's section heads (design/side-panel.md, lines 39 and 40): a band in the tint, the panel's
// full width, and pressing it folds the section; the chevron says which.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { SectionHead } from '../components/ui/SectionHead.tsx';

const head = (fold?: { open: boolean; onToggle: () => void }) =>
  renderToStaticMarkup(
    createElement(SectionHead, { size: 'panel', title: 'Projects', ...(fold ? { fold } : {}) }),
  );

describe('a section head in the panel', () => {
  test('is a band in the tint, out to the panel’s edges, a heading still', () => {
    const out = head();
    expect(out).toMatch(/^<h2 class="[^"]*-mx-space-8[^"]*border-hairline[^"]*bg-tint/);
    expect(out).toContain('data-b="head" data-kind="panel"');
    expect(out).toContain('Projects');
  });

  test('with a fold, the head is the button that folds it, and says whether it’s open', () => {
    const open = head({ open: true, onToggle: () => {} });
    expect(open).toContain('<button type="button" aria-expanded="true"');
    expect(open).toContain('rotate-90');
    const folded = head({ open: false, onToggle: () => {} });
    expect(folded).toContain('aria-expanded="false"');
    expect(folded).not.toContain('rotate-90');
  });
});

// The landing page's promises: asking carries the question, and every link it relies on lands
// somewhere real. The page is static, so this reads its markup.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import Landing from '../app/page.tsx';
import { AskBox } from '../components/ui/AskBox.tsx';
import { askHref, siteLinks } from '../lib/site-links.ts';

const app = join(import.meta.dirname, '..', 'app');
const html = renderToStaticMarkup(createElement(Landing));
const hrefs = [...html.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)].map((m) => m[1] as string);

describe('askHref', () => {
  test('carries the question, encoded', () => {
    expect(askHref('Who funds whom?')).toBe('/make?q=Who%20funds%20whom%3F');
    expect(askHref('a&b=c#d')).toBe('/make?q=a%26b%3Dc%23d');
    expect(new URL(askHref('NEAR’s ñ'), 'http://x').searchParams.get('q')).toBe('NEAR’s ñ');
  });
});

describe('the landing page', () => {
  test('every link goes where the site has a page, an anchor, or nowhere on purpose', () => {
    const routes: Record<string, string> = {
      [siteLinks.home]: 'page.tsx',
      [siteLinks.make]: 'make/page.tsx',
      [siteLinks.gallery]: '(site)/gallery/page.tsx',
      [siteLinks.connect]: '(site)/connect/page.tsx',
    };
    for (const path of Object.values(routes)) expect(existsSync(join(app, path)), path).toBe(true);
    const anchors = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    for (const href of new Set(hrefs)) {
      if (href === siteLinks.noDestination) continue;
      if (href.startsWith('/#')) expect(anchors, href).toContain(href.slice(2));
      else expect(routes[href.split('?')[0] as string], href).toBeDefined();
    }
  });

  test('each starter asks its own question', () => {
    expect(hrefs).toContain(askHref('How spread out is power here?'));
  });

  test('its ask boxes send a plain GET to /make', () => {
    const forms = [...html.matchAll(/<form\b[^>]*>/g)].map((m) => m[0]);
    expect(forms.length).toBe(3);
    for (const form of forms) {
      expect(form).toContain('action="/make"');
      expect(form).toContain('method="get"');
    }
  });

  test('its figures are inline and carry no raw colour', () => {
    expect(html).not.toContain('<img');
    expect(html).not.toMatch(/(?:fill|stroke)="#/);
  });
});

test('an AskBox without an address stays a form the page handles itself', () => {
  const form = renderToStaticMarkup(createElement(AskBox, { label: 'Ask', placeholder: 'x' }));
  expect(form).not.toContain('action=');
  expect(form).not.toContain('method=');
});

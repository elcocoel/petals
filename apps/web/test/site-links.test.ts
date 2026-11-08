// The landing page's promises: asking carries the question, and every link it relies on lands
// somewhere real. The page is static, so this reads its markup.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import Landing from '../app/page.tsx';
import { AskBox } from '../components/ui/AskBox.tsx';
import { doors } from '../lib/doors.ts';
import { landingCopy } from '../lib/landing-copy.ts';
import { askHref, siteLinks } from '../lib/site-links.ts';

const app = join(import.meta.dirname, '..', 'app');
const html = renderToStaticMarkup(createElement(Landing));
// React writes an apostrophe in an attribute as &#x27;, and a browser reads it back.
const hrefs = [...html.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)].map((m) =>
  (m[1] as string).replaceAll('&#x27;', "'"),
);

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
      [siteLinks.lobby]: 'lobby/page.tsx',
      [siteLinks.gallery]: '(site)/gallery/page.tsx',
      [siteLinks.connect]: '(site)/connect/page.tsx',
      [siteLinks.liveShape]: '(site)/f/[id]/page.tsx',
    };
    for (const path of Object.values(routes)) expect(existsSync(join(app, path)), path).toBe(true);
    const anchors = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    for (const href of new Set(hrefs)) {
      if (href === siteLinks.noDestination) continue;
      if (href.startsWith('/#')) expect(anchors, href).toContain(href.slice(2));
      else expect(routes[href.split(/[?#]/)[0] as string], href).toBeDefined();
    }
  });

  test('each starter asks its own question', () => {
    for (const question of landingCopy.hero.starters) expect(hrefs).toContain(askHref(question));
  });

  test('its ask boxes send a plain GET to /make', () => {
    const forms = [...html.matchAll(/<form\b[^>]*>/g)].map((m) => m[0]);
    expect(forms.length).toBe(2);
    for (const form of forms) {
      expect(form).toContain('action="/make"');
      expect(form).toContain('method="get"');
    }
  });

  test('its figures are inline and carry no raw colour, but for the published shape from the API', () => {
    const images = [...html.matchAll(/<img\b[^>]*\ssrc="([^"]*)"/g)].map((m) => m[1]);
    expect(images).toEqual([siteLinks.liveShapeImage]);
    expect(html).not.toMatch(/(?:fill|stroke)="#/);
  });

  test('every door it sends someone to is on /connect', () => {
    const ids = doors('https://x').map((d) => d.id);
    for (const href of Object.values(siteLinks.doors)) {
      expect(ids, href).toContain(href.split('#')[1]);
      expect(hrefs.includes(href) || href === siteLinks.doors.prompt, href).toBe(true);
    }
  });
});

test('an AskBox without an address stays a form the page handles itself', () => {
  const form = renderToStaticMarkup(createElement(AskBox, { label: 'Ask', placeholder: 'x' }));
  expect(form).not.toContain('action=');
  expect(form).not.toContain('method=');
});

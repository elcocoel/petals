// The landing page's promises: asking carries the question, and every link it relies on lands
// somewhere real. The page is static, so this reads its markup.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { catalog } from '../components/docs/content.ts';
import { Landing } from '../components/landing/Landing.tsx';
import { AskBox } from '../components/ui/AskBox.tsx';
import { landingCopy } from '../lib/landing-copy.ts';
import { askHref, siteLinks } from '../lib/site-links.ts';

const app = join(import.meta.dirname, '..', 'app');
const html = renderToStaticMarkup(createElement(Landing, {}));
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
  test('every link goes where the site has a page or an anchor: none goes nowhere', () => {
    const routes: Record<string, string> = {
      [siteLinks.home]: 'page.tsx',
      [siteLinks.make]: '(work)/make/page.tsx',
      [siteLinks.lobby]: '(work)/lobby/page.tsx',
      [siteLinks.gallery]: '(site)/gallery/page.tsx',
      [siteLinks.map]: '(canvas)/map/page.tsx',
      [siteLinks.docs]: '(site)/docs/[[...slug]]/page.tsx',
      [siteLinks.liveShape]: '(canvas)/f/[id]/page.tsx',
    };
    for (const path of Object.values(routes)) expect(existsSync(join(app, path)), path).toBe(true);
    const anchors = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    // a page inside the docs is one of DOCS's catalog
    const docs = catalog().map((p) => `${siteLinks.docs}/${p.slug}`);
    for (const href of new Set(hrefs)) {
      if (href.startsWith('/#')) expect(anchors, href).toContain(href.slice(2));
      else if (href.startsWith(`${siteLinks.docs}/`)) expect(docs, href).toContain(href);
      else expect(routes[href.split(/[?#]/)[0] as string], href).toBeDefined();
    }
  });

  test("its hero tells a story and takes no question: no box and no starters since HERO ART's (11 Nov)", () => {
    expect([...html.matchAll(/<form\b[^>]*>/g)]).toEqual([]);
    for (const question of landingCopy.hero.starters)
      expect(hrefs).not.toContain(askHref(question));
    for (const beat of landingCopy.heroStory.beats) expect(html).toContain(beat.name);
  });

  test("its figures are inline and carry no raw colour, but for the landing's illustrations", () => {
    const images = [...html.matchAll(/<img\b[^>]*\ssrc="([^"]*)"/g)].map((m) =>
      m[1]?.replaceAll('&amp;', '&'),
    );
    const scenes = landingCopy.howItWorks.scenes.map((s) => `/landing/how-it-works/${s.id}.webp`);
    // the published shape went with "A reading, summarised" (Elco, 11 Nov: "kill it")
    const drawings = [...scenes, '/landing/give-to-agent/petals-leading-agents.webp'];
    expect(images).toEqual(drawings);
    for (const drawing of drawings)
      expect(existsSync(join(app, '..', 'public', drawing)), drawing).toBe(true);
    expect(html).not.toMatch(/(?:fill|stroke)="#/);
  });
});

test('an AskBox without an address stays a form the page handles itself', () => {
  const form = renderToStaticMarkup(createElement(AskBox, { label: 'Ask', placeholder: 'x' }));
  expect(form).not.toContain('action=');
  expect(form).not.toContain('method=');
});

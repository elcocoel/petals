// A link off Petals opens in a new tab; a profile's declared links are addresses to follow.
import { type ComponentProps, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { TextLink } from '../components/ui/TextLink.tsx';
import { DeclaredLink } from '../components/workspace/DeclaredLink.tsx';
import { isOutside, linkHref, outside } from '../lib/outside.ts';

/** TextLink's props with its children given as createElement's own argument. */
const linkTo = (href: string) => ({ href }) as ComponentProps<typeof TextLink>;

describe('a link off Petals opens in a new tab', () => {
  test('absolute addresses on another host are outside; Petals’ own pages are not', () => {
    expect(isOutside('https://github.com/elcocoel/petals')).toBe(true);
    expect(isOutside('http://example.org')).toBe(true);
    expect(isOutside('//example.org/a')).toBe(true);
    expect(isOutside('/lobby')).toBe(false);
    expect(isOutside('#add')).toBe(false);
    expect(isOutside('https://petals.elementarycomplexity.com/gallery')).toBe(false);
    expect(isOutside('mailto:a@b.c')).toBe(false);
    expect(outside('https://x.com/a')).toEqual({ target: '_blank', rel: 'noopener noreferrer' });
    expect(outside('/make')).toEqual({});
  });

  test('TextLink opens an outside address in a new tab, and Petals’ own in place', () => {
    const out = renderToStaticMarkup(createElement(TextLink, linkTo('https://x.com/a'), 'X'));
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
    const own = renderToStaticMarkup(createElement(TextLink, linkTo('/lobby'), 'Lobby'));
    expect(own).not.toContain('target=');
  });
});

describe('a profile’s declared links', () => {
  test('a full address as given, a bare host as https', () => {
    expect(linkHref('website', 'https://elementarycomplexity.com/a?b=1')).toBe(
      'https://elementarycomplexity.com/a?b=1',
    );
    expect(linkHref('website', 'www.elementarycomplexity.com')).toBe(
      'https://www.elementarycomplexity.com/',
    );
    expect(linkHref('website', 'elementarycomplexity.com/writing')).toBe(
      'https://elementarycomplexity.com/writing',
    );
  });

  test('a handle opens its service’s page', () => {
    expect(linkHref('twitter', 'elcocoel')).toBe('https://x.com/elcocoel');
    expect(linkHref('twitter', '@elcocoel')).toBe('https://x.com/elcocoel');
    expect(linkHref('github', 'elcocoel')).toBe('https://github.com/elcocoel');
    expect(linkHref('telegram', 'elcocoel')).toBe('https://t.me/elcocoel');
    expect(linkHref('github', 'github.com/elcocoel')).toBe('https://github.com/elcocoel');
  });

  test('nothing that isn’t an http(s) address: text stays text', () => {
    expect(linkHref('website', 'javascript:alert(1)')).toBeNull();
    expect(linkHref('website', 'data:text/html,hi')).toBeNull();
    expect(linkHref('website', 'ask me')).toBeNull();
    expect(linkHref('website', 'elcocoel')).toBeNull();
    expect(linkHref('discord', 'elco#1234')).toBeNull();
    expect(linkHref('website', '')).toBeNull();
  });

  test('a row: a link in a new tab, or the text as kept', () => {
    const link = renderToStaticMarkup(
      createElement(DeclaredLink, { service: 'website', value: 'www.elementarycomplexity.com' }),
    );
    expect(link).toContain('href="https://www.elementarycomplexity.com/"');
    expect(link).toContain('target="_blank"');
    expect(link).toContain('>www.elementarycomplexity.com<');
    const text = renderToStaticMarkup(
      createElement(DeclaredLink, { service: 'website', value: 'ask me' }),
    );
    expect(text).not.toContain('<a');
  });
});

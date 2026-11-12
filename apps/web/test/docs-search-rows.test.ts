// Search in /docs (Elco, 12 Nov: "the search function"): the answers that are pages /docs renders, as rows. SEARCH's
// docs-search.test.ts keeps its list of pages equal to the docs'.
import { describe, expect, test } from 'vitest';
import { docsRows, docsSearchStatus, docsSearchWords } from '../lib/docs-search.ts';

const pages = [
  {
    slug: 'ideas',
    title: 'The ideas',
    source: 'docs/ideas/index.md',
    section: 'ideas',
    overview: true,
  },
  { slug: 'ideas/claims', title: 'Claims', source: 'docs/ideas/claims.md', section: 'ideas' },
  {
    slug: 'brain',
    title: 'The brain',
    source: 'docs/brain/index.md',
    section: 'brain',
    overview: true,
  },
  {
    slug: 'data-protocol/schemas/calls-v1',
    title: 'calls/v1',
    source: 'packages/core/schema/calls-v1.schema.json',
    schemaId: 'urn:petal:schema:calls:v1',
    section: 'data-protocol',
  },
  {
    slug: 'brain/open-calls',
    title: 'Open calls',
    source: 'brain/gathering/open-calls.md',
    section: 'brain',
  },
];

describe('docs search rows', () => {
  test('pages /docs renders, in search order, at the section that matched, with the words around it', () => {
    const rows = docsRows(
      {
        results: [
          {
            kind: 'doc',
            id: 'brain/gathering/open-calls.md',
            title: 'Open calls',
            snippet: [
              { text: 'a DAO’s ', hit: false },
              { text: 'request for proposals', hit: true },
              { text: ', a grants program', hit: false },
            ],
            matched: [
              {
                kind: 'doc',
                id: 'brain/gathering/open-calls.md#reading-them-right',
                title: 'Reading them right',
              },
            ],
          },
          { kind: 'doc', id: 'docs/ideas/claims.md', title: 'Claims' },
          // a format, by its schema's $id
          { kind: 'doc', id: 'urn:petal:schema:calls:v1', title: 'calls/v1' },
          // the same page twice, and a file /docs doesn't render, and another kind: left out
          { kind: 'doc', id: 'docs/ideas/claims.md', title: 'Claims' },
          { kind: 'doc', id: 'specs/not-rendered.md', title: 'Not here' },
          { kind: 'map', id: 'near:x', title: 'A map' },
        ],
      },
      pages,
    );
    expect(rows).toEqual([
      {
        href: '/docs/brain/open-calls#reading-them-right',
        title: 'Open calls',
        heading: 'Reading them right',
        section: 'The brain',
        snippet: [
          { text: 'a DAO’s ', hit: false, at: 0 },
          { text: 'request for proposals', hit: true, at: 8 },
          { text: ', a grants program', hit: false, at: 29 },
        ],
      },
      {
        href: '/docs/ideas/claims',
        title: 'Claims',
        heading: null,
        section: 'The ideas',
        snippet: [],
      },
      {
        href: '/docs/data-protocol/schemas/calls-v1',
        title: 'calls/v1',
        heading: null,
        section: 'data-protocol',
        snippet: [],
      },
    ]);
  });

  test('the quiet line: on its way, nothing found, words alone, or none', () => {
    const body = { results: [], meaning: 'on' as const };
    expect(docsSearchStatus('', null, null, null)).toBeNull();
    expect(docsSearchStatus('claims', 'quick', null, null)).toBe(docsSearchWords.searching);
    expect(docsSearchStatus('claims', 'ordered', { body }, [])).toBe(docsSearchWords.ordering);
    expect(docsSearchStatus('claims', null, { body: null }, null)).toBe(docsSearchWords.failed);
    expect(docsSearchStatus('claims', null, { body }, [])).toBe(docsSearchWords.none);
    const row = {
      href: '/docs/ideas/claims',
      title: 'Claims',
      heading: null,
      section: 'The ideas',
      snippet: [],
    };
    expect(docsSearchStatus('claims', null, { body: { ...body, meaning: 'off' } }, [row])).toBe(
      docsSearchWords.wordsOnly,
    );
    expect(docsSearchStatus('claims', null, { body }, [row])).toBeNull();
  });
});

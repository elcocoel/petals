// Search on /docs finds exactly the pages /docs shows: the server's list (@petal/tools docsPages)
// and the site's (catalog()) are the same files, and the same formats by their schema's $id.
import { docsPages } from '@petal/tools';
import { describe, expect, test } from 'vitest';
import { catalog, repoRoot } from '../components/docs/content.ts';

describe('the docs search covers', () => {
  test('every page /docs shows, and nothing else', () => {
    const shown = [...new Set(catalog().map((p) => p.schemaId ?? p.source))].sort();
    const searched = docsPages(repoRoot())
      .map((p) => p.path)
      .sort();
    expect(searched).toEqual(shown);
  });
});

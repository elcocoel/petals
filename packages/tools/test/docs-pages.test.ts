// The pages /docs shows, for search (docs-pages.ts): what each section's index.md includes and excludes, a long
// page cut into its sections, and each section's anchor as rehype-slug makes it.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { docsPages, sectionsOf, slugger } from '../src/docs-pages.ts';

describe('anchors', () => {
  test("are GitHub's: lower case, punctuation gone, spaces as dashes, a repeat numbered", () => {
    const slug = slugger();
    expect(slug('Who gets a vote?')).toBe('who-gets-a-vote');
    expect(slug('keep_data and list_data')).toBe('keep_data-and-list_data');
    expect(slug('Step 1: read the chain')).toBe('step-1-read-the-chain');
    expect(slug('Examples')).toBe('examples');
    expect(slug('Examples')).toBe('examples-1');
    expect(slug('Examples')).toBe('examples-2');
  });
});

describe('a page cut into its sections', () => {
  test('its # title dropped, ## and ### each a section, code fences not headings, every heading counted', () => {
    const { intro, sections } = sectionsOf(
      [
        '# The page',
        'Before any heading.',
        '## Fields',
        'What each holds, `keep_data` among them.',
        '```',
        '## not a heading',
        '```',
        '#### A small one',
        'Under the small one.',
        '### [Linked](https://x.y) words',
        'Its own.',
        '## Fields',
        'Again.',
      ].join('\n'),
    );
    expect(intro).toBe('Before any heading.');
    expect(sections.map((s) => [s.anchor, s.title])).toEqual([
      ['fields', 'Fields'],
      ['linked-words', 'Linked words'],
      ['fields-1', 'Fields'],
    ]);
    expect(sections[0]?.text).toContain('## not a heading');
    expect(sections[0]?.text).toContain('Under the small one.');
  });

  test('its words in plain text: no links, ticks, emphasis, fences, table rules or quote marks; snake_case kept', () => {
    const { intro } = sectionsOf(
      [
        '[Open Petals](https://petals.example) and **read** the `keep_data` tool, _gently_.',
        '> A quote.',
        '| Field | Type |',
        '| --- | --- |',
        '| `id` | string |',
        '```json',
        '{ "a": 1 }',
        '```',
        '[ref]: https://example.com',
      ].join('\n'),
    );
    expect(intro).toBe(
      [
        'Open Petals and read the keep_data tool, gently.',
        'A quote.',
        'Field  Type',
        'id  string',
        '{ "a": 1 }',
      ].join('\n'),
    );
  });
});

describe('the pages', () => {
  test("each section's index, its own pages, what it includes less what it excludes, by repo path", () => {
    const root = mkdtempSync(join(tmpdir(), 'petal-docs-'));
    const put = (path: string, text: string) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    };
    put('docs/b/index.md', '---\ntitle: Second\norder: 2\n---\nThe second section.');
    put(
      'docs/a/index.md',
      '---\ntitle: First\norder: 1\ninclude: ["brain/one/", "notes/x-*.md"]\nexclude: ["skip.md"]\n---\nIntro.',
    );
    put('docs/a/own.md', '# Its own page\n\nWords.');
    put(
      'brain/one/chapter.md',
      '---\nid: chapter\nfor: finding who votes\nrecognise: ballots, delegates\n---\n# A chapter\n\nRead it.',
    );
    put('brain/one/skip.md', '# Skipped');
    put('brain/one/recipe.json', '{"steps": []}');
    put('notes/x-one.md', '---\ntitle: X one\n---\nWords.');
    put('notes/y.md', '# Not included');
    const pages = docsPages(root);
    expect(pages.map((p) => [p.path, p.title])).toEqual([
      ['docs/a/index.md', 'First'],
      ['docs/a/own.md', 'Its own page'],
      ['brain/one/chapter.md', 'A chapter'],
      ['brain/one/recipe.json', 'recipe'],
      ['notes/x-one.md', 'X one'],
      ['docs/b/index.md', 'Second'],
    ]);
    const chapter = pages.find((p) => p.path === 'brain/one/chapter.md');
    expect(chapter?.summary).toBe('finding who votes\nballots, delegates');
    expect(chapter?.intro).toBe('Read it.');
  });
});

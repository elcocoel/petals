import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { catalog, content, renderMarkdown, repoRoot } from './content.ts';

test('all seven sections and canonical files have navigable, unique pages', async () => {
  const pages = catalog();
  assert.equal(pages.filter((p) => p.overview).length, 7);
  assert.equal(new Set(pages.map((p) => p.slug)).size, pages.length);
  for (const source of [
    'brain/doctrine.md',
    'brain/chapters/connect-codex.md',
    'brain/recipes/moloch-v3.json',
    'specs/protocols.md',
    'specs/001-petal-core/contracts/http-api.md',
  ]) {
    const page = pages.find((p) => p.source === source);
    assert.ok(page, source);
    assert.ok((await content(page, pages)).markdown.length > 0);
  }
});

test('schema docs include actual nested fields and pinned fixtures', async () => {
  const pages = catalog();
  const page = pages.find((p) => p.schemaId === 'urn:petal:schema:view:v2');
  assert.ok(page);
  const result = await content(page, pages);
  assert.match(result.markdown, /dimensions.labels/);
  const fixture = JSON.parse(
    readFileSync(`${repoRoot()}/packages/core/schema/fixtures/view.v2.json`, 'utf8'),
  );
  assert.ok(result.markdown.includes(JSON.stringify(fixture, null, 2)));
});

test('markdown generates consistent anchors, GFM tables and safe links without raw HTML', async () => {
  const result = await renderMarkdown(
    '# Title\n\n## A `piece`\n\n## A `piece`\n\n| Field | Kind |\n| --- | --- |\n| x | y |\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n[brain](../brain/doctrine.md)',
    'docs/index.md',
    catalog(),
  );
  assert.deepEqual(
    result.headings.map((h) => h.id),
    ['a-piece', 'a-piece-1'],
  );
  assert.match(result.html, /<table>/);
  assert.doesNotMatch(result.html, /<script|href="javascript:/);
  assert.match(result.html, /href="\/docs\/brain\/doctrine"/);
});

test('rendering overview reads current dimensions and defaults from core', async () => {
  const pages = catalog();
  const page = pages.find((p) => p.slug === 'rendering-protocol');
  assert.ok(page);
  const result = await content(page, pages);
  assert.match(result.markdown, /\| labels \| category \| identity \|/);
  assert.ok(result.reference?.html.includes('Current view vocabulary'));
  assert.ok(!result.html.includes('Current view vocabulary'));
});

test('all registered schemas have nested fields and at least one original pinned example', async () => {
  const pages = catalog();
  for (const page of pages.filter((p) => p.schemaKey)) {
    const result = await content(page, pages);
    assert.match(result.html, /<table>/, page.title);
    assert.ok(result.examples.length, page.title);
    for (const file of result.examples)
      assert.ok(
        result.markdown.includes(
          JSON.stringify(JSON.parse(readFileSync(`${repoRoot()}/${file}`, 'utf8')), null, 2),
        ),
        file,
      );
  }
  const view = pages.find((p) => p.schemaId === 'urn:petal:schema:view:v2');
  assert.ok(view);
  assert.ok((await content(view, pages)).html.includes('&#x3C;layer>:&#x3C;name>'));
});

test('authored guides are distinct from canonical system reference', () => {
  const pages = catalog();
  assert.equal(pages.find((p) => p.slug === 'getting-started')?.kind, 'guide');
  assert.equal(pages.find((p) => p.source === 'brain/doctrine.md')?.kind, 'reference');
  assert.equal(pages.find((p) => p.schemaId === 'urn:petal:schema:view:v2')?.kind, 'reference');
});

test('authored Markdown children appear automatically with frontmatter titles', () => {
  const page = catalog().find((p) => p.slug === 'getting-started/how-petals-works');
  assert.equal(page?.title, 'How Petals fits together');
  assert.equal(page?.kind, 'guide');
});

test('only local documentation image assets can render', async () => {
  const result = await renderMarkdown(
    '![System map](../assets/how-it-fits-together.png)\n\n![Remote](https://example.com/tracker.png)\n\n![Outside](../../README.md)',
    'docs/getting-started/how-petals-works.md',
    catalog(),
  );
  assert.ok(result.html.includes('src="/docs/assets/how-it-fits-together.png"'));
  assert.equal((result.html.match(/<img/g) ?? []).length, 1);
  assert.ok(result.html.includes('alt="System map"'));
});

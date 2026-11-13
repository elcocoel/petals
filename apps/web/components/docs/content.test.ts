import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { chart, primitives } from '@petal/tokens';
import { catalog, content, renderMarkdown, repoRoot } from './content.ts';
import { byDepartment } from './groups.ts';

test('all eleven sections and canonical files have navigable, unique pages', async () => {
  const pages = catalog();
  assert.equal(pages.filter((p) => p.overview).length, 11);
  // What Petals is comes first (card 110: the docs are for people)
  assert.equal(pages[0]?.slug, 'what-petals-is');
  assert.equal(new Set(pages.map((p) => p.slug)).size, pages.length);
  for (const source of [
    'brain/doctrine.md',
    'brain/connecting/connect-codex.md',
    'brain/governance/recipes/moloch-v3.json',
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
  const page = pages.find((p) => p.schemaId === 'urn:petal:schema:view:v3');
  assert.ok(page);
  const result = await content(page, pages);
  assert.match(result.markdown, /dimensions.labels/);
  const fixture = JSON.parse(
    readFileSync(`${repoRoot()}/packages/core/schema/fixtures/view.v3.json`, 'utf8'),
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

test('each format shows only its current version', () => {
  const ids = catalog().flatMap((p) => (p.schemaId ? [p.schemaId] : []));
  assert.ok(ids.includes('urn:petal:schema:claim:v4'));
  assert.ok(!ids.includes('urn:petal:schema:claim:v3'));
  const names = ids.map((id) => id.replace(/:v\d+$/, ''));
  assert.equal(new Set(names).size, names.length);
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
  const view = pages.find((p) => p.schemaId === 'urn:petal:schema:view:v3');
  assert.ok(view);
  assert.ok((await content(view, pages)).html.includes('&#x3C;layer>:&#x3C;name>'));
});

test('authored guides are distinct from canonical system reference', () => {
  const pages = catalog();
  assert.equal(pages.find((p) => p.slug === 'getting-started')?.kind, 'guide');
  assert.equal(pages.find((p) => p.source === 'brain/doctrine.md')?.kind, 'reference');
  assert.equal(pages.find((p) => p.schemaId === 'urn:petal:schema:view:v3')?.kind, 'reference');
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

test("the site's own pictures render where the site serves them, and only those it has", async () => {
  const result = await renderMarkdown(
    '![Scene](/landing/how-it-works/brain.webp)\n\n![Missing](/landing/none.webp)\n\n![Up](/../secrets.png)',
    'docs/brand-kit/assets.md',
    catalog(),
  );
  assert.ok(result.html.includes('src="/landing/how-it-works/brain.webp"'));
  assert.equal((result.html.match(/<img/g) ?? []).length, 1);
});

test('the brand kit reads its colours and type from the design tokens (card 110, part 4)', async () => {
  const pages = catalog();
  const page = pages.find((p) => p.slug === 'brand-kit/assets');
  assert.ok(page);
  const result = await content(page, pages);
  assert.ok(result.markdown.includes(`| Mint | \`${primitives.Mint.toUpperCase()}\` |`));
  assert.ok(result.markdown.includes(`| Apricot | \`${chart['key-apricot'].toUpperCase()}\` |`));
  assert.match(result.markdown, /- Bitcount Grid Single/);
  assert.ok(result.reference);
});

test('the interface page counts its components and formats when the site is built', async () => {
  const pages = catalog();
  const page = pages.find((p) => p.slug === 'ideas/interface');
  assert.ok(page);
  const result = await content(page, pages);
  assert.match(result.markdown, /- \d+ components in `apps\/web\/components\/ui\/`/);
  assert.match(result.markdown, /- \d+ data formats, \d+ versions in all/);
});

test('/docs/brain is grouped by department, each hub first, with the routing table beside the doctrine', () => {
  const brain = catalog().filter((p) => p.section === 'brain' && p.kind === 'reference');
  const groups = byDepartment(brain);
  assert.deepEqual(
    groups[0]?.pages.map((p) => p.slug),
    ['brain/doctrine', 'brain/routing'],
  );
  const governance = groups.find((g) => g.department === 'governance');
  assert.equal(governance?.title, 'Governance');
  assert.equal(governance?.pages[0]?.slug, 'brain/governance');
  assert.ok(governance?.pages.some((p) => p.slug === 'brain/who-gets-a-vote'));
  assert.ok(governance?.pages.some((p) => p.slug === 'brain/recipes/moloch-v3'));
  assert.equal(groups.filter((g) => g.department).length, 7);
});

test('an empty slot is a space with no words in it (card 110)', async () => {
  const { html } = await renderMarkdown('## Why\n\n{slot}\n\nAfter.', 'docs/x/index.md', []);
  assert.match(html, /<div data-slot=""><\/div>/);
  assert.ok(!html.includes('{slot}'));
  assert.match(html, /<p>After\.<\/p>/);
});

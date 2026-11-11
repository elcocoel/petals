// Read only at build time. Static routes carry the rendered docs, not a second copy of their sources.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { schemas } from '@petal/core';
import { ACCEPTS, DIMENSIONS, latestView } from '@petal/core/view';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { parse } from 'yaml';
import { DEFAULT_PERSON_VIEW } from '../../lib/person-view.ts';

export interface DocPage {
  slug: string;
  kind: 'guide' | 'reference';
  title: string;
  section: string;
  source: string;
  overview?: boolean;
  status?: string;
  schemaId?: string;
  schemaKey?: keyof typeof schemas;
}
interface Frontmatter {
  title?: string;
  order?: number;
  status?: string;
  include?: string[];
  exclude?: string[];
}
export interface Heading {
  id: string;
  title: string;
  level: number;
}
interface Tree {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Tree[];
}
interface Schema {
  $id?: string;
  $ref?: string;
  $defs?: Record<string, Schema>;
  title?: string;
  description?: string;
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  additionalProperties?: boolean | Schema;
  oneOf?: Schema[];
  anyOf?: Schema[];
  allOf?: Schema[];
}
const GITHUB = 'https://github.com/elcocoel/petals';
export const editUrl = (source: string) => `${GITHUB}/edit/main/${source}`;
const blobUrl = (source: string) => `${GITHUB}/blob/main/${source}`;

export function repoRoot(): string {
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    if (dir === dirname(dir)) throw new Error('Docs build must run inside the Petals repository');
  }
}
/** Only repository-owned raster illustrations are served by the static docs asset route. */
export function docAssetNames(): string[] {
  const dir = join(repoRoot(), 'docs/assets');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((file) => file.isFile() && /^[a-z0-9-]+\.(png|webp)$/.test(file.name))
    .map((file) => file.name);
}
export function docAsset(name: string): Uint8Array | null {
  return docAssetNames().includes(name)
    ? new Uint8Array(readFileSync(join(repoRoot(), 'docs/assets', name)))
    : null;
}
function imageUrl(src: string, source: string): string | undefined {
  const path = posix.normalize(posix.join(posix.dirname(source), src));
  return path.startsWith('docs/assets/') &&
    docAssetNames().includes(path.slice('docs/assets/'.length))
    ? `/docs/assets/${posix.basename(path)}`
    : undefined;
}
function read(source: string): string {
  return readFileSync(join(repoRoot(), source), 'utf8');
}
export function splitMatter(raw: string): { meta: Frontmatter; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
  if (!match) return { meta: {}, body: raw.trim() };
  // Brain frontmatter is a line-based format, not YAML (its prose contains unquoted colons).
  const meta = /^id:/m.test(match[1])
    ? Object.fromEntries(
        match[1].split('\n').map((line) => {
          const at = line.indexOf(':');
          return [line.slice(0, at), line.slice(at + 1).trim()];
        }),
      )
    : (parse(match[1]) ?? {});
  return { meta, body: raw.slice(match[0].length).trim() };
}
function titleOf(raw: string, fallback: string): string {
  const { meta, body } = splitMatter(raw);
  return meta.title ?? /^# (.+)$/m.exec(body)?.[1]?.replace(/`/g, '') ?? fallback;
}
function files(dir: string): string[] {
  return readdirSync(join(repoRoot(), dir), { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory() ? files(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`],
    )
    .sort();
}
function matches(file: string, pattern: string): boolean {
  return new RegExp(
    `^${pattern
      .split('*')
      .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
  ).test(file);
}
function expand(source: string): string[] {
  if (source.endsWith('/')) return files(source.slice(0, -1)).filter((p) => /\.(md|json)$/.test(p));
  if (source.includes('*')) return files(posix.dirname(source)).filter((p) => matches(p, source));
  return [source];
}

export function catalog(): DocPage[] {
  const pages: DocPage[] = [];
  const indexes = files('docs')
    .filter((p) => p.endsWith('/index.md'))
    .sort(
      (a, b) => (splitMatter(read(a)).meta.order ?? 100) - (splitMatter(read(b)).meta.order ?? 100),
    );
  for (const source of indexes) {
    const { meta } = splitMatter(read(source));
    const section = posix.dirname(source).slice('docs/'.length);
    pages.push({
      slug: section,
      title: meta.title ?? section,
      section,
      source,
      overview: true,
      kind: 'guide',
    });
    const authored = files(posix.dirname(source))
      .filter((file) => file.endsWith('.md') && file !== source && !file.endsWith('/index.md'))
      .sort(
        (a, b) =>
          (splitMatter(read(a)).meta.order ?? 100) - (splitMatter(read(b)).meta.order ?? 100),
      );
    for (const item of [...new Set([...authored, ...(meta.include ?? []).flatMap(expand)])]) {
      if (meta.exclude?.some((p) => matches(posix.basename(item), p))) continue;
      const raw = read(item);
      const json = item.endsWith('.json');
      const localName = item.startsWith(`${posix.dirname(source)}/`)
        ? posix.relative(posix.dirname(source), item)
        : `${item.includes('/recipes/') ? 'recipes/' : ''}${posix.basename(item)}`;
      const slug = `${section}/${localName.replace(/\.(md|json)$/, '').toLowerCase()}`;
      const matter = json ? {} : splitMatter(raw).meta;
      pages.push({
        slug,
        title: json ? posix.basename(item, '.json') : titleOf(raw, posix.basename(item)),
        section,
        source: item,
        kind: item.startsWith('docs/') || item === 'README.md' ? 'guide' : 'reference',
        status: matter.status,
      });
    }
    if (section === 'data-protocol') {
      const schemaFiles = files('packages/core/schema').filter((p) => p.endsWith('.schema.json'));
      // Only each format's current version (Elco's walk 8: "why do we have every version of each
      // protocol?"); the older ones stay in the repo.
      const version = (s: Schema) => /^urn:petal:schema:([^:]+):v(\d+)$/.exec(s.$id ?? '');
      const newest = new Map<string, number>();
      for (const raw of Object.values(schemas)) {
        const m = version(raw as Schema);
        if (m) newest.set(m[1] as string, Math.max(newest.get(m[1] as string) ?? 0, Number(m[2])));
      }
      for (const [key, raw] of Object.entries(schemas)) {
        const schema = raw as Schema;
        const m = version(schema);
        if (m && Number(m[2]) < (newest.get(m[1] as string) ?? 0)) continue;
        const file =
          schemaFiles.find((p) => JSON.parse(read(p)).$id === schema.$id) ??
          'packages/core/schema/flower.schema.json';
        const name = schema.$id?.replace('urn:petal:schema:', '').replace(':', '/') ?? key;
        pages.push({
          slug: `${section}/schemas/${name.replace('/', '-')}`,
          title: name,
          section,
          source: file,
          kind: 'reference',
          schemaKey: key as keyof typeof schemas,
          schemaId: schema.$id,
        });
      }
    }
  }
  if (new Set(pages.map((p) => p.slug)).size !== pages.length)
    throw new Error('Duplicate docs route');
  return pages;
}

const fence = (value: unknown) => `\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
const cell = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
function resolveRef(root: Schema, ref: string): Schema | undefined {
  if (!ref.startsWith('#/')) return undefined;
  let node: unknown = root;
  for (const key of ref.slice(2).split('/'))
    node = (node as Record<string, unknown> | undefined)?.[
      key.replace(/~1/g, '/').replace(/~0/g, '~')
    ];
  return node as Schema | undefined;
}
export function fields(root: Schema): string {
  const rows: string[] = [];
  const walk = (node: Schema, path: string, required: boolean, seen: Set<string>) => {
    const ref = node.$ref;
    if (ref && !seen.has(ref)) {
      const target = resolveRef(root, ref);
      if (target) {
        walk({ ...target, ...node, $ref: undefined }, path, required, new Set([...seen, ref]));
        return;
      }
    }
    const kind =
      node.const !== undefined
        ? JSON.stringify(node.const)
        : node.enum
          ? node.enum.map((v) => JSON.stringify(v)).join(' / ')
          : Array.isArray(node.type)
            ? node.type.join(' / ')
            : (node.type ?? ref ?? (node.oneOf || node.anyOf ? 'choice' : 'object'));
    if (path)
      rows.push(
        `| \`${cell(path)}\` | ${cell(kind)} | ${required ? 'Required' : 'Optional'} | ${cell(node.description ?? '')} |`,
      );
    for (const [key, value] of Object.entries(node.properties ?? {}))
      walk(value, path ? `${path}.${key}` : key, node.required?.includes(key) ?? false, seen);
    if (node.items) walk(node.items, `${path}[]`, true, seen);
    if (typeof node.additionalProperties === 'object')
      walk(node.additionalProperties, `${path}.*`, false, seen);
    for (const [i, choice] of (node.oneOf ?? node.anyOf ?? node.allOf ?? []).entries())
      walk(choice, `${path} (variant ${i + 1})`, required, seen);
  };
  walk(root, '', true, new Set());
  return (
    '| Field | Type or allowed values | Presence in its parent | Description |\n| --- | --- | --- | --- |\n' +
    rows.join('\n')
  );
}
export async function content(page: DocPage, pages: DocPage[]) {
  let markdown: string;
  let examples: string[] = [];
  if (page.schemaKey) {
    const schema = schemas[page.schemaKey] as Schema;
    const pins = JSON.parse(read('packages/core/schema/pins.json')) as Record<
      string,
      { schema: string }
    >;
    examples = Object.entries(pins)
      .filter(([, pin]) => pin.schema === page.schemaId)
      .map(([file]) => `packages/core/schema/fixtures/${file}`);
    if (!examples.length) throw new Error(`No pinned example for ${page.schemaId}`);
    markdown =
      `${schema.description ?? ''}\n\n## Fields\n\n${fields(schema)}\n\n## Examples\n\n` +
      examples
        .map(
          (file) =>
            `### ${posix.basename(file)}\n\n[Fixture source](${blobUrl(file)})${fence(JSON.parse(read(file)))}`,
        )
        .join('\n') +
      `\n## Full schema\n\n${fence(schema)}`;
  } else if (page.source.endsWith('.json')) {
    markdown = fence(JSON.parse(read(page.source)));
  } else {
    markdown = splitMatter(read(page.source))
      .body.replace(/^# .+\r?\n?/, '')
      .trim();
  }
  let referenceMarkdown = '';
  if (page.slug === 'rendering-protocol') {
    referenceMarkdown =
      '\n\n## Current view vocabulary\n\nGenerated from [core’s view definitions](https://github.com/elcocoel/petals/blob/main/packages/core/src/view/index.ts). A format accepting a dimension does not mean every renderer draws it.\n\n| Dimension | Accepts | Default data |\n| --- | --- | --- |\n' +
      DIMENSIONS.map(
        (dimension) =>
          `| ${dimension} | ${ACCEPTS[dimension].join(', ')} | ${latestView(DEFAULT_PERSON_VIEW.view).dimensions[dimension]?.data ?? 'Off'} |`,
      ).join('\n');
  }
  const rendered = await renderMarkdown(markdown, page.source, pages);
  const reference = referenceMarkdown
    ? await renderMarkdown(referenceMarkdown, page.source, pages)
    : undefined;
  return {
    markdown: markdown + referenceMarkdown,
    examples,
    ...rendered,
    headings: [...rendered.headings, ...(reference?.headings ?? [])],
    reference,
  };
}
function textOf(node: Tree): string {
  return node.value ?? node.children?.map(textOf).join('') ?? '';
}
function walkTree(node: Tree, visit: (node: Tree) => void) {
  visit(node);
  for (const child of node.children ?? []) walkTree(child, visit);
}
function hrefFor(href: string, source: string, pages: DocPage[]): string | undefined {
  if (
    /^(https?:|mailto:)/i.test(href) ||
    href.startsWith('#') ||
    (href.startsWith('/') && !href.startsWith('//'))
  )
    return href;
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) return undefined;
  const [file, hash] = href.split('#');
  const path = posix.normalize(posix.join(posix.dirname(source), file ?? ''));
  if (path.startsWith('../')) return undefined;
  const page = pages.find((p) => p.source === path);
  return `${page ? `/docs/${page.slug}` : blobUrl(path)}${hash ? `#${hash}` : ''}`;
}
export async function renderMarkdown(markdown: string, source: string, pages: DocPage[]) {
  const headings: Heading[] = [];
  const html = String(
    await unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype)
      .use(rehypeSlug)
      .use(() => (tree: Tree) => {
        walkTree(tree, (node) => {
          if (node.tagName && /^h[2-6]$/.test(node.tagName))
            headings.push({
              id: String(node.properties?.id),
              title: textOf(node),
              level: Number(node.tagName[1]),
            });
          if (node.tagName === 'a' && node.properties) {
            const href = hrefFor(String(node.properties.href ?? ''), source, pages);
            if (href) node.properties.href = href;
            else delete node.properties.href;
          }
          // Raster illustrations are local and explicit; external embeds and raw HTML stay out.
          if (node.tagName === 'img') {
            const src = imageUrl(String(node.properties?.src ?? ''), source);
            if (src) {
              node.properties = {
                src,
                alt: String(node.properties?.alt ?? ''),
                loading: 'lazy',
                decoding: 'async',
              };
              return;
            }
            node.tagName = 'span';
            node.children = [{ type: 'text', value: String(node.properties?.alt ?? '') }];
            node.properties = {};
          }
        });
      })
      .use(rehypeStringify)
      .process(markdown),
  );
  return { html, headings };
}

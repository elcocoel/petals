// The pages /docs shows, read from the repo as the site reads them (apps/web/components/docs/content.ts, catalog()),
// for search (Elco, 12 Nov: "another feature for us to add on the docs that make us legit -> the search function").
// Each section's index.md says what it includes and excludes; the data protocol adds each format's newest schema.
// A page is known by its repo path, as CONNECTORS' box on /docs maps it to its address; a long page is cut into
// its sections (## and ###), each known by the path and its heading's anchor, made as rehype-slug makes it.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { schemas } from '@petal/core';

export interface DocSection {
  /** the heading's anchor on the page, as rehype-slug makes it (GitHub's way) */
  anchor: string;
  title: string;
  text: string;
}

export interface DocPageText {
  /**
   * its repo path (docs/ideas/claims.md, brain/gathering/open-calls.md), or a format's schema by its $id
   * (urn:petal:schema:proposals:v3), since several formats are defined in one file
   */
  path: string;
  title: string;
  /** what a brain chapter says it's for and the words it's recognised by (its frontmatter's for and recognise) */
  summary: string;
  /** its words before its first section, or all of them when it has none */
  intro: string;
  sections: DocSection[];
}

const MATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** Its frontmatter's lines and its body: YAML or the brain's line format, read only for what search needs. */
function matterOf(raw: string): { matter: string; body: string } {
  const m = MATTER.exec(raw);
  return m
    ? { matter: m[1] ?? '', body: raw.slice(m[0].length).trim() }
    : { matter: '', body: raw.trim() };
}

const unquote = (s: string) => s.trim().replace(/^(["'])(.*)\1$/, '$2');

function field(matter: string, name: string): string | undefined {
  const v = new RegExp(`^${name}:(.*)$`, 'm').exec(matter)?.[1];
  return v === undefined ? undefined : unquote(v);
}

function list(matter: string, name: string): string[] {
  const v = field(matter, name);
  if (!v) return [];
  try {
    const parsed = JSON.parse(v) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [...v.matchAll(/["']([^"']+)["']/g)].map((m) => m[1] as string);
  }
}

/** A page's title as /docs gives it: its frontmatter's, else its first # heading, else its file name. */
function titleOf(raw: string, fallback: string): string {
  const { matter, body } = matterOf(raw);
  return field(matter, 'title') ?? /^# (.+)$/m.exec(body)?.[1]?.replace(/`/g, '') ?? fallback;
}

/** A heading's words as the page shows them: no code ticks, links, emphasis or HTML. */
function plain(md: string): string {
  return md
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/(\*\*|__|\*|_|~~)(.+?)\1/g, '$2')
    .trim();
}

/** GitHub's anchors, as github-slugger (rehype-slug's) makes them: a repeated one gets -1, -2. */
export function slugger(): (heading: string) => string {
  const seen = new Map<string, number>();
  return (heading) => {
    const base = heading
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
      .replace(/ /g, '-');
    let slug = base;
    let n = seen.get(base) ?? 0;
    while (seen.has(slug)) slug = `${base}-${++n}`;
    seen.set(base, n);
    seen.set(slug, 0);
    return slug;
  };
}

/** A markdown page cut into its intro and its ## and ### sections; every heading counts for the anchors. */
export function sectionsOf(body: string): { intro: string; sections: DocSection[] } {
  const slug = slugger();
  const intro: string[] = [];
  const sections: DocSection[] = [];
  let fence = false;
  let at: { anchor: string; title: string; lines: string[] } | null = null;
  const close = () => {
    if (at) sections.push({ anchor: at.anchor, title: at.title, text: at.lines.join('\n').trim() });
  };
  // the page drops its own # title, as /docs does
  for (const line of body.replace(/^# .+\r?\n?/, '').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const h = fence ? null : /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      const title = plain(h[2] as string);
      const anchor = slug(title);
      if ((h[1] as string).length <= 3) {
        close();
        at = { anchor, title, lines: [] };
        continue;
      }
    }
    (at ? at.lines : intro).push(line);
  }
  close();
  return { intro: intro.join('\n').trim(), sections };
}

interface Schema {
  $id?: string;
  description?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  $defs?: Record<string, Schema>;
}

/** A schema's words: its description, and each field's name and description. */
function schemaWords(s: Schema): string {
  const out: string[] = [s.description ?? ''];
  const walk = (node: Schema, path: string) => {
    for (const [k, v] of Object.entries(node.properties ?? {})) {
      const p = path ? `${path}.${k}` : k;
      out.push(v.description ? `${p}: ${v.description}` : p);
      walk(v, p);
    }
    if (node.items) walk(node.items, `${path}[]`);
    for (const d of Object.values(node.$defs ?? {})) walk(d, path);
  };
  walk(s, '');
  return out.filter(Boolean).join('\n');
}

/** Every page /docs shows, with its words, in the order its sections come. */
export function docsPages(root: string): DocPageText[] {
  const read = (p: string) => readFileSync(join(root, p), 'utf8');
  const files = (dir: string): string[] =>
    existsSync(join(root, dir))
      ? readdirSync(join(root, dir), { withFileTypes: true })
          .flatMap((e) => (e.isDirectory() ? files(`${dir}/${e.name}`) : [`${dir}/${e.name}`]))
          .sort()
      : [];
  const matches = (file: string, pattern: string) =>
    new RegExp(
      `^${pattern
        .split('*')
        .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*')}$`,
    ).test(file);
  const expand = (source: string): string[] => {
    if (source.endsWith('/'))
      return files(source.slice(0, -1)).filter((p) => /\.(md|json)$/.test(p));
    if (source.includes('*')) return files(posix.dirname(source)).filter((p) => matches(p, source));
    return [source];
  };
  const order = (p: string) => Number(field(matterOf(read(p)).matter, 'order') ?? 100);
  const pages: DocPageText[] = [];
  const add = (path: string, title: string, raw: string) => {
    const { matter, body } = matterOf(raw);
    const summary = ['for', 'recognise']
      .map((k) => field(matter, k))
      .filter(Boolean)
      .join('\n');
    pages.push({ path, title, summary, ...sectionsOf(body) });
  };
  const has = (path: string) => pages.some((p) => p.path === path);
  const indexes = files('docs')
    .filter((p) => p.endsWith('/index.md'))
    .sort((a, b) => order(a) - order(b));
  for (const index of indexes) {
    const raw = read(index);
    const { matter } = matterOf(raw);
    const dir = posix.dirname(index);
    add(index, field(matter, 'title') ?? dir.slice('docs/'.length), raw);
    const authored = files(dir)
      .filter((f) => f.endsWith('.md') && f !== index && !f.endsWith('/index.md'))
      .sort((a, b) => order(a) - order(b));
    const exclude = list(matter, 'exclude');
    for (const item of [...new Set([...authored, ...list(matter, 'include').flatMap(expand)])]) {
      if (exclude.some((p) => matches(posix.basename(item), p))) continue;
      if (has(item) || !existsSync(join(root, item))) continue;
      const text = read(item);
      if (item.endsWith('.json')) {
        pages.push({
          path: item,
          title: posix.basename(item, '.json'),
          summary: '',
          intro: text,
          sections: [],
        });
      } else {
        add(item, titleOf(text, posix.basename(item)), text);
      }
    }
    if (dir === 'docs/data-protocol') {
      // each format's newest version alone, as /docs shows them
      const version = (s: Schema) => /^urn:petal:schema:([^:]+):v(\d+)$/.exec(s.$id ?? '');
      const newest = new Map<string, number>();
      for (const raw of Object.values(schemas)) {
        const m = version(raw as Schema);
        if (m) newest.set(m[1] as string, Math.max(newest.get(m[1] as string) ?? 0, Number(m[2])));
      }
      for (const raw of Object.values(schemas)) {
        const s = raw as Schema;
        const m = version(s);
        if (!s.$id || (m && Number(m[2]) < (newest.get(m[1] as string) ?? 0)) || has(s.$id))
          continue;
        const name = s.$id.replace('urn:petal:schema:', '').replace(':', '/');
        pages.push({ path: s.$id, title: name, summary: '', intro: schemaWords(s), sections: [] });
      }
    }
  }
  return pages;
}

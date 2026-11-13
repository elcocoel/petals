// Search in /docs, the map's box on the docs: GET /api/v1/search with kinds=doc answers the files /docs renders,
// each by its path in the repository (a format by its schema's $id), with the sections that matched. Here each
// answer becomes a row: the page that renders that file, the first section that matched, and the words around
// the match. A path /docs doesn't render is left out. Pure.
import { mapSearchWords, type SearchBody } from './map-search.ts';

/** The search field's id: Cmd+K puts the cursor in it. */
export const DOCS_SEARCH_ID = 'docs-search';

export const docsSearchWords = {
  label: 'Search the docs',
  placeholder: 'Search the docs',
  none: 'Nothing in the docs matches.',
  searching: mapSearchWords.searching,
  ordering: mapSearchWords.ordering,
  failed: mapSearchWords.failed,
  wordsOnly: mapSearchWords.wordsOnly,
} as const;

/**
 * A docs page as the row needs it: where it's served, its title, the file it renders (or, for a format, its schema's
 * $id, since several formats share one file) and its section.
 */
export interface DocsPage {
  slug: string;
  title: string;
  source: string;
  schemaId?: string;
  section: string;
  overview?: boolean;
}

export interface DocsRow {
  /** where pressing it goes: the page, at the section that matched when there is one */
  href: string;
  title: string;
  /** the section that matched, by its heading, or null for the page as a whole */
  heading: string | null;
  /** the section's title in the docs' navigation */
  section: string;
  /** the words around the match, each piece saying whether it matched and where it starts; empty when none came */
  snippet: { text: string; hit: boolean; at: number }[];
}

/** The answers that are pages /docs renders, as rows, in search's order, one per page. */
export function docsRows(body: SearchBody, pages: readonly DocsPage[]): DocsRow[] {
  const sectionTitle = new Map(pages.filter((p) => p.overview).map((p) => [p.section, p.title]));
  const seen = new Set<string>();
  return body.results.flatMap((r) => {
    if (r.kind !== 'doc') return [];
    const page = pages.find((p) => (p.schemaId ?? p.source) === r.id);
    if (!page || seen.has(page.slug)) return [];
    seen.add(page.slug);
    const deep = r.matched?.find((m) => m.id.startsWith(`${r.id}#`));
    const anchor = deep ? deep.id.slice(r.id.length + 1) : '';
    return [
      {
        href: `/docs/${page.slug}${anchor ? `#${anchor}` : ''}`,
        title: page.title,
        heading: deep && anchor ? deep.title : null,
        section: sectionTitle.get(page.section) ?? page.section,
        snippet: (r.snippet ?? []).map((piece, i, all) => ({
          ...piece,
          at: all.slice(0, i).reduce((n, p) => n + p.text.length, 0),
        })),
      },
    ];
  });
}

/** The one quiet line over the rows: on its way, nothing found, words alone; or none. */
export function docsSearchStatus(
  q: string,
  busy: 'quick' | 'ordered' | null,
  got: { body: SearchBody | null } | null,
  rows: readonly DocsRow[] | null,
): string | null {
  if (!q.trim()) return null;
  if (busy === 'ordered') return docsSearchWords.ordering;
  if (!got) return docsSearchWords.searching;
  if (!got.body) return docsSearchWords.failed;
  if (rows && rows.length === 0) return busy ? docsSearchWords.searching : docsSearchWords.none;
  return got.body.meaning === 'off' ? docsSearchWords.wordsOnly : null;
}

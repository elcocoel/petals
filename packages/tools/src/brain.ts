// The brain's routing index (specs/005-mapping-brain/brain.md): made from the headers of its files,
// never written by hand, and checked against what exists. The files in brain/ are the only source;
// this index, and anything that serves it, is a projection of them.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256Hex } from '@petal/core';

export const BRAIN_INDEX_VERSION = 'brain-index/v1';

export interface BrainEntry {
  id: string;
  kind: 'doctrine' | 'chapter' | 'recipe';
  /** what it's for, in words */
  for: string;
  /** what it answers to: words for a chapter, the calls a contract answers for a recipe */
  recognise: string[];
  tools: string[];
  continues: string[];
  status: 'ready' | 'partial';
  /** the file, relative to brain/ */
  file: string;
  sha256: string;
}

export interface BrainIndex {
  petal: typeof BRAIN_INDEX_VERSION;
  entries: BrainEntry[];
}

/** A file's header: `key: value` lines between two `---` lines; lists are comma-separated. */
export function headerOf(text: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of (m[1] as string).split('\n')) {
    const at = line.indexOf(':');
    if (at > 0) out[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return out;
}

const list = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/** The index, made from the files in `dir` (the repo's brain/), in a fixed order. */
export function buildBrainIndex(dir: string): BrainIndex {
  const entries: BrainEntry[] = [];
  const read = (file: string) => readFileSync(join(dir, file), 'utf8');
  const doctrine = read('doctrine.md');
  entries.push({
    id: 'doctrine',
    kind: 'doctrine',
    for: headerOf(doctrine).for ?? 'what every answer holds to',
    recognise: [],
    tools: [],
    continues: [],
    status: 'ready',
    file: 'doctrine.md',
    sha256: sha256Hex(doctrine),
  });
  for (const name of readdirSync(join(dir, 'chapters'))
    .filter((f) => f.endsWith('.md'))
    .sort()) {
    const text = read(`chapters/${name}`);
    const h = headerOf(text);
    entries.push({
      id: h.id ?? name.replace(/\.md$/, ''),
      kind: 'chapter',
      for: h.for ?? '',
      recognise: list(h.recognise),
      tools: list(h.tools),
      continues: list(h.continues),
      status: h.status === 'ready' ? 'ready' : 'partial',
      file: `chapters/${name}`,
      sha256: sha256Hex(text),
    });
  }
  for (const name of readdirSync(join(dir, 'recipes'))
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    const text = read(`recipes/${name}`);
    const r = JSON.parse(text) as { id: string; for: string; recognise?: { answers?: string[] } };
    entries.push({
      id: r.id,
      kind: 'recipe',
      for: r.for,
      recognise: r.recognise?.answers ?? [],
      tools: ['get_snapshot', 'compose_view'],
      continues: ['where-power-lives', 'going-deeper'],
      status: 'ready',
      file: `recipes/${name}`,
      sha256: sha256Hex(text),
    });
  }
  return { petal: BRAIN_INDEX_VERSION, entries };
}

/** What's wrong with an index against what exists: an unknown tool, a continuation that isn't a
 * chapter, an id twice, or a doctrine that names a path. Empty when it's sound. */
export function brainProblems(
  index: BrainIndex,
  tools: readonly string[],
  doctrine: string,
): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const e of index.entries) {
    if (ids.has(e.id)) out.push(`${e.file}: the id ${e.id} is used twice`);
    ids.add(e.id);
    if (!e.for) out.push(`${e.file}: its header says nothing under for`);
  }
  const chapters = new Set(index.entries.filter((e) => e.kind === 'chapter').map((e) => e.id));
  for (const e of index.entries) {
    for (const t of e.tools) if (!tools.includes(t)) out.push(`${e.file}: no tool ${t}`);
    for (const c of e.continues)
      if (!chapters.has(c)) out.push(`${e.file}: no chapter ${c} to continue to`);
  }
  if (/[\w-]+\/[\w./-]+|\.(md|ts|json)\b/.test(doctrine.replace(/^---[\s\S]*?---\n/, '')))
    out.push('doctrine.md: it names a path, and the doctrine names none');
  return out;
}

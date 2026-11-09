// The brain's routing index (specs/005-mapping-brain/brain.md): made from the headers of its files,
// never written by hand, and checked against what exists. The files in brain/ are the only source;
// this index, and anything that serves it, is a projection of them.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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

// ---------------------------------------------------------------------------------------------
// The brain service (specs/005-mapping-brain/brain.md): the brain held in memory, stamped with the commit
// it came from, read again only when that commit moves. A merge is the change; nothing runs on a timer.

/** The brain as one commit holds it: the index, and every file by its id. */
export interface BrainCopy {
  commit: string | null;
  index: BrainIndex;
  texts: Map<string, string>;
}

/** The commit the repo holding `dir` is on, read from its `.git`; null when there's none (an image). */
export function gitCommitOf(dir: string): string | null {
  let d = resolve(dir);
  for (;;) {
    const git = join(d, '.git');
    if (existsSync(git)) {
      try {
        return headOf(git);
      } catch {
        return null;
      }
    }
    const up = dirname(d);
    if (up === d) return null;
    d = up;
  }
}

function headOf(git: string): string | null {
  // a worktree's .git is a file naming its git dir; its refs live in the common dir
  const gitDir = statSync(git).isFile()
    ? resolve(
        dirname(git),
        readFileSync(git, 'utf8')
          .trim()
          .replace(/^gitdir:\s*/, ''),
      )
    : git;
  const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
  if (!head.startsWith('ref:')) return head;
  const ref = head.slice(4).trim();
  const commonFile = join(gitDir, 'commondir');
  const common = existsSync(commonFile)
    ? resolve(gitDir, readFileSync(commonFile, 'utf8').trim())
    : gitDir;
  for (const base of [gitDir, common]) {
    const f = join(base, ref);
    if (existsSync(f)) return readFileSync(f, 'utf8').trim();
  }
  for (const base of [gitDir, common]) {
    const packed = join(base, 'packed-refs');
    if (!existsSync(packed)) continue;
    const line = readFileSync(packed, 'utf8')
      .split('\n')
      .find((l) => l.endsWith(` ${ref}`));
    if (line) return line.split(' ')[0] ?? null;
  }
  return null;
}

/** The brain in `dir`, as one copy. */
export function readBrain(dir: string, commit: string | null): BrainCopy {
  const index = buildBrainIndex(dir);
  const texts = new Map(index.entries.map((e) => [e.id, readFileSync(join(dir, e.file), 'utf8')]));
  return { commit, index, texts };
}

/**
 * The service: the copy for now, read again when the commit moves. `commitOf` says what the repo is on;
 * with no repo (a built image), the deploy's commit stands, and the copy is read once.
 */
export function brainService(dir: string, commitOf: () => string | null = () => gitCommitOf(dir)) {
  let copy: BrainCopy | null = null;
  return {
    dir,
    current(): BrainCopy {
      const commit = commitOf() ?? process.env.PETAL_COMMIT ?? null;
      if (!copy || copy.commit !== commit) copy = readBrain(dir, commit);
      return copy;
    },
  };
}

const services = new Map<string, ReturnType<typeof brainService>>();
/** One service per brain folder, for every door in this process. */
export function brainAt(dir: string) {
  let s = services.get(dir);
  if (!s) {
    s = brainService(dir);
    services.set(dir, s);
  }
  return s;
}

// -- routing (brain.md, "Routing"): the chain's answers first, then words ranked by BM25 over the headers

/** One way in, with why. */
export interface BrainRoute {
  id: string;
  kind: BrainEntry['kind'];
  for: string;
  file: string;
  status: BrainEntry['status'];
  /** what matched: the calls the contract answers, or the words */
  why: string;
  score: number;
}

const STOP = new Set(
  'a an and are as at be by can do does for from has have i in is it its me my of on or our so that the this to was we what which with you your'.split(
    ' ',
  ),
);

/** Lower-case words, with a plural or a verb's -s taken off, so "holders" meets "holder". */
export function wordsOf(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((w) => !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

/** What a header offers to words: its id, what it's for, and what it answers to, counted twice. */
function docWords(e: BrainEntry): string[] {
  return [
    ...wordsOf(e.id.replaceAll('-', ' ')),
    ...wordsOf(e.for),
    ...wordsOf(e.recognise.join(' ')),
    ...wordsOf(e.recognise.join(' ')),
  ];
}

const routeOf = (e: BrainEntry, why: string, score: number): BrainRoute => ({
  id: e.id,
  kind: e.kind,
  for: e.for,
  file: e.file,
  status: e.status,
  why,
  score: Math.round(score * 1000) / 1000,
});

/**
 * The best `n` ways in for a question in words, the calls a contract answers, or both. A recipe whose
 * recognised calls the contract answers comes first; words rank the rest. The doctrine is read always,
 * so it's never a route.
 */
export function routeBrain(
  index: BrainIndex,
  q: { words?: string; answers?: readonly string[] },
  n = 3,
): BrainRoute[] {
  const entries = index.entries.filter((e) => e.kind !== 'doctrine');
  const out: BrainRoute[] = [];
  const answers = new Set((q.answers ?? []).map((a) => a.trim()).filter(Boolean));
  if (answers.size) {
    for (const e of entries.filter((x) => x.kind === 'recipe' && x.recognise.length)) {
      const hit = e.recognise.filter((r) => answers.has(r));
      if (hit.length)
        out.push(
          routeOf(
            e,
            `the contract answers ${hit.join(', ')}`,
            10 + hit.length / e.recognise.length,
          ),
        );
    }
  }
  const asked = wordsOf(q.words ?? '');
  if (asked.length) {
    const docs = entries.map((e) => ({ e, words: docWords(e) }));
    const avg = docs.reduce((s, d) => s + d.words.length, 0) / Math.max(1, docs.length);
    const k1 = 1.2;
    const b = 0.75;
    const scored = docs.map(({ e, words }) => {
      let score = 0;
      const hit: string[] = [];
      for (const w of new Set(asked)) {
        const tf = words.filter((x) => x === w).length;
        if (!tf) continue;
        const df = docs.filter((d) => d.words.includes(w)).length;
        const idf = Math.log(1 + (docs.length - df + 0.5) / (df + 0.5));
        score += (idf * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * words.length) / avg));
        hit.push(w);
      }
      return { e, score, hit };
    });
    for (const s of scored.filter((x) => x.score > 0).sort((x, y) => y.score - x.score)) {
      if (!out.some((r) => r.id === s.e.id))
        out.push(routeOf(s.e, `words: ${s.hit.join(', ')}`, s.score));
    }
  }
  return out.sort((x, y) => y.score - x.score).slice(0, n);
}

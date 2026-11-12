// The brain's routing index (specs/005-mapping-brain/brain.md): made from the headers of its files,
// never written by hand, and checked against what exists. The files in brain/ are the only source;
// this index, and anything that serves it, is a projection of them.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { canonicalJson, sha256Hex } from '@petal/core';

export const BRAIN_INDEX_VERSION = 'brain-index/v2';

/**
 * The brain's departments (research/brain-departments-2026-11-11.md; Elco, 11 Nov: "The department's component
 * is important or else it becomes just a list that goes on forever"), as Elco named them. Every chapter and
 * recipe is in one; the doctrine is in none.
 */
export const BRAIN_DEPARTMENTS = [
  'connecting',
  'gathering',
  'governance',
  'money',
  'investigation',
  'services',
  'stewardship',
] as const;
export type BrainDepartment = (typeof BRAIN_DEPARTMENTS)[number];

export interface BrainEntry {
  id: string;
  kind: 'doctrine' | 'department' | 'chapter' | 'recipe';
  /** v2: the department it's in; null for the doctrine, which is in every answer */
  department: string | null;
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

/** One row of the master routing table (routing.md): a task, the words it answers to, and what it loads. */
export interface BrainTask {
  task: string;
  words: string[];
  /** ids: departments' hubs, chapters, recipes */
  load: string[];
  also: string[];
}

export interface BrainIndex {
  petal: typeof BRAIN_INDEX_VERSION;
  entries: BrainEntry[];
  /** v2: the master routing table's rows, in its order */
  tasks: BrainTask[];
}

/**
 * The master routing table, routing.md (research/brain-departments-2026-11-11.md, step 4): one authored file,
 * read by people and by the machine, so no second copy drifts. Each row: Task | Words | Load | Also load, with
 * the ids in backticks and "n/a" for none.
 */
export function routingOf(text: string): BrainTask[] {
  const ids = (cell: string) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1] as string);
  const out: BrainTask[] = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length !== 4 || cells[0] === 'Task' || /^-+$/.test(cells[0] as string)) continue;
    const [task, words, load, also] = cells as [string, string, string, string];
    out.push({ task, words: list(words), load: ids(load), also: ids(also) });
  }
  return out;
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
    department: null,
    for: headerOf(doctrine).for ?? 'what every answer holds to',
    recognise: [],
    tools: [],
    continues: [],
    status: 'ready',
    file: 'doctrine.md',
    sha256: sha256Hex(doctrine),
  });
  // each department's hub, <department>/README.md: what it holds, and when to use which of its chapters
  for (const d of BRAIN_DEPARTMENTS) {
    const file = `${d}/README.md`;
    const text = read(file);
    const h = headerOf(text);
    entries.push({
      id: h.id ?? d,
      kind: 'department',
      department: d,
      for: h.for ?? '',
      recognise: list(h.recognise),
      tools: [],
      continues: [],
      status: h.status === 'ready' ? 'ready' : 'partial',
      file,
      sha256: sha256Hex(text),
    });
  }
  // chapters and recipes, each in its department's folder: <department>/<id>.md, <department>/recipes/<id>.json
  const chapters: BrainEntry[] = [];
  const recipes: BrainEntry[] = [];
  for (const d of BRAIN_DEPARTMENTS) {
    for (const name of readdirSync(join(dir, d)).filter(
      (f) => f.endsWith('.md') && f !== 'README.md',
    )) {
      const file = `${d}/${name}`;
      const text = read(file);
      const h = headerOf(text);
      chapters.push({
        id: h.id ?? name.replace(/\.md$/, ''),
        kind: 'chapter',
        department: h.department ?? '',
        for: h.for ?? '',
        recognise: list(h.recognise),
        tools: list(h.tools),
        continues: list(h.continues),
        status: h.status === 'ready' ? 'ready' : 'partial',
        file,
        sha256: sha256Hex(text),
      });
    }
    if (!existsSync(join(dir, d, 'recipes'))) continue;
    for (const name of readdirSync(join(dir, d, 'recipes')).filter((f) => f.endsWith('.json'))) {
      const file = `${d}/recipes/${name}`;
      const text = read(file);
      const r = JSON.parse(text) as {
        id: string;
        department?: string;
        for: string;
        recognise?: { answers?: string[] };
      };
      recipes.push({
        id: r.id,
        kind: 'recipe',
        department: r.department ?? '',
        for: r.for,
        recognise: r.recognise?.answers ?? [],
        tools: ['get_snapshot', 'compose_view'],
        continues: ['where-power-lives', 'going-deeper'],
        status: 'ready',
        file,
        sha256: sha256Hex(text),
      });
    }
  }
  // in a fixed order, as before the folders: chapters by file name, then recipes
  const nameOf = (e: BrainEntry) => e.file.slice(e.file.lastIndexOf('/') + 1);
  const byName = (a: BrainEntry, b: BrainEntry) => (nameOf(a) < nameOf(b) ? -1 : 1);
  entries.push(...chapters.sort(byName), ...recipes.sort(byName));
  return { petal: BRAIN_INDEX_VERSION, entries, tasks: routingOf(read('routing.md')) };
}

/** What's wrong with an index against what exists: an unknown tool, a continuation that isn't a
 * chapter, an id twice, a chapter or recipe in no department Elco named, a routing row naming a file that isn't
 * there or a chapter in no row, or a doctrine that names a path. Empty when it's sound. */
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
    if (e.kind !== 'doctrine' && e.department && !e.file.startsWith(`${e.department}/`))
      out.push(
        `${e.file}: its header says ${e.department}, and it's in another department's folder`,
      );
    if (
      e.kind !== 'doctrine' &&
      !(BRAIN_DEPARTMENTS as readonly string[]).includes(e.department ?? '')
    )
      out.push(
        `${e.file}: ${e.department ? `no department ${e.department}` : 'its header names no department'} (${BRAIN_DEPARTMENTS.join(', ')})`,
      );
  }
  const chapters = new Set(index.entries.filter((e) => e.kind === 'chapter').map((e) => e.id));
  // routing.md: every row names files that exist, and every chapter is in a row
  const known = new Set(index.entries.filter((e) => e.kind !== 'doctrine').map((e) => e.id));
  const rowed = new Set<string>();
  for (const t of index.tasks) {
    if (!t.load.length) out.push(`routing.md: the row ${t.task} loads nothing`);
    for (const id of [...t.load, ...t.also]) {
      if (!known.has(id))
        out.push(`routing.md: the row ${t.task} names ${id}, which isn't in the brain`);
      rowed.add(id);
    }
  }
  for (const c of chapters)
    if (!rowed.has(c)) out.push(`routing.md: no row names the chapter ${c}`);
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
  /**
   * The brain's version: the hash of its index, which changes with any file, then the commit it came from,
   * as `<16 hex>@<12 hex>` (`@unknown` with no commit). The one version shown at every door and kept with
   * every layer (systems check, step 4).
   */
  version: string;
  index: BrainIndex;
  texts: Map<string, string>;
}

/** A brain's version, from its index and commit. */
export const brainVersionOf = (index: BrainIndex, commit: string | null) =>
  `${sha256Hex(canonicalJson(index)).slice(0, 16)}@${commit ? commit.slice(0, 12) : 'unknown'}`;

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
  return { commit, version: brainVersionOf(index, commit), index, texts };
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

// -- receipts (research/brain-departments-2026-11-11.md, step 5): brain-receipt/v1, the Harness's access log

/** One serving of the brain's text by a door, field for field the Harness's brain_access_log. */
export interface BrainReceipt {
  petal: 'brain-receipt/v1';
  id: string;
  at: string;
  version: string;
  keywords: string[];
  matched_entries: string[];
  served_docs: string[];
  doc_count: number;
  chars_served: number;
  core_doctrine: boolean;
  client_id: string | null;
  client_label: string | null;
  consumer_context: { run?: string; job?: string; exploration?: string; subject?: string } | null;
}

/** What brain_usage counts (step 7, the librarian's report, like the Harness's Pulse), from receipts only. */
export interface BrainCounts {
  since: string | null;
  reads: number;
  by_file: { id: string; reads: number }[];
  by_department: { department: string; reads: number }[];
  by_task: { task: string; reads: number }[];
  /** reads that asked something and were served nothing past the doctrine, and what they asked */
  nothing_matched: { reads: number; questions: string[] };
  per_read: { files: number; chars: number };
  by_door: { door: string | null; reads: number }[];
  by_app: { app: string | null; reads: number }[];
  by_version: { version: string; reads: number }[];
  /** the layers kept that carry the brain version they were read with */
  coverage: { layers: number; layers_with_brain: number };
}

/** Each key's count, the most first, then by key. */
function tally<K extends string | null>(keys: K[]): { key: K; reads: number }[] {
  const m = new Map<K, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m]
    .map(([key, reads]) => ({ key, reads }))
    .sort((a, b) => b.reads - a.reads || String(a.key).localeCompare(String(b.key)));
}

/** The counts, worked out from the receipts when asked; nothing is counted by hand. */
export function brainCounts(
  receipts: readonly BrainReceipt[],
  layers: { total: number; with_brain: number },
  since: string | null = null,
): BrainCounts {
  const n = receipts.length;
  const avg = (f: (r: BrainReceipt) => number) =>
    n ? Math.round((receipts.reduce((s, r) => s + f(r), 0) / n) * 100) / 100 : 0;
  const prefixed = (p: string) =>
    receipts.flatMap((r) =>
      r.matched_entries.filter((m) => m.startsWith(p)).map((m) => m.slice(p.length)),
    );
  const missed = receipts.filter(
    (r) => r.keywords.length && !r.served_docs.some((d) => d !== 'doctrine'),
  );
  return {
    since,
    reads: n,
    by_file: tally(receipts.flatMap((r) => r.served_docs)).map((t) => ({
      id: t.key,
      reads: t.reads,
    })),
    by_department: tally(prefixed('department: ')).map((t) => ({
      department: t.key,
      reads: t.reads,
    })),
    by_task: tally(prefixed('task: ')).map((t) => ({ task: t.key, reads: t.reads })),
    nothing_matched: {
      reads: missed.length,
      questions: [...new Set(missed.map((r) => r.keywords.join(' ')))],
    },
    per_read: { files: avg((r) => r.doc_count), chars: avg((r) => r.chars_served) },
    by_door: tally(receipts.map((r) => r.client_id)).map((t) => ({ door: t.key, reads: t.reads })),
    by_app: tally(receipts.map((r) => r.client_label)).map((t) => ({ app: t.key, reads: t.reads })),
    by_version: tally(receipts.map((r) => r.version)).map((t) => ({
      version: t.key,
      reads: t.reads,
    })),
    coverage: { layers: layers.total, layers_with_brain: layers.with_brain },
  };
}

// -- routing (brain.md, "Routing"): the chain's answers first, then words ranked by BM25 over the headers

/** One way in, with why. */
export interface BrainRoute {
  id: string;
  kind: BrainEntry['kind'];
  /** the department it's in */
  department: string | null;
  /** the routing table's row that brought it, or null when its own header matched */
  task: string | null;
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

/**
 * What a header offers to words: its id, what it's for, and what it answers to, counted twice. A department's
 * hub answers to its name only, so a question in a chapter's own words still reaches the chapter first.
 */
function docWords(e: BrainEntry): string[] {
  if (e.kind === 'department')
    return [...wordsOf(e.id), ...wordsOf(e.recognise.join(' ')), ...wordsOf(e.recognise.join(' '))];
  return [
    ...wordsOf(e.id.replaceAll('-', ' ')),
    ...wordsOf(e.for),
    ...wordsOf(e.recognise.join(' ')),
    ...wordsOf(e.recognise.join(' ')),
  ];
}

const routeOf = (
  e: BrainEntry,
  why: string,
  score: number,
  task: string | null = null,
): BrainRoute => ({
  id: e.id,
  kind: e.kind,
  department: e.department,
  task,
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
    const byId = new Map(entries.map((e) => [e.id, e]));
    type Doc =
      | { e: BrainEntry; t?: undefined; words: string[] }
      | { e?: undefined; t: BrainTask; words: string[] };
    const docs: Doc[] = [
      ...entries.map((e) => ({ e, words: docWords(e) })),
      // a routing row answers to its task's words and the words beside it
      ...index.tasks.map((t) => ({ t, words: wordsOf(`${t.task} ${t.words.join(' ')}`) })),
    ];
    const avg = docs.reduce((s, d) => s + d.words.length, 0) / Math.max(1, docs.length);
    const k1 = 1.2;
    const b = 0.75;
    const scored = docs.map(({ e, t, words }) => {
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
      return { e, t, score, hit };
    });
    for (const s of scored.filter((x) => x.score > 0).sort((x, y) => y.score - x.score)) {
      const { e: entry, t: task } = s;
      if (entry) {
        if (!out.some((r) => r.id === entry.id))
          out.push(routeOf(entry, `words: ${s.hit.join(', ')}`, s.score));
        continue;
      }
      if (!task) continue;
      // a row that fires brings what it loads, its chapters before its departments' hubs, then what it also loads
      const loads = [
        ...task.load.filter((id) => byId.get(id)?.kind !== 'department'),
        ...task.load.filter((id) => byId.get(id)?.kind === 'department'),
      ];
      const brings = [
        ...loads.map((id) => [id, 'loads'] as const),
        ...task.also.map((id) => [id, 'also loads'] as const),
      ];
      brings.forEach(([id, how], i) => {
        const e = byId.get(id);
        if (e && !out.some((r) => r.id === id))
          out.push(
            routeOf(
              e,
              `the task "${task.task}" ${how} it (words: ${s.hit.join(', ')})`,
              s.score - i / 1e6,
              task.task,
            ),
          );
      });
    }
  }
  return out.sort((x, y) => y.score - x.score).slice(0, n);
}

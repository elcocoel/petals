// Search by words and by meaning, with the embedding model on the server, to find a thing many different ways.
// Each document is ranked two ways: by its words (BM25, as the brain's routing ranks its headers) and by its
// meaning (the question's embedding against each document's). The
// two rankings are fused (reciprocal rank), and the reranker reads the question with the best of them and orders
// those. A document's vector is kept by the model and its text's sha256, so a text is embedded once, ever.
import { sha256Hex } from '@petal/core';
import type { SearchModel } from './search-model.ts';

/** Anything search can find: a map, a proposal, a claim, a chapter, a person's conversation or note. */
export interface Findable {
  kind: string;
  id: string;
  title: string;
  /** the words it's found by, its title's among them */
  text: string;
  /** what it's about or sits in (a proposal's map, a note's flower), when that's something else */
  about?: string | null;
  /** what it's shown under when results are grouped: a proposal under its map; itself when absent */
  group?: string;
  /** what it's called exactly (a name, a symbol, an address): typed as it is, it comes first */
  keys?: readonly string[];
  /** when it was last changed, for a person's own work */
  at?: string;
}

export interface Found extends Findable {
  score: number;
  /** how each way ranked it: 1 is first; absent where that way didn't find it */
  ranks: { words?: number; meaning?: number };
  /** the reranker's reading, 0 to 1, for the ones it read */
  rerank?: number;
  /** grouped: what else under it matched, best first (a map's proposals) */
  matched?: Omit<Found, 'matched'>[];
}

/** Where vectors are kept, by model and the sha256 of the text embedded. */
export interface VectorKeep {
  get(model: string, shas: readonly string[]): Promise<Map<string, Float32Array>>;
  put(model: string, rows: readonly { sha256: string; vector: Float32Array }[]): Promise<void>;
}

export function memoryVectors(): VectorKeep {
  const kept = new Map<string, Float32Array>();
  return {
    async get(model, shas) {
      const out = new Map<string, Float32Array>();
      for (const s of shas) {
        const v = kept.get(`${model}:${s}`);
        if (v) out.set(s, v);
      }
      return out;
    },
    async put(model, rows) {
      for (const r of rows) kept.set(`${model}:${r.sha256}`, r.vector);
    },
  };
}

// -- words

const STOP = new Set(
  'a an and are as at be by can do does for from has have i in is it its me my of on or our so that the this to was we what which who whom with you your'.split(
    ' ',
  ),
);

/** Lower-case words without accents, a plural's or a verb's -s taken off, so "holders" meets "holder". */
export function wordsOf(text: string): string[] {
  return (
    text
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  )
    .filter((w) => !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

/** The words of a set of documents, ready to rank: BM25's counts, built once per set. */
export interface WordIndex {
  docs: number;
  avg: number;
  lengthOf(at: number): number;
  /** a word's documents and how often it's in each */
  postingsOf(word: string): ReadonlyMap<number, number> | undefined;
  /** every word in the set */
  vocabulary(): Iterable<string>;
}

export function wordIndex(docs: readonly Findable[]): WordIndex {
  const postings = new Map<string, Map<number, number>>();
  const lengths: number[] = [];
  docs.forEach((d, i) => {
    const words = wordsOf(`${d.title} ${d.text}`);
    lengths.push(words.length);
    for (const w of words) {
      const p = postings.get(w) ?? new Map<number, number>();
      p.set(i, (p.get(i) ?? 0) + 1);
      postings.set(w, p);
    }
  });
  return {
    docs: docs.length,
    avg: lengths.reduce((s, n) => s + n, 0) / Math.max(1, lengths.length),
    lengthOf: (at) => lengths[at] as number,
    postingsOf: (w) => postings.get(w),
    vocabulary: () => postings.keys(),
  };
}

/** Two indexes as one, the second's documents after the first's, without copying either. */
function joinWords(a: WordIndex, b: WordIndex): WordIndex {
  const docs = a.docs + b.docs;
  return {
    docs,
    avg: (a.avg * a.docs + b.avg * b.docs) / Math.max(1, docs),
    lengthOf: (at) => (at < a.docs ? a.lengthOf(at) : b.lengthOf(at - a.docs)),
    postingsOf: (w) => {
      const pa = a.postingsOf(w);
      const pb = b.postingsOf(w);
      if (!pb) return pa;
      const out = new Map(pa ?? []);
      for (const [at, tf] of pb) out.set(at + a.docs, tf);
      return out;
    },
    vocabulary: function* () {
      yield* a.vocabulary();
      yield* b.vocabulary();
    },
  };
}

/**
 * BM25 (k1 1.2, b 0.75): each document with a word of the question, best first. With `prefix`, the last word
 * is also each word it begins (as someone types), each counted as that word.
 */
export function byWords(
  index: WordIndex,
  question: string,
  o: { prefix?: boolean } = {},
): { at: number; score: number }[] {
  const k1 = 1.2;
  const b = 0.75;
  const score = new Map<number, number>();
  const asked = wordsOf(question);
  const last = o.prefix && /[\p{L}\p{N}]$/u.test(question) ? asked.at(-1) : undefined;
  const words = new Set(asked);
  if (last) for (const w of index.vocabulary()) if (w.startsWith(last)) words.add(w);
  for (const w of words) {
    const p = index.postingsOf(w);
    if (!p) continue;
    const idf = Math.log(1 + (index.docs - p.size + 0.5) / (p.size + 0.5));
    for (const [at, tf] of p) {
      const len = index.lengthOf(at);
      score.set(
        at,
        (score.get(at) ?? 0) + (idf * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * len) / index.avg)),
      );
    }
  }
  return [...score].map(([at, s]) => ({ at, score: s })).sort((x, y) => y.score - x.score);
}

/** The words around the first of the question's in a text, in pieces, each saying whether it's a match. */
export function snippetOf(
  text: string,
  question: string,
  around = 16,
): { text: string; hit: boolean }[] {
  const asked = wordsOf(question);
  if (!asked.length) return [];
  const last = asked.at(-1) as string;
  const isHit = (w: string) => {
    const [n] = wordsOf(w);
    return !!n && (asked.includes(n) || n.startsWith(last));
  };
  const words = [...text.matchAll(/[\p{L}\p{N}]+/gu)];
  const first = words.findIndex((m) => isHit(m[0]));
  if (first < 0) return [];
  const from = Math.max(0, first - Math.floor(around / 3));
  const to = Math.min(words.length, from + around);
  const start = (words[from] as RegExpMatchArray).index as number;
  const lastWord = words[to - 1] as RegExpMatchArray;
  const end = (lastWord.index as number) + lastWord[0].length;
  const parts: { text: string; hit: boolean }[] = [];
  let at = start;
  for (const m of words.slice(from, to)) {
    const i = m.index as number;
    if (!isHit(m[0])) continue;
    if (i > at) parts.push({ text: text.slice(at, i), hit: false });
    parts.push({ text: m[0], hit: true });
    at = i + m[0].length;
  }
  if (end > at) parts.push({ text: text.slice(at, end), hit: false });
  return [
    ...(from > 0 ? [{ text: '…', hit: false }] : []),
    ...parts,
    ...(to < words.length ? [{ text: '…', hit: false }] : []),
  ];
}

// -- meaning

/** What's embedded of a document: its title and its words, as long as the model reads well. */
const EMBEDDED_CHARS = 1200;
export const embeddedText = (d: Findable) =>
  (d.text.startsWith(d.title) ? d.text : `${d.title}\n${d.text}`).slice(0, EMBEDDED_CHARS);

/** Each document's vector, embedding only the texts no vector is kept for yet, and keeping those. */
export async function vectorsOf(
  docs: readonly Findable[],
  model: SearchModel,
  keep: VectorKeep,
): Promise<Float32Array[]> {
  const texts = docs.map(embeddedText);
  const shas = texts.map((t) => sha256Hex(t));
  const kept = await keep.get(model.embedding, [...new Set(shas)]);
  const missing = [...new Set(shas.filter((s) => !kept.has(s)))];
  if (missing.length) {
    const textOf = new Map(shas.map((s, i) => [s, texts[i] as string]));
    const vectors = await model.embed(
      missing.map((s) => textOf.get(s) as string),
      'document',
    );
    const rows = missing.map((sha256, i) => ({ sha256, vector: vectors[i] as Float32Array }));
    await keep.put(model.embedding, rows);
    for (const r of rows) kept.set(r.sha256, r.vector);
  }
  return shas.map((s) => kept.get(s) as Float32Array);
}

/** Cosine (the vectors are unit length): every document, nearest first. */
export function byMeaning(
  vectors: readonly Float32Array[],
  question: Float32Array,
): { at: number; score: number }[] {
  return vectors
    .map((v, at) => {
      let s = 0;
      for (let i = 0; i < v.length; i++) s += (v[i] as number) * (question[i] as number);
      return { at, score: s };
    })
    .sort((x, y) => y.score - x.score);
}

// -- together

/** Reciprocal rank fusion: each way's rank counts 1/(60 + rank), so neither way's scale matters. */
const RRF_K = 60;

export interface FindOptions {
  /** how many to answer */
  n?: number;
  /** how many of the fused best the reranker reads; 0 reads none */
  rerank?: number;
  /** which ways rank: words, meaning, or both (the default) */
  ways?: 'words' | 'meaning' | 'both';
  /** how deep each way's list goes into the fusion */
  depth?: number;
  /** one answer per group (a map with the proposals that matched), each as its group's own document */
  group?: boolean;
  /** the question's last word also matches the words it begins, for search as someone types */
  prefix?: boolean;
  /** only the documents this keeps are ranked */
  only?: (d: Findable) => boolean;
  /**
   * grouped: how many groups' own documents (a map's card) the reranker also reads on their own ranking, so a
   * map with a few words isn't crowded out by one with hundreds of proposals
   */
  heads?: number;
}

/** A set of documents, ready to search: its words indexed, its vectors kept. */
export interface SearchSet {
  docs: readonly Findable[];
  words: WordIndex;
  vectors: readonly Float32Array[] | null;
  /** a document's place by its id */
  placeOf(id: string): number | undefined;
  /** the documents with this exact key */
  keyed(key: string): readonly number[];
}

const keyOf = (s: string) => s.trim().toLowerCase();

export async function searchSet(
  docs: readonly Findable[],
  model: SearchModel | null,
  keep: VectorKeep,
): Promise<SearchSet> {
  const byKey = new Map<string, number[]>();
  docs.forEach((d, i) => {
    for (const k of new Set((d.keys ?? []).map(keyOf))) byKey.set(k, [...(byKey.get(k) ?? []), i]);
  });
  const byId = new Map(docs.map((d, i) => [d.id, i]));
  return {
    docs,
    words: wordIndex(docs),
    vectors: model ? await vectorsOf(docs, model, keep) : null,
    placeOf: (id) => byId.get(id),
    keyed: (k) => byKey.get(keyOf(k)) ?? [],
  };
}

/** Two sets as one (the shared map's, kept, and a person's own, made for one search). */
export function joinSets(a: SearchSet, b: SearchSet): SearchSet {
  const n = a.docs.length;
  return {
    docs: [...a.docs, ...b.docs],
    words: joinWords(a.words, b.words),
    vectors: a.vectors && b.vectors ? [...a.vectors, ...b.vectors] : null,
    placeOf: (id) => {
      const at = b.placeOf(id);
      return at === undefined ? a.placeOf(id) : at + n;
    },
    keyed: (k) => [...a.keyed(k), ...b.keyed(k).map((at) => at + n)],
  };
}

/** A group's score from its members' fused scores, best first: the best, and half as much for each next. */
const groupScore = (scores: number[]) => scores.slice(0, 3).reduce((s, x, i) => s + x / 2 ** i, 0);

export async function find(
  set: SearchSet,
  question: string,
  model: SearchModel | null,
  o: FindOptions = {},
): Promise<Found[]> {
  const n = o.n ?? 10;
  const depth = o.depth ?? 100;
  const ways = o.ways ?? 'both';
  const ranks = new Map<number, { words?: number; meaning?: number; fused: number }>();
  const kept = o.only;
  const lists: { at: number }[][] = [];
  const add = (all: { at: number }[], way: 'words' | 'meaning') => {
    const list = kept ? all.filter(({ at }) => kept(set.docs[at] as Findable)) : all;
    lists.push(list);
    list.slice(0, depth).forEach(({ at }, i) => {
      const r = ranks.get(at) ?? { fused: 0 };
      r[way] = i + 1;
      r.fused += 1 / (RRF_K + i + 1);
      ranks.set(at, r);
    });
  };
  if (ways !== 'meaning') add(byWords(set.words, question, { prefix: o.prefix === true }), 'words');
  if (ways !== 'words' && model && set.vectors) {
    const [q] = await model.embed([question], 'question');
    add(byMeaning(set.vectors, q as Float32Array), 'meaning');
  }
  // a name, a symbol or an address typed as it is comes first, however the two ways ranked it
  for (const at of set.keyed(question).filter((x) => !kept || kept(set.docs[x] as Findable))) {
    const r = ranks.get(at) ?? { fused: 0 };
    r.fused += 1;
    ranks.set(at, r);
  }
  type Row = {
    at: number;
    score: number;
    r: { words?: number; meaning?: number };
    members: number[];
  };
  const fusedOf = (at: number) => ranks.get(at)?.fused ?? 0;
  let order: Row[];
  if (o.group) {
    const groups = new Map<string, number[]>();
    for (const [at] of [...ranks].sort((x, y) => y[1].fused - x[1].fused)) {
      const d = set.docs[at] as Findable;
      const g = d.group ?? d.id;
      groups.set(g, [...(groups.get(g) ?? []), at]);
    }
    order = [...groups].map(([g, members]) => {
      const head = set.placeOf(g) ?? (members[0] as number);
      return {
        at: head,
        score: groupScore(members.map(fusedOf)),
        r: ranks.get(head) ?? {},
        members: members.filter((m) => m !== head),
      };
    });
  } else {
    order = [...ranks].map(([at, r]) => ({ at, score: r.fused, r, members: [] }));
  }
  order.sort((x, y) => y.score - x.score);
  const textOf = (x: Row) =>
    [
      embeddedText(set.docs[x.at] as Findable),
      ...x.members.slice(0, 3).map((m) => (set.docs[m] as Findable).title),
    ].join('\n');
  const reread = Math.min(o.rerank ?? 0, order.length);
  const reranked = new Map<number, number>();
  if (reread && model) {
    const top = order.slice(0, reread);
    if (o.group) {
      // each group's own document on its own ranking too: a map's card competes with the maps, not the proposals
      const heads = o.heads ?? 10;
      const isHead = (at: number) => {
        const d = set.docs[at] as Findable;
        return (d.group ?? d.id) === d.id;
      };
      const own = new Map<number, number>();
      for (const list of lists) {
        list
          .filter(({ at }) => isHead(at))
          .slice(0, heads)
          .forEach(({ at }, i) => {
            own.set(at, (own.get(at) ?? 0) + 1 / (RRF_K + i + 1));
          });
      }
      const inTop = new Set(top.map((x) => x.at));
      for (const [at] of [...own].sort((x, y) => y[1] - x[1]).slice(0, heads)) {
        if (inTop.has(at)) continue;
        top.push(
          order.find((x) => x.at === at) ?? { at, score: 0, r: ranks.get(at) ?? {}, members: [] },
        );
      }
    }
    const scores = await model.rerank(question, top.map(textOf));
    top.forEach(({ at }, i) => {
      reranked.set(at, scores[i] as number);
    });
    // what's typed exactly stays first
    const exact = (x: Row) => (fusedOf(x.at) >= 1 ? 1 : 0);
    order = [
      ...top
        .map((x) => ({ ...x, score: (reranked.get(x.at) as number) + exact(x) }))
        .sort((x, y) => y.score - x.score),
      ...order.filter((x) => !top.includes(x)),
    ];
  }
  const shown = (at: number, score: number): Omit<Found, 'matched'> => {
    const d = set.docs[at] as Findable;
    const r: { words?: number; meaning?: number } = ranks.get(at) ?? {};
    return {
      ...d,
      score: Math.round(score * 10000) / 10000,
      ranks: {
        ...(r.words ? { words: r.words } : {}),
        ...(r.meaning ? { meaning: r.meaning } : {}),
      },
      ...(reranked.has(at)
        ? { rerank: Math.round((reranked.get(at) as number) * 1000) / 1000 }
        : {}),
    };
  };
  return order.slice(0, n).map((x) => ({
    ...shown(x.at, x.score),
    ...(o.group && x.members.length
      ? { matched: x.members.slice(0, 3).map((m) => shown(m, fusedOf(m))) }
      : {}),
  }));
}

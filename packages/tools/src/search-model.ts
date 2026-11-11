// Search's models (#105; Elco, 11 Nov: "can we run the model in the server in my machine"): Qwen3-Embedding and
// Qwen3-Reranker on Elco's Mac, behind oMLX (coordinator/search_model_up.sh), reached at PETAL_SEARCH_URL. No
// outside service. Embeddings are OpenAI-style (/v1/embeddings), reranking Cohere-style (/v1/rerank).

/** What a question is, to the embedding model (Qwen3-Embedding takes an instruction with each query, not documents). */
const TASK =
  'Given a question about on-chain organisations, their tokens, names, proposals and claims, or about how to map them, retrieve the passages it is about';

export interface SearchModel {
  /** the embedding model: what keeps a vector apart from another model's */
  embedding: string;
  /** one unit vector per text; a question is embedded with the task, a document without */
  embed(texts: readonly string[], as: 'question' | 'document'): Promise<Float32Array[]>;
  /** how well each document answers the question, 0 to 1, in the documents' order */
  rerank(question: string, documents: readonly string[]): Promise<number[]>;
}

// 4B over 0.6B (scripts/search-eval.ts, 11 Nov): a map without its name 17/26 first/top 3 against 15/20, a proposal
// in other words 12/12 against 8/10
export const SEARCH_EMBEDDING = 'Qwen3-Embedding-4B';
export const SEARCH_RERANKER = 'Qwen3-Reranker-4B';
/** texts per embedding request */
const BATCH = 64;

export class SearchModelDown extends Error {
  constructor(why: string) {
    super(`Search's model isn't answering: ${why}`);
  }
}

const unit = (v: number[]): Float32Array => {
  const out = Float32Array.from(v);
  let n = 0;
  for (const x of out) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < out.length; i++) out[i] = (out[i] as number) / n;
  return out;
};

export function searchModel(
  url: string,
  o: { embedding?: string; reranker?: string; fetch?: typeof fetch } = {},
): SearchModel {
  const base = url.replace(/\/+$/, '');
  const get = o.fetch ?? fetch;
  const embedding = o.embedding ?? SEARCH_EMBEDDING;
  const reranker = o.reranker ?? SEARCH_RERANKER;
  async function post<T>(path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await get(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new SearchModelDown((e as Error).message);
    }
    if (!res.ok) throw new SearchModelDown(`${path} answered ${res.status}`);
    return (await res.json()) as T;
  }
  return {
    embedding,
    async embed(texts, as) {
      const out: Float32Array[] = [];
      for (let i = 0; i < texts.length; i += BATCH) {
        const input = texts
          .slice(i, i + BATCH)
          .map((t) => (as === 'question' ? `Instruct: ${TASK}\nQuery:${t}` : t));
        const r = await post<{ data: { index: number; embedding: number[] }[] }>('/v1/embeddings', {
          model: embedding,
          input,
        });
        const byIndex = [...r.data].sort((a, b) => a.index - b.index);
        out.push(...byIndex.map((d) => unit(d.embedding)));
      }
      return out;
    },
    async rerank(question, documents) {
      if (!documents.length) return [];
      const r = await post<{ results: { index: number; relevance_score: number }[] }>(
        '/v1/rerank',
        {
          model: reranker,
          query: question,
          documents,
          return_documents: false,
        },
      );
      const scores = documents.map(() => 0);
      for (const x of r.results) scores[x.index] = x.relevance_score;
      return scores;
    },
  };
}

/**
 * A model for tests and fake mode, with no server: a text's words hashed into a vector, so meaning is shared
 * words, and the reranker's reading is the share of the question's words a document holds.
 */
export function fakeSearchModel(): SearchModel {
  const words = (t: string) =>
    (
      t
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .match(/[\p{L}\p{N}]+/gu) ?? []
    ).filter((w) => w.length > 2);
  const vector = (t: string) => {
    const v = new Array<number>(64).fill(0);
    for (const w of words(t)) {
      let h = 0;
      for (const ch of w) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
      v[h % 64] = (v[h % 64] as number) + 1;
    }
    return unit(v);
  };
  return {
    embedding: 'fake-words',
    embed: async (texts) => texts.map(vector),
    rerank: async (question, documents) => {
      const asked = new Set(words(question));
      return documents.map((d) => {
        const has = new Set(words(d));
        return asked.size ? [...asked].filter((w) => has.has(w)).length / asked.size : 0;
      });
    },
  };
}

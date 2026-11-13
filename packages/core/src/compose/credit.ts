// credit/v1 and points/v1 (specs/005-mapping-brain/composition.md, section 7b; data.md: "Credit or points for layers
// others build on"):
// for one author, from the record alone, every layer they published, the facts they stated first and those they
// matched, and who else used each layer. A layer earns one point for each distinct other account that built on it
// (through `from`, the whole chain back) or reused it (published a version that includes it), and that use's point
// goes only to the authors who had published the layer before the use was appended: copying earns nothing. Pure.
import { createAjv, schemaId } from '../schema/ajv.ts';
import type { Result, ValidationIssue } from '../types/index.ts';
import type { Entry } from './compose.ts';
import { COMPOSE_RULE, factsOf, layerTitle, slotOf } from './facts.ts';

export const CREDIT_VERSION = 'credit/v1';
export const POINTS_RULE = 'points/v1';

export interface CreditLayer {
  sha256: string;
  petal: string;
  /** the map it's about */
  map: string;
  title: string;
  /** the author's first publication that included it: its hash, place in the record and time */
  publication: string;
  seq: number;
  published_at: string;
  /** its facts this author added to the map first (new data, new moments, new subjects) */
  first: number;
  /** its facts someone had stated before, which this author confirmed independently */
  confirmed: number;
  /** other accounts whose published layers name it in `from`, the whole chain back, after it was published */
  built_on_by: string[];
  /** other accounts whose published versions include it, after it was published */
  reused_by: string[];
  /** distinct accounts across both, once each: points/v1 */
  built_on: number;
}

export interface Credit {
  petal: typeof CREDIT_VERSION;
  author: string;
  rule: typeof POINTS_RULE;
  compose: typeof COMPOSE_RULE;
  layers: CreditLayer[];
  /**
   * The three counts, who's helping a lot or a little: facts added to the map first, facts confirmed
   * independently, and accounts that built on their work, once per layer
   */
  totals: { layers: number; first: number; confirmed: number; built_on: number };
  /** the record it was computed from: every publication's hash, in the record's order */
  composed_from: string[];
}

let compiled: ReturnType<ReturnType<typeof createAjv>['getSchema']> | undefined;

/** The credit record, typed, or every reason it isn't one. */
export function validateCredit(x: unknown): Result<Credit> {
  compiled ??= createAjv().getSchema(schemaId('credit'));
  if (!compiled) throw new Error('credit schema not registered');
  if (compiled(x)) return { ok: true, value: x as Credit };
  return {
    ok: false,
    errors: (compiled.errors ?? []).map(
      (e): ValidationIssue => ({
        path: e.instancePath,
        rule: 'schema',
        message: e.message ?? 'invalid',
      }),
    ),
  };
}

/** The layers a document was built on (`from`), by hash; only layer/v1 names them today. */
const fromOf = (doc: unknown): string[] =>
  doc && typeof doc === 'object' && Array.isArray((doc as { from?: unknown }).from)
    ? ((doc as { from: unknown[] }).from.filter((x) => typeof x === 'string') as string[])
    : [];

/** One author's credit, from the whole record and the documents it names. */
export function creditOf(
  author: string,
  record: readonly Entry[],
  docs: ReadonlyMap<string, unknown>,
): Credit {
  const entries = [...record].sort((a, b) => a.seq - b.seq);
  // every chain of `from` back from a layer: what it was built on, directly or not
  const ancestry = new Map<string, Set<string>>();
  const ancestorsOf = (sha: string, path = new Set<string>()): Set<string> => {
    const known = ancestry.get(sha);
    if (known) return known;
    const out = new Set<string>();
    for (const parent of fromOf(docs.get(sha))) {
      if (path.has(parent)) continue;
      out.add(parent);
      for (const a of ancestorsOf(parent, new Set([...path, sha]))) out.add(a);
    }
    ancestry.set(sha, out);
    return out;
  };
  // the first time each author published each layer, and every use of a layer by anyone
  const firstBy = new Map<string, Entry>();
  for (const e of entries)
    for (const l of e.publication.layers) {
      const k = `${e.publication.author}\u0001${l.sha256}`;
      if (!firstBy.has(k)) firstBy.set(k, e);
    }
  // who first stated each fact on each map, in record order
  const firstStated = new Map<string, string>();
  for (const e of entries)
    for (const l of e.publication.layers)
      for (const f of factsOf(docs.get(l.sha256))) {
        const k = `${e.publication.about}\u0000${slotOf(f)}\u0000${f.value}`;
        if (!firstStated.has(k)) firstStated.set(k, e.publication.author);
      }
  const layers: CreditLayer[] = [];
  for (const [k, e] of firstBy) {
    const [who, sha] = k.split('\u0001') as [string, string];
    if (who !== author) continue;
    const petal = e.publication.layers.find((l) => l.sha256 === sha)?.petal ?? 'unknown';
    const reused = new Set<string>();
    const builtOn = new Set<string>();
    for (const later of entries) {
      const other = later.publication.author;
      if (later.seq <= e.seq || other === author) continue;
      for (const l of later.publication.layers) {
        if (l.sha256 === sha) reused.add(other);
        else if (ancestorsOf(l.sha256).has(sha)) builtOn.add(other);
      }
    }
    let first = 0;
    let matched = 0;
    const doc = docs.get(sha);
    const seen = new Set<string>();
    for (const f of factsOf(doc)) {
      const fk = `${e.publication.about}\u0000${slotOf(f)}\u0000${f.value}`;
      if (seen.has(fk)) continue;
      seen.add(fk);
      if (firstStated.get(fk) === author) first++;
      else matched++;
    }
    const accounts = new Set([...reused, ...builtOn]);
    layers.push({
      sha256: sha,
      petal,
      map: e.publication.about,
      title: doc ? layerTitle(doc) : 'a layer not here',
      publication: e.hash,
      seq: e.seq,
      published_at: e.publication.published_at,
      first,
      confirmed: matched,
      built_on_by: [...builtOn].sort(),
      reused_by: [...reused].sort(),
      built_on: accounts.size,
    });
  }
  layers.sort((a, b) => a.seq - b.seq || (a.sha256 < b.sha256 ? -1 : 1));
  return {
    petal: CREDIT_VERSION,
    author,
    rule: POINTS_RULE,
    compose: COMPOSE_RULE,
    layers,
    totals: {
      layers: layers.length,
      first: layers.reduce((n, l) => n + l.first, 0),
      confirmed: layers.reduce((n, l) => n + l.confirmed, 0),
      built_on: layers.reduce((n, l) => n + l.built_on, 0),
    },
    composed_from: entries.map((x) => x.hash),
  };
}

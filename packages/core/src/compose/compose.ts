// publication/v1 and compose/v1 (specs/005-mapping-brain/composition.md, sections 2, 5 and 6): publishing is an
// author signing one version of their dataset for a map; the record keeps every publication, in the order the
// server appended it; the map is every author's latest version, composed fact by fact. The same fact at the same
// moment is one fact, credited to every author who stated it; a different value in one slot "differs", and both
// stand. Nothing here reads a clock or the network: the same record gives the same map. Pure.
import { canonicalJson, sha256Hex } from '../hash.ts';
import { createAjv, schemaId } from '../schema/ajv.ts';
import { aboutKey } from '../seam.ts';
import type { Result, ValidationIssue } from '../types/index.ts';
import {
  COMPOSE_RULE,
  type Fact,
  factsOf,
  isManyValued,
  layerTitle,
  type State,
  slotOf,
  stateKey,
} from './facts.ts';

export const PUBLICATION_VERSION = 'publication/v1';
/** The author of what was loaded before the protocol: a collective label, never a signature. */
export const IMPORTED_AUTHOR = 'mapping.petals.near';

export interface Proof {
  standard: 'nep413' | 'eip191' | 'ed25519';
  signature: string;
  /** the text the wallet signed: its last line names the publication's unsigned hash */
  message: string;
  public_key?: string;
  nonce?: string;
  recipient?: string;
}

export interface Publication {
  petal: typeof PUBLICATION_VERSION;
  about: string;
  author: string;
  via: { kind: string; name: string; model?: string } | null;
  layers: { sha256: string; petal: string }[];
  /** the publication this version came from: the author's previous one, or another's (a fork) */
  parent: string | null;
  /** this author's previous publication about this map */
  previous: string | null;
  /** when the server prepared the press */
  published_at: string;
  /** null only for the import of what was loaded before the protocol */
  proof: Proof | null;
}

/** One entry of the record: the server's own order and time beside the signed body, and the body's name. */
export interface Entry {
  seq: number;
  appended_at: string;
  hash: string;
  publication: Publication;
  /** the qualifier's outcome for each of its layers, as the server recorded it on appending (0 to 1), if any */
  scores?: Record<string, number>;
}

let compiled: ReturnType<ReturnType<typeof createAjv>['getSchema']> | undefined;

/** The publication, typed, or every reason it isn't one. */
export function validatePublication(x: unknown): Result<Publication> {
  compiled ??= createAjv().getSchema(schemaId('publication'));
  if (!compiled) throw new Error('publication schema not registered');
  if (compiled(x)) return { ok: true, value: x as Publication };
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

/** A publication's name: the hash of its canonical JSON, proof included. */
export const publicationHash = (p: Publication) => sha256Hex(canonicalJson(p));

/** What the wallet's text names: the hash of the publication without its proof, so the proof covers every field. */
export const unsignedHash = (p: Omit<Publication, 'proof'> & { proof?: unknown }) => {
  const { proof: _, ...rest } = p;
  return sha256Hex(canonicalJson(rest));
};

/** The text the author's wallet signs: one line in words, then the publication's unsigned hash. */
export function signedText(p: Omit<Publication, 'proof'>, name: string): string {
  const n = p.layers.length;
  return `Petals: publish ${n} layer${n === 1 ? '' : 's'} about ${name} in your name.\nPublication ${unsignedHash(p)}`;
}

/** Does this text name this publication (its last line), as signedText writes it? */
export const textNames = (text: string, p: Publication) =>
  text.trimEnd().split('\n').at(-1) === `Publication ${unsignedHash(p)}`;

export interface Credited {
  author: string;
  /** the publication that first brought it, by its hash, and its place in the record */
  publication: string;
  seq: number;
  /** the qualifier's recorded outcome for the layer that brought it, if any */
  score?: number;
}

export interface Slot {
  subject: string;
  what: string;
  state: State;
  /** each value stated, the first stated first, with every author who stated it, first to last */
  values: { value: string; by: Credited[] }[];
  /** two or more values where one is expected: results should be deterministic, so someone should check */
  differs: boolean;
}

export interface ComposedLayer {
  sha256: string;
  petal: string;
  title: string;
  /** the whats and states it gives facts for */
  whats: string[];
  states: State[];
  facts: number;
  /** every author whose latest version includes it, first to last */
  by: Credited[];
}

export interface Composition {
  rule: typeof COMPOSE_RULE;
  about: string;
  /** the publications it was composed from: each author's latest, in record order */
  composed_from: string[];
  authors: { author: string; first_seq: number; latest: string; imported: boolean }[];
  layers: ComposedLayer[];
  slots: Slot[];
  differs: number;
  /** layers named by a publication whose document isn't here: listed, giving no facts */
  missing: string[];
}

/** The record's entries about one map, in the record's own order. */
export function entriesAbout(entries: readonly Entry[], about: string): Entry[] {
  const key = aboutKey(about);
  return entries.filter((e) => aboutKey(e.publication.about) === key).sort((a, b) => a.seq - b.seq);
}

/** Each author's latest publication about the map, by when each first published on it. */
export function latestOf(entries: readonly Entry[]): Entry[] {
  const latest = new Map<string, Entry>();
  const first = new Map<string, number>();
  for (const e of [...entries].sort((a, b) => a.seq - b.seq)) {
    if (!first.has(e.publication.author)) first.set(e.publication.author, e.seq);
    latest.set(e.publication.author, e);
  }
  return [...latest.values()].sort(
    (a, b) =>
      (first.get(a.publication.author) as number) - (first.get(b.publication.author) as number),
  );
}

/**
 * The map composed from the record (compose/v1): each author's latest version, fact by fact. A fact's authors are
 * those whose latest version states it, each credited from the first of their publications that stated it.
 */
export function compose(
  about: string,
  record: readonly Entry[],
  docs: ReadonlyMap<string, unknown>,
): Composition {
  const entries = entriesAbout(record, about);
  const latest = latestOf(entries);
  // when each author first stated each fact (slot and value), over all their publications about the map
  const firstStated = new Map<string, Credited>();
  const factsCache = new Map<string, Fact[]>();
  const facts = (sha: string) => {
    let f = factsCache.get(sha);
    if (!f) {
      f = factsOf(docs.get(sha));
      factsCache.set(sha, f);
    }
    return f;
  };
  const factKey = (author: string, f: Fact) => `${author}\u0001${slotOf(f)}\u0001${f.value}`;
  const layerFirst = new Map<string, Credited>();
  for (const e of entries)
    for (const l of e.publication.layers) {
      const score = e.scores?.[l.sha256];
      const credited: Credited = {
        author: e.publication.author,
        publication: e.hash,
        seq: e.seq,
        ...(score !== undefined ? { score } : {}),
      };
      const lk = `${e.publication.author}\u0001${l.sha256}`;
      if (!layerFirst.has(lk)) layerFirst.set(lk, credited);
      for (const f of facts(l.sha256)) {
        const k = factKey(e.publication.author, f);
        if (!firstStated.has(k)) firstStated.set(k, credited);
      }
    }
  const slots = new Map<string, Slot>();
  const layers = new Map<string, ComposedLayer>();
  const missing = new Set<string>();
  for (const e of latest) {
    const author = e.publication.author;
    const seen = new Set<string>();
    for (const l of e.publication.layers) {
      if (!docs.has(l.sha256)) missing.add(l.sha256);
      const fs = facts(l.sha256);
      let layer = layers.get(l.sha256);
      if (!layer) {
        const whats = [...new Set(fs.map((f) => f.what))].sort();
        const states = [...new Map(fs.map((f) => [stateKey(f.state), f.state])).values()];
        layer = {
          sha256: l.sha256,
          petal: l.petal,
          title: docs.has(l.sha256) ? layerTitle(docs.get(l.sha256)) : 'a layer not here',
          whats,
          states,
          facts: fs.length,
          by: [],
        };
        layers.set(l.sha256, layer);
      }
      layer.by.push(layerFirst.get(`${author}\u0001${l.sha256}`) as Credited);
      for (const f of fs) {
        // an author stating one fact in two of their layers is credited for it once
        const k = factKey(author, f);
        if (seen.has(k)) continue;
        seen.add(k);
        const sk = slotOf(f);
        let slot = slots.get(sk);
        if (!slot) {
          slot = { subject: f.subject, what: f.what, state: f.state, values: [], differs: false };
          slots.set(sk, slot);
        }
        let v = slot.values.find((x) => x.value === f.value);
        if (!v) {
          v = { value: f.value, by: [] };
          slot.values.push(v);
        }
        v.by.push(firstStated.get(k) as Credited);
      }
    }
  }
  const qualified = (v: Slot['values'][number]) =>
    Math.max(-1, ...v.by.map((b) => (b.score === undefined ? -1 : b.score)));
  const out: Slot[] = [];
  for (const slot of slots.values()) {
    for (const v of slot.values) v.by.sort((a, b) => a.seq - b.seq);
    // where values differ, the first shown is the qualifier's best, then the one stated first; the others stand
    // beside it, to switch to (Elco, 13 Nov: "let's not make this more complicated than it has to be")
    slot.values.sort(
      (a, b) =>
        qualified(b) - qualified(a) ||
        (a.by[0]?.seq ?? 0) - (b.by[0]?.seq ?? 0) ||
        (a.value < b.value ? -1 : 1),
    );
    slot.differs = slot.values.length > 1 && !isManyValued(slot.what);
    out.push(slot);
  }
  out.sort((a, b) => (slotKey(a) < slotKey(b) ? -1 : 1));
  for (const l of layers.values()) l.by.sort((a, b) => a.seq - b.seq);
  return {
    rule: COMPOSE_RULE,
    about: aboutKey(about),
    composed_from: latest.map((e) => e.hash),
    authors: latest.map((e) => ({
      author: e.publication.author,
      first_seq: entries.find((x) => x.publication.author === e.publication.author)?.seq as number,
      latest: e.hash,
      imported: e.publication.proof === null,
    })),
    layers: [...layers.values()].sort((a, b) => (a.by[0]?.seq ?? 0) - (b.by[0]?.seq ?? 0)),
    slots: out,
    differs: out.filter((s) => s.differs).length,
    missing: [...missing].sort(),
  };
}

const slotKey = (s: Slot) => `${s.subject}\u0000${s.what}\u0000${stateKey(s.state)}`;

/** The four cases (section 5), for what a layer would bring to a composed map. */
export interface Cases {
  new_data: { whats: string[] };
  new_moment: { states: { what: string; state: State; newest: State | null }[] };
  new_subjects: { count: number };
  match: { count: number; authors: string[] };
  differs: { count: number; authors: string[] };
}

const instant = (s: State) => (s.at ? Date.parse(s.at) : (s.block ?? 0));

/** Which of the four cases each fact of a layer would be on this map, as its author would publish it. */
export function casesOf(map: Composition, doc: unknown, author: string): Cases {
  const bySlot = new Map(map.slots.map((s) => [slotKey(s), s]));
  const whats = new Map<string, State[]>();
  const subjectsAt = new Set<string>();
  for (const s of map.slots) {
    whats.set(s.what, [...(whats.get(s.what) ?? []), s.state]);
    subjectsAt.add(`${s.what}\u0000${stateKey(s.state)}`);
  }
  const out: Cases = {
    new_data: { whats: [] },
    new_moment: { states: [] },
    new_subjects: { count: 0 },
    match: { count: 0, authors: [] },
    differs: { count: 0, authors: [] },
  };
  const newData = new Set<string>();
  const newMoments = new Map<string, Cases['new_moment']['states'][number]>();
  const matchBy = new Set<string>();
  const differBy = new Set<string>();
  for (const f of factsOf(doc)) {
    const states = whats.get(f.what);
    if (!states) {
      newData.add(f.what);
      continue;
    }
    if (!subjectsAt.has(`${f.what}\u0000${stateKey(f.state)}`)) {
      const k = `${f.what}\u0000${stateKey(f.state)}`;
      if (!newMoments.has(k)) {
        const newest = states.reduce<State | null>(
          (a, b) => (!a || instant(b) > instant(a) ? b : a),
          null,
        );
        newMoments.set(k, { what: f.what, state: f.state, newest });
      }
      continue;
    }
    const slot = bySlot.get(slotOf(f));
    if (!slot) {
      out.new_subjects.count++;
      continue;
    }
    const same = slot.values.find((v) => v.value === f.value);
    const others = (vs: typeof slot.values) =>
      vs.flatMap((v) => v.by.map((b) => b.author)).filter((a) => a !== author);
    if (same) {
      out.match.count++;
      for (const a of others([same])) matchBy.add(a);
    } else if (isManyValued(f.what)) {
      out.new_subjects.count++;
    } else {
      out.differs.count++;
      for (const a of others(slot.values)) differBy.add(a);
    }
  }
  out.new_data.whats = [...newData].sort();
  out.new_moment.states = [...newMoments.values()];
  out.match.authors = [...matchBy].sort();
  out.differs.authors = [...differBy].sort();
  return out;
}

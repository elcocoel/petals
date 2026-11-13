// A map is made by many people, their data layers adding up to fuller maps (specs/005-mapping-brain/data.md:
// a dataset is the layers anyone adds, each one set of
// facts from one author at one time, never changed after). Its layers as strata, the newest on top: what each holds,
// how it stands (read from the chain, inferred, or a lead), what it covers (a block, a date or a window), who kept it
// and when, how it was read, what it was built on, and whether it's on in the map you see. 'Not recorded' wherever
// the record has nothing. Pure.

import type { State } from '@petal/core';
import { chainLabel } from './flower-view.ts';

export type Standing = 'verified' | 'inferred' | 'lead';

/**
 * Who published a layer (composition.md §2): the signing account, or Petals' own import of what was loaded before the
 * protocol, said plainly as imported and unsigned. Several can publish one layer: each is credited.
 */
export interface StrataAuthor {
  /** the account, as people read it (alice.near, 0x12…ab), or Petals' mapping */
  name: string;
  /** signed by its wallet; false for the import */
  signed: boolean;
  /** when they published it, in words */
  published: string | null;
  /** on this map: facts added first, confirmed, and accounts that built on their work, where the record says */
  counts?: { first: number; confirmed: number; builtOn: number } | null;
}

/** One layer of a map, as Information lists it. */
export interface StrataLayer {
  /** its hash: a layer is named by what it holds */
  id: string;
  /** what it holds, in people's words */
  title: string;
  /** what kind of document it is, in people's words: a reading, a price, proposals, a mark, vesting … */
  kind: string;
  standing: Standing | null;
  /** the moment on the chain it states, or the window it covers, in words */
  covers: string | null;
  /** its authors, first to last; empty where none is recorded */
  authors: readonly StrataAuthor[];
  /** when it was read (collected-at), in words */
  read: string | null;
  /** how many layers it was built on */
  builtOn: number;
  /** the account that first published it: its stratum's colour */
  firstBy?: string | null;
}

export const strataWords = {
  title: 'Layers',
  standing: {
    verified: 'Read from the chain',
    inferred: 'Inferred',
    lead: 'A lead',
  } as Record<Standing, string>,
  notRecorded: 'not recorded',
  by: (who: string) => `by ${who}`,
  and: (who: string) => `and ${who}`,
  counts: (first: number, confirmed: number, builtOn: number) =>
    `on this map: ${first.toLocaleString('en-US')} added first · ${confirmed.toLocaleString('en-US')} confirmed · ${builtOn.toLocaleString('en-US')} built on it`,
  imported: 'imported, unsigned',
  read: (when: string) => `read ${when}`,
  builtOn: (n: number) => (n === 1 ? 'built on 1 layer' : `built on ${n} layers`),
  joined: 'Just added, in your name',
  differs: (n: number) =>
    `${n.toLocaleString('en-US')} ${n === 1 ? 'fact differs' : 'facts differ'} between authors on this map: both values stand, and anyone can check. Two reads of one block should agree, so one is probably wrong.`,
  on: (title: string) => `Show ${title} on the map`,
} as const;

/** A layer's swatch for its standing: read from the chain mint, inferred apricot, a lead grey (the look's keys). */
export const standingSwatch = (s: Standing | null): string =>
  s === 'verified' ? 'key-mint' : s === 'inferred' ? 'key-apricot' : 'key-grey';

/** Who published a layer, in words: the first author and when, then the others; 'not recorded' where none is. */
export function authorsLine(authors: readonly StrataAuthor[]): string {
  const [first, ...rest] = authors;
  if (!first) return strataWords.by(strataWords.notRecorded);
  const one = (a: StrataAuthor) =>
    [
      a.name,
      a.signed ? null : strataWords.imported,
      a.published,
      a.counts
        ? `(${strataWords.counts(a.counts.first, a.counts.confirmed, a.counts.builtOn)})`
        : null,
    ]
      .filter(Boolean)
      .join(', ');
  return [strataWords.by(one(first)), ...rest.map((a) => strataWords.and(one(a)))].join(' ');
}

/** A layer's line under its title: its kind and standing, what it covers, when it was read, what it rests on. */
export function strataLine(l: StrataLayer): string {
  return [
    l.kind,
    l.standing ? strataWords.standing[l.standing] : null,
    l.covers,
    l.read ? strataWords.read(l.read) : null,
    l.builtOn > 0 ? strataWords.builtOn(l.builtOn) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** A map's layers as GET /api/v1/maps/:id gives them (composition.md §9). */
export interface CardLayer {
  sha256: string;
  petal: string;
  title?: string | null;
  whats?: readonly string[];
  /** the moments it states (core's compose State): a chain's block, or an instant, and a span's from and to */
  states?: readonly State[];
  collected_at?: string | null;
  source?: string | { name?: string } | null;
  /** its authors' accounts, first to last */
  by?: readonly string[];
  first?: { author: string; publication: string; published_at: string } | null;
}
export interface CardAuthor {
  author: string;
  name?: string | null;
  imported?: boolean;
  /** on this map, from credit/v1, how much each one helps: facts they added first, facts
   * they confirmed, and accounts that built on their work */
  first?: number;
  confirmed?: number;
  built_on?: number;
}

/** What each kind of document is, in people's words (composition.md §1). */
const KIND_WORDS: Record<string, string> = {
  snapshot: 'a reading',
  value: 'a price and treasury',
  proposals: 'proposals and votes',
  mark: 'a name and logo',
  vesting: 'vesting',
  payouts: 'payouts',
  layer: 'a layer',
  claims: 'claims',
  claim: 'a claim',
};
const kindOf = (petal: string) => KIND_WORDS[petal.split('/')[0] ?? petal] ?? petal;

/** 2026-11-12T… as '12 Nov 2026'. */
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** A state's span, by its key in core's State. */
const SPAN = 'window' as const;

/** What a layer states: its blocks, its instants or its spans, in words. */
function coversOf(states: CardLayer['states']): string | null {
  const words = (states ?? []).map((s) => {
    // core names a state's span by a word that reads as the browser's, so it's reached by its key
    const span = s[SPAN];
    if (span) return `${day(span.from)} to ${day(span.to)}`;
    if (s.block !== undefined) {
      const chain = s.chain ? chainLabel(s.chain) : null;
      return `${chain ? `${chain} ` : ''}block ${s.block.toLocaleString('en-US')}`;
    }
    if (s.at) return `as of ${day(s.at)}`;
    return null;
  });
  const said = [...new Set(words.filter((w): w is string => Boolean(w)))];
  return said.length > 0 ? said.join(', ') : null;
}

/** Long addresses in a title, said by their ends, their chain prefix dropped. */
const shortAddresses = (title: string) =>
  title.replace(
    /(?:[a-z0-9-]+:[a-zA-Z0-9-]+:)?(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})/g,
    (_, a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`,
  );

/** An account as people read it: a NEAR name whole, a long address at its ends. */
const accountWords = (a: string) => {
  const bare = a.split(':').at(-1) ?? a;
  return bare.length > 20 ? `${bare.slice(0, 6)}…${bare.slice(-4)}` : bare;
};

/**
 * A map's layers for the strata, oldest first (by when each was first published, then its hash: the record's own
 * order), each author named as the map's authors list says, Petals' import said as imported and unsigned.
 */
export function strataOf(
  layers: readonly CardLayer[],
  authors: readonly CardAuthor[],
): StrataLayer[] {
  const who = new Map(authors.map((a) => [a.author, a] as const));
  const named = (account: string, published: string | null): StrataAuthor => {
    const a = who.get(account);
    return {
      name: a?.name ?? accountWords(account),
      signed: !(a?.imported ?? false),
      published,
      counts:
        a && a.first !== undefined && a.confirmed !== undefined && a.built_on !== undefined
          ? { first: a.first, confirmed: a.confirmed, builtOn: a.built_on }
          : null,
    };
  };
  return [...layers]
    .sort(
      (a, b) =>
        (a.first?.published_at ?? '').localeCompare(b.first?.published_at ?? '') ||
        a.sha256.localeCompare(b.sha256),
    )
    .map((l) => ({
      id: l.sha256,
      // a long address said by its ends, as Insights says it ('named 0x35b2…36f1')
      title: l.title ? shortAddresses(l.title) : kindOf(l.petal),
      kind: kindOf(l.petal),
      standing: null,
      covers: coversOf(l.states),
      authors: (l.by ?? []).map((account, i) =>
        named(account, i === 0 && l.first ? day(l.first.published_at) : null),
      ),
      read: l.collected_at ? day(l.collected_at) : null,
      builtOn: 0,
      firstBy: l.first?.author ?? l.by?.[0] ?? null,
    }));
}

/**
 * Each author's colour on the strata, by when they first published on this map: the look's keys in order, Petals'
 * own import in grey, so a map made by many people reads at a glance.
 */
export function authorSwatches(
  layers: readonly StrataLayer[],
  authors: readonly CardAuthor[],
): Map<string, string> {
  const imported = new Set(authors.filter((a) => a.imported).map((a) => a.author));
  const keys = ['key-mint', 'key-blue', 'key-coral', 'key-apricot', 'key-pink'];
  const out = new Map<string, string>();
  let next = 0;
  for (const l of layers) {
    const a = l.firstBy;
    if (!a || out.has(a)) continue;
    out.set(a, imported.has(a) ? 'key-grey' : (keys[next++ % keys.length] as string));
  }
  return out;
}

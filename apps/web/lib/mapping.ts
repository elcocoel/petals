// /make's two states, exploring and mapping; the mapping state shows clearly which data layers and claims it adds.
// Exploring reads what's there; mapping is what the person would add to the map in front of them, in their name.
// Each layer they'd publish says what it adds to that map, by the cases of the composition
// (specs/005-mapping-brain/composition.md §4): new data, a new moment, new subjects, a match credited to every
// author who stated it, or a value that differs, both standing. No one's layer wins. Then what can't go yet and
// why, and the press. The case words are written once, here; Information says them too.
import type { State } from '@petal/core';
import type {
  CreditedAuthor,
  LayerCases,
  MapCase,
  PublishAdds,
  PublishableData,
  PublishedVersion,
  PublishLayer,
} from './agent-client.ts';

export type Mode = 'exploring' | 'mapping';

export const modeWords = {
  exploring: 'Exploring',
  mapping: 'Mapping',
  heading: (name: string | null) => (name ? `Mapping ${name}` : 'Mapping'),
  intro: 'What you’d add to it, in your name',
  /** one line per layer: Insights · Names · 35 */
  adds: (a: PublishAdds) =>
    a.label === a.layer ? `${a.layer} · ${a.count}` : `${a.layer} · ${a.label} · ${a.count}`,
  later: 'Not yet',
  noMap: 'Go into a map to see what you’d add to it.',
  nothing:
    'Nothing of yours to add here yet. Map something new, or add a note or a name to a petal.',
} as const;

/** The cases in the order the box says them: what's new first, then what meets what's there. */
export const MAP_CASES: readonly MapCase[] = [
  'new_data',
  'new_moment',
  'new_subjects',
  'match',
  'differs',
];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Who a match or a difference meets on the map: alice.near, or alice.near and 2 others. */
const whose = (authors: readonly CreditedAuthor[]) => {
  const [first, ...rest] = authors;
  if (!first) return 'another author';
  return rest.length ? `${first.name} and ${plural(rest.length, 'other', 'others')}` : first.name;
};

/** Thousands with commas, for blocks too big for a number: 465695924 → 465,695,924. */
const grouped = (n: number | string) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** A point of a window: a date as its day, else a block. */
const pointWords = (p: number | string) =>
  typeof p === 'string' && Number.isNaN(Number(p)) && !Number.isNaN(Date.parse(p))
    ? day(p)
    : `block ${grouped(p)}`;

/** The formats whose name says nothing a person needs: their data reads by its own name. */
const PLAIN = new Set(['snapshot', 'layer', 'value', 'mark']);

/** A fact's data, in words (composition.md §8): vesting/schedule → vesting schedule; snapshot/token_balance TRUMP → token balance TRUMP. */
export function whatWords(what: string): string {
  const cut = what.indexOf('/');
  const format = cut < 0 ? '' : what.slice(0, cut);
  const rest = (cut < 0 ? what : what.slice(cut + 1)).replaceAll('_', ' ');
  return PLAIN.has(format) || !format ? rest : `${format} ${rest}`;
}

/** A state's window, by its key: lib/ reaches for no browser global, not even by a field's name (as map-strata.ts). */
const SPAN = 'window' as const;

/** When on the chain a fact holds, in words: block 465,695,924, or 11 Nov; and its window. */
export function stateWords(s: State): string {
  const at = s.block !== undefined ? `block ${grouped(s.block)}` : s.at ? day(s.at) : null;
  const w = s[SPAN];
  const span = w ? `${pointWords(w.from)} to ${pointWords(w.to)}` : null;
  return [at, span].filter(Boolean).join(', ') || 'a moment';
}

/** The words for the cases, before a press (the Mapping box) and after it (Information). */
export const caseWords = {
  tag: {
    new_data: 'New data',
    new_moment: 'New moment',
    new_subjects: 'New subjects',
    match: 'Match',
    differs: 'Differs',
  } satisfies Record<MapCase, string>,
  /** a layer's line: what it brings, in words */
  line: {
    new_data: (c: NonNullable<LayerCases['new_data']>) =>
      `The map has no ${c.whats.map(whatWords).join(', ')} yet`,
    new_moment: (c: NonNullable<LayerCases['new_moment']>) =>
      [
        ...new Set(
          c.states.map(({ state, newest }) =>
            newest
              ? `${stateWords(state)}; the map’s newest is ${stateWords(newest)}`
              : stateWords(state),
          ),
        ),
      ].join(' · '),
    new_subjects: (c: NonNullable<LayerCases['new_subjects']>) =>
      `${plural(c.count, 'subject', 'subjects')} the map had no facts for`,
    match: (c: NonNullable<LayerCases['match']>) =>
      `${plural(c.count, 'fact', 'facts')} the same as ${whose(c.authors)}’s, credited to ${c.authors.length > 1 ? 'each of you' : 'both of you'}`,
    differs: (c: NonNullable<LayerCases['differs']>) =>
      `${plural(c.count, 'fact', 'facts')} where ${whose(c.authors)} read another value; both stand, for anyone to check`,
  },
  /** a count in the summary over the press: 1 new kind of data · 212 new subjects · 60 facts match */
  count: {
    new_data: (n: number) => plural(n, 'new kind of data', 'new kinds of data'),
    new_moment: (n: number) => plural(n, 'new moment', 'new moments'),
    new_subjects: (n: number) => plural(n, 'new subject', 'new subjects'),
    match: (n: number) => `${plural(n, 'fact', 'facts')} ${n === 1 ? 'matches' : 'match'}`,
    differs: (n: number) => `${plural(n, 'fact', 'facts')} ${n === 1 ? 'differs' : 'differ'}`,
  } satisfies Record<MapCase, (n: number) => string>,
  /** Information's heading on a publication that just landed */
  justAdded: 'Just added, in your name',
} as const;

/** How many of each case, as the summary counts them. */
export type MapCases = Partial<Record<MapCase, number>>;

/** The counts of a set of cases: kinds of data, moments, subjects, facts. */
export const countsOf = (c: LayerCases): MapCases => ({
  ...(c.new_data ? { new_data: c.new_data.whats.length } : {}),
  ...(c.new_moment ? { new_moment: c.new_moment.states.length } : {}),
  ...(c.new_subjects ? { new_subjects: c.new_subjects.count } : {}),
  ...(c.match ? { match: c.match.count } : {}),
  ...(c.differs ? { differs: c.differs.count } : {}),
});

/** One line of the summary: 1 new kind of data · 212 new subjects · 60 facts match. */
export const casesLine = (c: MapCases): string | null =>
  MAP_CASES.filter((k) => (c[k] ?? 0) > 0)
    .map((k) => caseWords.count[k](c[k] as number))
    .join(' · ') || null;

/** One thing a layer adds to the map: New moment · Block 465,695,924; the map's newest is block 465,600,000. */
export interface ToMapLine {
  key: MapCase;
  tag: string;
  words: string;
}

/** How many a case holds: its data, its moments, its subjects or its facts; a case with none isn't said. */
const sizeOf = (c: LayerCases, k: MapCase): number => countsOf(c)[k] ?? 0;

export function toMapLines(c: LayerCases): ToMapLine[] {
  return MAP_CASES.filter((k) => sizeOf(c, k) > 0).map((k) => ({
    key: k,
    tag: caseWords.tag[k],
    // each case's words take its own part of the cases
    words: (caseWords.line[k] as (x: unknown) => string)(c[k]),
  }));
}

/** A publication that just landed on the map, as the press hands it to the map's `joined` (MapJoined). */
export interface Joined {
  /** the map it joined */
  map: string;
  /** the publication's name, its hash: the key the map and Information read again on */
  publication: string;
  /** who it's credited to, as the box names them */
  author: string;
  documents: { sha256: string; petal: string; what: string }[];
  /** when it landed, so a second press is a second moment */
  at: number;
}

/** A layer the press would publish, one line, with what it adds to the map. */
export interface LayerLine {
  key: string;
  line: string;
  toMap: ToMapLine[];
}

export const layerLines = (layers: readonly PublishLayer[]): LayerLine[] =>
  layers.map((l) => ({ key: l.sha256, line: l.title, toMap: toMapLines(l.cases) }));

/** What the press hands the map and Information when it lands: which publication, whose, and what it added. */
export function joinedOf(
  map: string,
  author: string,
  layers: readonly PublishLayer[],
  published: PublishedVersion,
  at: number,
): Joined {
  return {
    map,
    publication: published.publication,
    author,
    documents: published.layers.map((l) => ({
      ...l,
      what: layers.find((x) => x.sha256 === l.sha256)?.title ?? l.petal,
    })),
    at,
  };
}

export interface AddsLine {
  key: string;
  line: string;
  goes: boolean;
  /** why it can't go yet, when it can't */
  why: string | null;
}

export interface MappingView {
  heading: string;
  intro: string;
  /** what the press publishes, layer by layer, each with what it adds to the map */
  layers: LayerLine[];
  /** what the person kept that can't go yet, each with why */
  adds: AddsLine[];
  /** said when there's nothing to add, or no map in front */
  empty: string | null;
}

export function mappingView(
  map: string | null,
  name: string | null,
  data: PublishableData | null,
): MappingView {
  const heading = modeWords.heading(name ?? data?.name ?? null);
  const none = { heading, intro: modeWords.intro, layers: [], adds: [] };
  if (!map) return { ...none, empty: modeWords.noMap };
  const layers = layerLines(data?.layers ?? []);
  const adds = (data?.adds ?? [])
    // what goes is in the layers, by what it adds; here, what can't go yet
    .filter((a) => !a.goes)
    .map((a) => ({
      // a layer's kind can come twice, what goes and what stays private (the server's adds)
      key: `${a.layer}:${a.kind}:${a.verb ?? a.label}:stays`,
      line: modeWords.adds(a),
      goes: false,
      why: a.why ?? modeWords.later,
    }));
  const any =
    layers.length > 0 ||
    (data?.ready ?? 0) > 0 ||
    (data?.private.length ?? 0) > 0 ||
    adds.length > 0;
  return { ...none, layers, adds, empty: any ? null : modeWords.nothing };
}

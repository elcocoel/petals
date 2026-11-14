// One press over many maps (manifest/v1, specs/005-mapping-brain/composition.md section 2b): everything a person
// kept on maps across the Power Map goes in one signature, each map as its own version, all at once or none. The
// Mapping box shows it when no single map is in front, in the one-map press's own look (components/PublishPress):
// the press first, with one line of what goes and the true step, then the maps that go and what stays, folded. Pure.

import type { PressAll } from './agent-client.ts';
import { shortId } from './flower-view.ts';
import {
  type PublishPhase,
  type PublishPressView,
  type PublishRow,
  pressRuns,
  publishWords,
  stepOf,
} from './publish-press.ts';

export const pressAllWords = {
  /** the press's title before the read says how much */
  kept: 'What you’ve kept',
  /** what goes, on its own line under the title: one version on each map */
  count: (maps: number, layers: number) =>
    `${maps === 1 ? '1 map' : `${maps} maps`}, ${layers === 1 ? '1 layer' : `${layers} layers`}`,
  press: 'Publish all',
  /** the server's prepare, seconds over many maps */
  preparing: (n: number) => (n === 1 ? 'Preparing 1 version…' : `Preparing ${n} versions…`),
  goes: 'Maps that go',
  stays: 'Stays for now',
  layers: (n: number) => (n === 1 ? '1 layer' : `${n} layers`),
  why: 'Why some maps stay',
  /** while the read runs: it is the press's own dry run, slow over many maps */
  reading: 'Reading what you’ve kept on maps…',
  /** read, and nothing anywhere waits to be published */
  none: 'Nothing you’ve kept on a map waits to be published.',
  /** the read refused, with the server's reason */
  unread: (why: string) => `Couldn’t read what you’ve kept: ${why}`,
  /** what this press published, and what the person's credit counts as theirs, in the credit's own words */
  published: (n: number, all?: { layers: number; maps: number } | null) => {
    const count = (k: number, one: string, many: string) =>
      k === 1 ? `1 ${one}` : `${k.toLocaleString('en-US')} ${many}`;
    const press = `This press: ${count(n, 'version', 'versions')}.`;
    if (!all) return press;
    return `${press} Credited to you: ${count(all.layers, 'layer', 'layers')} on ${count(all.maps, 'map', 'maps')}.`;
  },
} as const;

/** What the person's credit (credit/v1) counts as theirs: their layers, and the maps those layers are on. */
export function inYourName(credit: {
  layers: readonly { map: string }[];
  totals: { layers: number };
}): { layers: number; maps: number } {
  return { layers: credit.totals.layers, maps: new Set(credit.layers.map((l) => l.map)).size };
}

const row = (key: string, name: string, about: string, source: string | null, why: string | null) =>
  ({
    key,
    name,
    address: shortId(about),
    source,
    sourceUrl: null,
    confidence: null,
    why,
  }) satisfies PublishRow;

/** Where the read is: running, refused (with why), or done. */
export type PressAllRead = { reading: true } | { unread: string } | { done: true };

// One card in every state: the same title, the press (waiting when it can't be pressed) and only the step changing.
const line = (step: string, running = false): PublishPressView => ({
  title: pressAllWords.kept,
  count: '',
  press: pressAllWords.press,
  step,
  running,
  sign: publishWords.sign,
  why: null,
  rows: null,
  said: null,
  busy: true,
});

/**
 * The press over many maps as the box shows it. While the read runs, or when it's refused or finds nothing, one
 * line says which, so a slow read never looks like an empty one; a person with nothing never meets a press.
 */
export function pressAllView(
  read: PressAll | null,
  phase: PublishPhase,
  said: string | null,
  /** the press asks the wallet to sign in first (lib/publication-sign.ts asksSignIn) */
  signsIn = false,
  state: PressAllRead = { done: true },
): PublishPressView | null {
  if (phase === 'published')
    return {
      title: pressAllWords.kept,
      count: read
        ? pressAllWords.count(
            read.maps.length,
            read.maps.reduce((n, m) => n + m.layers, 0),
          )
        : '',
      press: pressAllWords.press,
      step: said,
      running: false,
      sign: publishWords.sign,
      why: null,
      rows: null,
      said,
      busy: true,
    };
  if ('reading' in state) return line(pressAllWords.reading, true);
  if ('unread' in state) return line(pressAllWords.unread(state.unread));
  if (!read) return null;
  if (read.maps.length === 0) return line(pressAllWords.none);
  const layers = read.maps.reduce((n, m) => n + m.layers, 0);
  return {
    title: pressAllWords.kept,
    count: pressAllWords.count(read.maps.length, layers),
    press: pressAllWords.press,
    step: stepOf(phase, said, signsIn, pressAllWords.preparing(read.maps.length)),
    running: pressRuns(phase),
    sign: signsIn ? publishWords.signInFirst : publishWords.sign,
    why: read.left.length
      ? { label: pressAllWords.why, lines: read.left.map((l) => `${shortId(l.about)}: ${l.why}`) }
      : null,
    rows: {
      goes: pressAllWords.goes,
      stays: pressAllWords.stays,
      going: read.maps.map((m) =>
        row(m.about, m.name, m.about, pressAllWords.layers(m.layers), null),
      ),
      staying: [],
    },
    said: phase === 'failed' ? said : null,
    busy: pressRuns(phase),
  };
}

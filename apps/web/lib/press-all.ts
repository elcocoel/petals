// One press over many maps (manifest/v1, specs/005-mapping-brain/composition.md section 2b): everything a person
// kept on maps across the Power Map goes in one signature, each map as its own version, all at once or none. The
// Mapping box shows it when no single map is in front, in the one-map press's own look (components/PublishPress):
// the maps that go, each with its layers, then the press, then what stays and why, folded. Pure.

import type { PressAll } from './agent-client.ts';
import { shortId } from './flower-view.ts';
import {
  type PublishPhase,
  type PublishPressView,
  type PublishRow,
  publishWords,
} from './publish-press.ts';

export const pressAllWords = {
  /** over the press: how far one signature reaches */
  across: (n: number) =>
    n === 1
      ? 'What you’ve kept on 1 map goes in one signature.'
      : `What you’ve kept on ${n} maps goes in one signature.`,
  press: 'Publish all in your name',
  goes: 'Maps that go',
  stays: 'Stays for now',
  layers: (n: number) => (n === 1 ? '1 layer' : `${n} layers`),
  why: 'Why some maps stay',
  published: (n: number) =>
    n === 1
      ? 'On the shared map in your name: 1 map.'
      : `On the shared map in your name: ${n} maps.`,
} as const;

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

/**
 * The press over many maps as the box shows it, or null when there's nothing anywhere to publish (a person with
 * nothing never meets a press).
 */
export function pressAllView(
  read: PressAll | null,
  phase: PublishPhase,
  said: string | null,
  /** the press asks the wallet to sign in first (lib/publication-sign.ts asksSignIn) */
  signsIn = false,
): (PublishPressView & { across: string }) | null {
  if (phase === 'published')
    return {
      across: '',
      press: null,
      sign: publishWords.sign,
      why: null,
      rows: null,
      said,
      busy: false,
    };
  if (!read || read.maps.length === 0) return null;
  return {
    across: pressAllWords.across(read.maps.length),
    press: phase === 'signing' ? publishWords.signing : pressAllWords.press,
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
    busy: phase === 'signing',
  };
}

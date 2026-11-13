// Mapping something new is a ceremony: a recognizable state while a new data packet is made that would be
// published in the person's name. Petals' agent explores what's there for free; a fresh read waits for the
// person's yes (the agent's approval_required), and the conversation says so in one card: what will be read,
// who reads it, and that it becomes theirs. Nothing expensive starts until the press. While the read runs,
// the composer says which state the person is in.

import type { FlowerResult, MapShow } from '@petal/core/types';
import { networkLabel, shortId } from './flower-view.ts';
import type { Held, Item } from './thread.ts';

export const ceremonyWords = {
  heading: 'Map something new',
  /** adding to a map that's already there (the agent's existing_map) */
  addTo: (name: string | null) => (name ? `Add to ${name}` : 'Add to this map'),
  cost: (usd: number | null, seconds: number | null) =>
    [
      usd === null ? null : `About $${usd < 0.01 ? usd.toFixed(3) : usd.toFixed(2)}`,
      // a stored-only read says 0: nothing to wait for
      seconds === null || seconds <= 0 ? null : `about ${Math.max(1, Math.round(seconds))} s`,
    ]
      .filter(Boolean)
      .join(', '),
  /** under the map, while the read runs and before it says what it's doing */
  reading: 'Reading…',
  who: "Petals' agent reads it from the chain, on your credit.",
  note: 'It becomes a new data packet in your name.',
  button: 'Map it',
  /** what pressing it says to Petals' agent: a plain yes, as the agent's own question asks */
  yes: 'Yes',
  exploring: 'Exploring',
  creating: 'Creating a new data packet in your name',
} as const;

export interface CeremonyView {
  heading: string;
  /** what will be read: the kind of map, its chain, and what it's of */
  what: string;
  /** its rough cost, where the agent can say one */
  cost?: string;
  who: string;
  note: string;
  button: string;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The card's words for one held read: "Moloch v3 on Gnosis · 0xf02f…e986". */
export function ceremonyView(held: Held): CeremonyView {
  const params = held.params ?? {};
  const chain = typeof params.chain === 'string' && params.chain ? params.chain : null;
  const of = Object.entries(params)
    .filter(([k, v]) => k !== 'chain' && typeof v === 'string' && v)
    .map(([, v]) => shortId(v as string));
  const what = [`${networkLabel(held.network)}${chain ? ` on ${capital(chain)}` : ''}`, ...of].join(
    ' · ',
  );
  const cost = held.cost ? ceremonyWords.cost(held.cost.usd, held.cost.seconds) : '';
  return {
    heading: held.existing_map ? ceremonyWords.addTo(held.name ?? null) : ceremonyWords.heading,
    what: held.what || what,
    ...(cost ? { cost } : {}),
    who: ceremonyWords.who,
    note: ceremonyWords.note,
    button: ceremonyWords.button,
  };
}

/**
 * Creating: the person said yes to a held read, and the turn that reads it is running. Otherwise exploring.
 */
export function creating(items: readonly Item[], busy: boolean): boolean {
  if (!busy) return false;
  const held = items.findLastIndex((x) => x.kind === 'ceremony');
  const said = items.findLastIndex((x) => x.kind === 'user');
  return held >= 0 && said > held;
}

/**
 * A new map being made, from the conversation: the held read the person said yes to, what the run is doing
 * now, and the flower it drew once it has. Read from the thread, so a reload shows the same.
 */
export interface Making {
  held: Held;
  /** the run's latest stage, while it reads */
  doing: string | null;
  /** the flower it drew: it lands on the map */
  flower: FlowerResult | null;
}

export function making(items: readonly Item[], busy: boolean): Making | null {
  const at = items.findLastIndex((x) => x.kind === 'ceremony');
  const said = items.findLastIndex((x) => x.kind === 'user');
  if (at < 0 || said < at) return null;
  const c = items[at];
  if (c?.kind !== 'ceremony') return null;
  const after = items.slice(said + 1);
  const drawn = after.findLast((x) => x.kind === 'flower');
  const flower = drawn?.kind === 'flower' ? drawn.flower : null;
  if (!flower && !busy) return null;
  const stage = after.findLast((x) => x.kind === 'stage' || x.kind === 'progress');
  const doing =
    stage && (stage.kind === 'stage' || stage.kind === 'progress') ? stage.message : null;
  return { held: c.held, doing, flower };
}

/** What the last turn's answer is about on the Power Map (the agent's show), or null. */
export function turnShow(items: readonly Item[]): MapShow | null {
  const said = items.findLastIndex((x) => x.kind === 'user');
  const shown = items.slice(said + 1).findLast((x) => x.kind === 'show');
  return shown?.kind === 'show' ? shown.show : null;
}

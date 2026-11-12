// Mapping something new is a ceremony (Elco, 12 Nov: "there should be a recognizable 'state' of when we are
// creating a new data packet that would get published in my name"). Petals' agent explores what's there
// for free; a fresh read waits for the person's yes (the agent's approval_required), and the conversation
// says so in one card: what will be read, who reads it, and that it becomes theirs. Nothing expensive starts
// until the press. While the read runs, the composer says which state the person is in. Words are drafts.

import { networkLabel, shortId } from './flower-view.ts';
import type { Held, Item } from './thread.ts';

export const ceremonyWords = {
  heading: 'Map something new',
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
  return {
    heading: ceremonyWords.heading,
    what,
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

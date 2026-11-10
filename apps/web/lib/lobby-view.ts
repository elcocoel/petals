// The lobby (specs/004-workspace, W3): where a person's work sits when they come back. A skeleton, built so
// Elco can sense what's needed. Pure: its words and where each thing goes are decided here, and the view
// only lays them out. Every word below is a proposal, listed in design/journey-strings.md, "The lobby".
import { chainLabel, dateLabel, type MapViewRow } from './flower-view.ts';
import type { SocialProfile } from './near-social.ts';
import { type Credit, type PayAction, payWords } from './pay.ts';

export const lobbyWords = {
  /** What a screen reader hears for the page. The menu's words are lib/panel-words.ts's. */
  page: 'Lobby',
  /** The flowers on the shared map, each opening on the canvas. */
  map: 'On the map',
  /** The map with nothing on it yet: what goes there, and how. LOBBY's draft. */
  mapEmpty: 'Nothing on the map yet. A network you map in a conversation shows here.',
} as const;

/**
 * The Balance card (Elco, 9 Nov: the Withdraw button lives in the lobby, "more specifically, profile part of
 * it"; 10 Nov, the redo's frame: "Build it"): the credit the person holds, in NEAR, and taking everything
 * out of the contract while it holds something. Drafts, shipped on Elco's word ("ship drafts, change later").
 */
export const fundsWords = {
  title: 'Balance',
  unit: 'NEAR',
  /** Under the amount: what it is. LOBBY's draft. */
  note: 'Credit for Petals’ agent, at today’s price.',
  /** The credit or NEAR's price couldn't be read. LOBBY's draft. */
  unread: 'Your balance can’t be read right now.',
  /** Elco's draft. */
  withdraw: 'Withdraw',
  waiting: payWords.paying,
  /** Elco's draft, with the amount that came out. */
  withdrew: (near: string) => `Withdrew ${near} NEAR.`,
  /** LOBBY's draft, after the pay step's own. */
  failed: "That withdrawal didn't go through. Try again.",
} as const;

/**
 * The person at the top of the page, and the Public profile card (Elco, 9 and 10 Nov: "a profile area";
 * the redo's frame, "Build it"). The card is the account's profile on NEAR Social, whose links are its own
 * declaration, so their badge says only that. LOBBY's drafts.
 */
export const profileWords = {
  /** The badges beside the account: the chain it's on, and whether it has a public profile. */
  chain: 'NEAR',
  social: 'NEAR Social',
  noSocial: 'No public profile',
  title: 'Public profile',
  edit: 'Edit',
  /** A link's badge: the account says so; nobody checked it. */
  declared: 'Declared',
  /** Under the profile: who sees it, and what the links are. */
  note: 'Anyone can see this, in any app that reads NEAR Social. Links are what you declare; nobody checks them.',
  /** No profile there yet: what goes there, and the one thing to do. */
  none: 'You don’t have a public profile yet. Make one here: a name, a picture, a short bio and your links.',
  create: 'Create your public profile',
  noneNote: 'It’s your NEAR Social profile, so other NEAR apps show it too.',
  /** Still reading it. */
  reading: 'Reading your public profile from NEAR Social…',
  /** NEAR Social didn't answer. */
  unread: "NEAR Social didn't answer, so your public profile isn't shown.",
} as const;

/** The profile part's NEAR Social state: still reading, a profile, none there, or no answer. */
export type SocialState =
  | { kind: 'reading' }
  | { kind: 'profile'; profile: SocialProfile }
  | { kind: 'none' }
  | { kind: 'unread' };

/**
 * An account as the profile part shows it, and in full for the pointer: a 64-character implicit account
 * shortened to its first six and last four, as /make does; a named account as it is.
 */
export function shownAccount(account: string): { shown: string; full: string } {
  return {
    shown: account.replace(/^([0-9a-f]{6})[0-9a-f]{54}([0-9a-f]{4})$/, '$1…$2'),
    full: account,
  };
}

/** The credit as GET and POST /api/v1/pay answer it with the contract: with what it holds, in yoctoNEAR. */
export type HeldCredit = Credit & { balance_yocto?: string };

/** Where the withdrawal is: offered, waiting for the wallet, done, or it didn't go through. */
export type WithdrawPhase = 'ready' | 'withdrawing' | 'withdrew' | 'failed';

/** What the wallet sends: everything the person holds in the contract (no amount), with the 1 yoctoNEAR it asks. */
export const WITHDRAW_ALL: PayAction = {
  type: 'FunctionCall',
  params: { methodName: 'withdraw', args: {}, gas: '30000000000000', deposit: '1' },
};

const YOCTO_PER_HUNDREDTH = 10n ** 22n;

/** yoctoNEAR as NEAR to two places, rounded to the nearest hundredth, in whole numbers all the way. */
export function nearOf(yocto: string): string {
  const hundredths = (BigInt(yocto) + YOCTO_PER_HUNDREDTH / 2n) / YOCTO_PER_HUNDREDTH;
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, '0')}`;
}

/** Withdraw is there while the contract holds something to take out. */
export const canWithdraw = (held: string): boolean => BigInt(held) > 0n;

/** What came out between two balances, as NEAR to two places. */
export function withdrawn(before: string, after: string): string {
  const out = BigInt(before) - BigInt(after);
  return nearOf((out > 0n ? out : 0n).toString());
}

/** A view on the one shared map as the lobby shows it: the gallery's tile, opening where the view lives. */
export interface MapTile {
  key: string;
  title: string;
  where: string;
  badge: string;
  image: string;
  href: string;
}

/**
 * Every view on the one shared map (Elco, 10 Nov), in the order GET /api/v1/map/views lists them, the
 * oldest first, with its picture as SYSTEMS draws it. A tile opens the view where it lives.
 */
export function mapTiles(views: readonly MapViewRow[]): MapTile[] {
  return views.map((v) => ({
    key: v.sha,
    title: v.name ?? v.title,
    // what it maps, in the map's own words (SYSTEMS, 07f5936)
    where: `${v.about}   /   ${dateLabel(v.as_of)}`,
    // the chain it's on, as the landing's tiles say it
    badge: chainLabel(v.chain),
    image: v.picture,
    href: v.view_url,
  }));
}

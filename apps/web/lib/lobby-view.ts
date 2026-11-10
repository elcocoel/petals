// The lobby (specs/004-workspace, W3): where a person's work sits when they come back. A skeleton, built so
// Elco can sense what's needed. Pure: its words and where each thing goes are decided here, and the view
// only lays them out. Every word below is a proposal, listed in design/journey-strings.md, "The lobby".
import { chainLabel, dateLabel, type MapViewRow, networkLabel } from './flower-view.ts';
import type { SocialProfile } from './near-social.ts';
import { type Credit, type PayAction, payWords } from './pay.ts';

export const lobbyWords = {
  /** What a screen reader hears for the page and for the menu. */
  page: 'Lobby',
  menu: 'Your work',
  /** The menu's bar, and the way to a new conversation: the words the workspace's list box already uses. */
  conversations: 'Conversations',
  newConversation: 'New',
  /** Where folders go once SYSTEMS has them (W4). Not shown until one exists (minimally-good rule 1). */
  folders: 'Folders',
  /** The menu's list with nothing in it yet: what goes there and what to do (rule 2). A draft. */
  noConversations: 'No conversations yet. Press New to start one.',
  /** The flowers on the shared map, each opening on the canvas. */
  map: 'On the map',
  /** The map with nothing on it yet: what goes there, and how. LOBBY's draft. */
  mapEmpty: 'Nothing on the map yet. A network you map in a conversation shows here.',
  /** Folding the menu away, and bringing it back. */
  fold: 'Hide',
  unfold: 'Menu',
} as const;

/**
 * The profile part's money (Elco, 9 Nov: the Withdraw button lives in the lobby, "more specifically,
 * profile part of it"): what the person holds in the credit contract, and taking all of it out. Drafts,
 * shipped on Elco's word ("ship drafts, change later"). Waiting for the wallet is the pay step's own draft.
 */
export const fundsWords = {
  /** Elco's draft. */
  withdraw: 'Withdraw',
  waiting: payWords.paying,
  /** Elco's draft, with the amount that came out. */
  withdrew: (near: string) => `Withdrew ${near} NEAR.`,
  /** LOBBY's draft, after the pay step's own. */
  failed: "That withdrawal didn't go through. Try again.",
} as const;

/**
 * The profile part (Elco, 9 Nov: "a profile area"; 10 Nov: "minimally good"): its title, the wallet the
 * person signed in with, and their public profile from NEAR Social, whose links are the account's own
 * declaration, so their label says only that. 'Profile' is Elco's word; the rest are LOBBY's drafts.
 */
export const profileWords = {
  title: 'Profile',
  declared: 'Declared on NEAR Social',
  /** One declared link: the service as NEAR Social names it, and what the account wrote there. */
  link: (service: string, value: string) => `${service} ${value}`,
  /** No profile there yet: what would show, and where to make one. */
  none: 'No NEAR Social profile yet. Make one there, and its name, picture and links show here.',
  open: 'Open NEAR Social',
  /** NEAR Social didn't answer. */
  unread: "NEAR Social didn't answer, so your profile from there isn't shown.",
} as const;

/** Where a person makes or edits their NEAR Social profile. */
export const NEAR_SOCIAL_SITE = 'https://near.social/';

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
    where: `${networkLabel(v.network)}   /   ${dateLabel(v.as_of)}`,
    // the chain it's on, as the landing's tiles say it
    badge: chainLabel(v.chain),
    image: v.picture,
    href: v.view_url,
  }));
}

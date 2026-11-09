// The lobby (specs/004-workspace, W3): where a person's work sits when they come back. A skeleton, built so
// Elco can sense what's needed. Pure: its words and where each thing goes are decided here, and the view
// only lays them out. Every word below is a proposal, listed in design/journey-strings.md, "The lobby".
import { dateLabel, type ListedFlower, networkLabel } from './flower-view.ts';
import { type Credit, type PayAction, payWords } from './pay.ts';

export const lobbyWords = {
  /** What a screen reader hears for the page and for the menu. */
  page: 'Lobby',
  menu: 'Your work',
  /** The menu's bar, and the way to a new conversation: the words the workspace's list box already uses. */
  conversations: 'Conversations',
  newConversation: 'New',
  /** Where folders go once SYSTEMS has them (W4). Until then the space is there with nothing in it. */
  folders: 'Folders',
  /** The flowers on the shared map, each opening on the canvas. */
  map: 'On the map',
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
  /** What a screen reader hears for the profile part. Elco's word. */
  profile: 'Profile',
  /** The balance in the contract. */
  held: (near: string) => `${near} NEAR`,
  /** Elco's draft. */
  withdraw: 'Withdraw',
  waiting: payWords.paying,
  /** Elco's draft, with the amount that came out. */
  withdrew: (near: string) => `Withdrew ${near} NEAR.`,
  /** LOBBY's draft, after the pay step's own. */
  failed: "That withdrawal didn't go through. Try again.",
} as const;

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

/** A flower on the map as the lobby shows it: the gallery's tile, opening in the workspace. */
export interface MapTile {
  key: string;
  title: string;
  where: string;
  badge: string;
  image: string;
  href: string;
}

/** In the order the API lists them. A tile opens the flower on the canvas, as a stored flower. */
export function mapTiles(flowers: readonly ListedFlower[]): MapTile[] {
  return flowers.map((f) => ({
    key: `${f.where}:${f.id}`,
    title: f.title ?? f.id,
    // the gallery's own line and badge, so a flower reads the same in both
    where: `${networkLabel(f.network)}   /   ${dateLabel(f.as_of)}`,
    badge: f.where === 'map' ? 'on NEAR' : 'fixture',
    image: `/api/v1/flowers/${encodeURIComponent(f.id)}/svg`,
    href: `/make?stored=${encodeURIComponent(f.id)}`,
  }));
}

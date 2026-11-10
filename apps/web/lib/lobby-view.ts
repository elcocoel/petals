// The lobby (specs/004-workspace, W3): where a person's work sits when they come back. A skeleton, built so
// Elco can sense what's needed. Pure: its words and where each thing goes are decided here, and the view
// only lays them out. Every word below is a proposal, listed in design/journey-strings.md, "The lobby".
import type { ProfileDraft, SocialProfile } from './near-social.ts';
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
  /** No profile there yet, while the editor is off. */
  noneYet: 'You don’t have a public profile yet.',
  /** No profile there yet: what goes there, and the one thing to do. */
  none: 'You don’t have a public profile yet. Make one here: a name, a picture, a short bio and your links.',
  create: 'Create your public profile',
  noneNote: 'It’s your NEAR Social profile, so other NEAR apps show it too.',
  /** Still reading it. */
  reading: 'Reading your public profile from NEAR Social…',
  /** NEAR Social didn't answer. */
  unread: "NEAR Social didn't answer, so your public profile isn't shown.",
} as const;

/**
 * The public profile's editor (Elco, 10 Nov: people create and edit their NEAR Social profile inside
 * Petals; it says plainly that it changes the shared public profile and that old versions stay public).
 * LOBBY's drafts, from the Figma frame Elco approved.
 */
export const editorWords = {
  edit: 'Edit your public profile',
  create: 'Create your public profile',
  picture: 'Picture',
  choose: 'Choose a picture',
  pictureNote: 'A square picture. It’s stored in public, with your profile.',
  name: 'Name',
  about: 'Bio',
  links: 'Links',
  service: 'Service',
  handle: 'Handle or address',
  remove: 'Remove',
  addLink: 'Add a link',
  preview: 'Preview: how any app that reads NEAR Social shows it',
  publishingAs: 'Publishing as',
  publicNote:
    'This changes your public profile on NEAR Social, which other NEAR apps show too. Earlier versions stay public: every change is kept on NEAR.',
  walletNote: 'Your wallet approves it. A new picture is one more approval.',
  publish: 'Publish to NEAR Social',
  cancel: 'Cancel',
  /** The button while it works, step by step. */
  picturing: 'Your wallet: the picture first…',
  storing: 'Storing the picture…',
  signing: 'Waiting for your wallet…',
  checking: 'Checking NEAR Social has it…',
  saved: 'Saved',
  savedLine: 'Your public profile is updated, here and in other NEAR apps.',
  notSaved: 'Not saved',
  refused: 'Your wallet didn’t send it, so nothing changed.',
  rejected: (why: string) => `NEAR Social didn’t take it, so nothing changed: ${why}.`,
  slow: 'NEAR Social hasn’t confirmed it yet. Look again in a minute.',
  otherWallet: (wallet: string, account: string) =>
    `Your wallet is on ${wallet}. Switch it to ${account} to publish.`,
  tryAgain: 'Try again',
} as const;

/**
 * Edit and Create, on or off (META's go, 10 Nov): off until the testnet lab (/lab/social) has passed and
 * Elco's own run on mainnet is set, since publishing writes the real public profile. Then this goes true.
 */
export const PROFILE_EDITING = false;

/** Where publishing is. */
export type EditPhase =
  | 'editing'
  | 'picturing'
  | 'storing'
  | 'signing'
  | 'checking'
  | 'saved'
  | 'failed';

/** The phases in which the editor waits and nothing can be changed. */
export const busyPhase = (p: EditPhase) =>
  p === 'picturing' || p === 'storing' || p === 'signing' || p === 'checking';

/** The editor as its view shows it (components/workspace/ProfileEditor.tsx). */
export interface ProfileEditorView {
  /** No public profile yet: this makes the first. */
  creating: boolean;
  /** The account that publishes, as shown, and in full. */
  account: { shown: string; full: string };
  draft: ProfileDraft;
  /** The picture shown: the one chosen, or the one there now. */
  picture: string | null;
  phase: EditPhase;
  /** Why the last try didn't go through, in a person's words. */
  problem: string | null;
  setName: (v: string) => void;
  setAbout: (v: string) => void;
  setLink: (i: number, part: 'service' | 'value', v: string) => void;
  addLink: () => void;
  removeLink: (i: number) => void;
  choosePicture: (file: File) => void;
  publish: () => void;
  cancel: () => void;
}

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

/** A map as the lobby lists it: lib/maps.ts's mapTile, as the Power Map's, with its card's id as its key. */
export interface MapTile {
  key: string;
  title: string;
  where: string;
  badge: string;
  image: string;
  href: string;
}

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
  /** NEAR beside the dollars, at today's price. */
  near: (amount: string) => `${amount} NEAR`,
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
 * The person at the top of the page, and the Profile card (Elco, 9 and 10 Nov; the redo's frame, "Build
 * it"; and "hold the same data shape as near.social in our DB ... and have a publish button"): the
 * profile is kept in Petals, in NEAR Social's shape, and goes onto NEAR Social only when it's published.
 * Its links are the account's own declaration, so their badge says only that. LOBBY's drafts.
 */
export const profileWords = {
  /** The badges beside the account: the chain it's on, and where its profile is. */
  chain: 'NEAR',
  social: 'NEAR Social',
  inPetals: 'In Petals',
  noProfile: 'No profile',
  title: 'Profile',
  edit: 'Edit',
  /** A link's badge: the account says so; nobody checked it. */
  declared: 'Declared',
  /** Under a profile kept in Petals: who sees it. */
  notePetals: 'Kept in Petals, for you only. Links are what you declare; nobody checks them.',
  /** Under the account's NEAR Social profile, before Petals keeps a copy. */
  noteSocial:
    'This is your profile on NEAR Social, which anyone can see. Edit it here and Petals keeps your copy. Links are what you declare; nobody checks them.',
  /** No profile anywhere yet: what goes there, and the one thing to do. */
  none: 'You don’t have a profile yet. Make one here: a name, a picture, a short bio and your links.',
  create: 'Create your profile',
  /** Still reading it. */
  reading: 'Reading your profile…',
  /** Petals didn't answer. */
  unread: "Your profile couldn't be read right now.",
} as const;

/**
 * The profile's editor (Elco, 10 Nov): it saves into Petals, which costs nothing; Publish is its own
 * button, which puts the profile on NEAR Social, and stays off until it's set up on mainnet, so the line
 * beside it says so. LOBBY's drafts, from the Figma frame Elco approved.
 */
export const editorWords = {
  edit: 'Edit your profile',
  create: 'Create your profile',
  picture: 'Picture',
  choose: 'Choose a picture',
  pictureNote: 'A square picture, kept with your profile.',
  name: 'Name',
  about: 'Bio',
  links: 'Links',
  service: 'Service',
  handle: 'Handle or address',
  remove: 'Remove',
  addLink: 'Add a link',
  preview: 'Preview: how it shows',
  /** The link's service, before one is picked. */
  pick: 'Pick one',
  /**
   * Where it's kept, said once, under the buttons (the walk, 11 Nov: it was said four times): with Publish
   * off, and with it on.
   */
  keptNote:
    'Save keeps it in Petals, for you only, and costs nothing. Publishing it to NEAR Social, where anyone can see it, comes later.',
  publicNote:
    'Save keeps it in Petals, for you only. Publish puts it on NEAR Social, where anyone can see it, and earlier versions stay public there.',
  save: 'Save',
  saving: 'Saving…',
  publish: 'Publish to NEAR Social',
  cancel: 'Cancel',
  /** Publishing, step by step, once it's on. */
  picturing: 'Your wallet: the picture first…',
  storing: 'Storing the picture…',
  signing: 'Waiting for your wallet…',
  checking: 'Checking NEAR Social has it…',
  saved: 'Saved',
  savedLine: 'Saved in Petals.',
  /** After Publish went through: NEAR Social has it (Elco, 12 Nov: "make sure that we are connected to near
   * social that it's not test net anymore"). */
  published: 'Published',
  publishedLine: 'On NEAR Social now, where anyone can see it.',
  notSaved: 'Not saved',
  notKept: (why: string) => `Petals didn’t keep it: ${why}`,
  refused: 'Your wallet didn’t send it, so nothing changed.',
  rejected: (why: string) => `NEAR Social didn’t take it, so nothing changed: ${why}.`,
  slow: 'NEAR Social hasn’t confirmed it yet. Look again in a minute.',
  otherWallet: (wallet: string, account: string) =>
    `Your wallet is on ${wallet}. Switch it to ${account} to publish.`,
  tryAgain: 'Try again',
} as const;

/**
 * Publish to NEAR Social, on or off (Elco, 10 Nov: "test look and feel for free and then rig to mainnet
 * effortlessly later"): on since 12 Nov, on mainnet (Elco: "make sure that we are connected to near social
 * that it's not test net anymore"), the person's own wallet signing each write.
 */
export const PUBLISH_TO_NEAR_SOCIAL = true;

/** Where saving or publishing is. */
export type EditPhase =
  | 'editing'
  | 'saving'
  | 'picturing'
  | 'storing'
  | 'signing'
  | 'checking'
  | 'failed';

/** The phases in which the editor waits and nothing can be changed. */
export const busyPhase = (p: EditPhase) => p !== 'editing' && p !== 'failed';

/** The editor as its view shows it (components/workspace/ProfileEditor.tsx). */
export interface ProfileEditorView {
  /** No profile yet: this makes the first. */
  creating: boolean;
  /** The account it's kept for and would publish as, as shown, and in full. */
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
  save: () => void;
  /** Publishing to NEAR Social; absent while it's off. */
  publish?: () => void;
  cancel: () => void;
}

/**
 * The profile the page shows: still reading, a profile (Petals' copy, or the account's NEAR Social profile
 * before Petals keeps one), none anywhere, or no answer.
 */
export type SocialState =
  | { kind: 'reading' }
  | { kind: 'profile'; profile: SocialProfile; source: 'petals' | 'near-social' }
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

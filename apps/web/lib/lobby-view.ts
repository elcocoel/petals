// The lobby (specs/004-workspace, W3): where a person's work sits when they come back. A skeleton. Pure: its
// words and where each thing goes are decided here, and the view only lays them out.
import type { ProfileDraft, SocialProfile } from './near-social.ts';
import { type Credit, type PayAction, payWords } from './pay.ts';

export const lobbyWords = {
  /** What a screen reader hears for the page. The menu's words are lib/panel-words.ts's. */
  page: 'Lobby',
  /** The flowers on the shared map, each opening on the canvas. */
  map: 'On the map',
  /** The map with nothing on it yet: what goes there, and how. */
  mapEmpty: 'Nothing on the map yet. A network you map in a conversation shows here.',
  /** Signing out, in the account menu: the one way out of the account. */
  disconnect: 'Disconnect',
  /** The account menu, top right: what a screen reader hears for its button and its list. */
  account: 'Your account',
  /** The account menu's way to the profile's editor. */
  editProfile: 'Edit profile',
  /** The page's bands, each named as the landing names its sections. */
  balance: 'Balance',
  work: 'Your work',
} as const;

/**
 * The Balance card (the Withdraw button lives in the lobby, by the profile): the credit the person holds, in
 * NEAR, and taking everything out of the contract while it holds something.
 */
export const fundsWords = {
  title: 'Balance',
  /** NEAR beside the dollars, at today's price. */
  near: (amount: string) => `${amount} NEAR`,
  /** Under the amount: what it is. */
  note: 'Credit for Petals’ agent, at today’s price.',
  /** The credit or NEAR's price couldn't be read. */
  unread: 'Your balance can’t be read right now.',
  withdraw: 'Withdraw',
  /** Opens the pay row's own flow under the balance: NEAR from a wallet, or any token through NEAR Intents. */
  add: 'Add funds',
  /** Folds it away again. */
  closeAdd: 'Close',
  waiting: payWords.paying,
  /** With the amount that came out. */
  withdrew: (near: string) => `Withdrew ${near} NEAR.`,
  /** After the pay step's own. */
  failed: "That withdrawal didn't go through. Try again.",
} as const;

/**
 * The person at the top of the page, and the Profile card, with a Publish button: the profile is kept in
 * Petals, in NEAR Social's shape, and goes onto NEAR Social only when it's published.
 * Its links are the account's own declaration, so their badge says only that.
 */
export const profileWords = {
  /** The badges beside the account where its profile is (the chain's badge is its name, lib/profile-view.ts). */
  social: 'NEAR Social',
  inPetals: 'In Petals',
  noProfile: 'No profile',
  title: 'Profile',
  edit: 'Edit',
  /** A link's badge: the account says so; nobody checked it. */
  declared: 'Declared',
  /** Under a profile set on Petals, for a person with no NEAR account: where it is. */
  notePetals:
    'Your profile on Petals. Add a NEAR wallet to have it on NEAR Social too. Links are what you declare; nobody checks them.',
  /** Under the account's NEAR Social profile: it's the one profile, edited here or anywhere else. */
  noteSocial:
    'Your profile on NEAR Social, which anyone can see. Edit it here and it changes there. Links are what you declare; nobody checks them.',
  /** No profile anywhere yet: what goes there, and the one thing to do. */
  none: 'You don’t have a profile yet. Make one here: a name, a picture, a short bio and your links.',
  create: 'Create your profile',
  /** Still reading it. */
  reading: 'Reading your profile…',
  /** Petals didn't answer. */
  unread: "Your profile couldn't be read right now.",
} as const;

/**
 * The profile's editor: it saves into Petals, which costs nothing; Publish is its own
 * button, which puts the profile on NEAR Social, and stays off until it's set up on mainnet, so the line
 * beside it says so.
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
  /** Where Save puts it, said once, under the buttons: with a NEAR account, NEAR Social. */
  socialNote:
    'Save puts it on NEAR Social, where anyone can see it: your NEAR wallet signs it and pays its small fee. Earlier versions stay public there.',
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
  savedLine: 'Saved on Petals.',
  /** After Publish went through: NEAR Social has it, on mainnet. */
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
  /** Signed in with an Ethereum or Solana wallet and no NEAR wallet added: where Save puts it, and why. */
  needsNear:
    'Save keeps it on Petals. NEAR Social is on NEAR, so having it there needs a NEAR wallet: add one in Wallets.',
  goToWallets: 'Go to Wallets',
} as const;

/**
 * Publish to NEAR Social, on or off, so the look can be tried for free before mainnet: on, on mainnet, the
 * person's own wallet signing each write.
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

/**
 * The NEAR account a profile is published as: the account signed in, when it's a NEAR one; otherwise the
 * person's first NEAR wallet added in Wallets; or none.
 */
export function nearAccountOf(
  signedIn: { network: string; account: string } | null,
  wallets: readonly { network: string; account_id: string }[],
): string | null {
  if (signedIn && (signedIn.network === 'mainnet' || signedIn.network === 'testnet'))
    return signedIn.account;
  return wallets.find((w) => w.network === 'mainnet')?.account_id ?? null;
}

/** The phases in which the editor waits and nothing can be changed. */
export const busyPhase = (p: EditPhase) => p !== 'editing' && p !== 'failed';

/** The editor as its view shows it (components/workspace/ProfileEditor.tsx). */
export interface ProfileEditorView {
  /** No profile yet: this makes the first. */
  creating: boolean;
  /** The account it's kept for and would publish as, as shown, and in full. */
  account: { shown: string; full: string };
  /**
   * Publishing to NEAR Social needs a NEAR account: someone signed in with an Ethereum or
   * Solana wallet and no NEAR wallet added yet; the editor says so and leads them to Wallets.
   */
  needsNearWallet: boolean;
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
  /** The one Save: onto NEAR Social with a NEAR account, kept on Petals without one. */
  save: () => void;
  /** Save goes onto NEAR Social: the person's NEAR wallet signs it and pays its fee. */
  onSocial: boolean;
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

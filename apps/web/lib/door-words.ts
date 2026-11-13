// The words for connecting a wallet, in one place, so changing one is one line here.

export const doorWords = {
  // The landing's and the navbar's word for the same thing (Connect, never Ask).
  connect: 'Connect',
  disconnect: 'Disconnect',
  /** Leaves the account and connects again, with whichever wallet the person picks next. */
  switchWallet: 'Switch wallet',
  badSignature: "That signature didn't work. Connect your wallet again.",
  /** a wallet the person said no in, by its name */
  declined: (wallet: string) => `${wallet} declined.`,
  nearDidntAnswer: "NEAR didn't answer. Try again.",
} as const;

/**
 * /make for someone not signed in. The copy button's words are the setup prompt's own (lib/landing-copy.ts).
 */
export const notSignedInWords = {
  title: 'Oops, you’re not logged in.',
  body: 'Connect a NEAR wallet to talk to Petals’ agent.',
  /** the way in: an account starts with a NEAR wallet */
  near: 'Connect a NEAR wallet',
  /** after it, quieter: an Ethereum or Solana wallet the person linked in their lobby signs in too */
  linked: 'A wallet you’ve linked also signs you in:',
  evm: 'Ethereum',
  solana: 'Solana',
  /** before the quieter way in, the setup prompt for the person's own agent */
  noWallet: 'No wallet yet?',
} as const;

// The words for connecting a wallet, in one place, so changing one is one line here. They're the "Proposed"
// column of design/journey-strings.md, which Elco hasn't approved: for Test 1, they say so if they're wrong.

export const doorWords = {
  // The landing's and the navbar's word for the same thing (Elco, 9 Nov: Connect, never Ask).
  connect: 'Connect',
  disconnect: 'Disconnect',
  badSignature: "That signature didn't work. Connect your wallet again.",
  nearDidntAnswer: "NEAR didn't answer. Try again.",
} as const;

/**
 * /make for someone not signed in (Elco, 11 Nov, #78: "a oops, your no logged in"): drafts for Elco, listed in
 * design/journey-strings.md. The copy button's words are the setup prompt's own (lib/landing-copy.ts).
 */
export const notSignedInWords = {
  title: 'Oops, you’re not logged in.',
  body: 'Connect a NEAR wallet to talk to Petals’ agent.',
  /** before the quieter way in, the setup prompt for the person's own agent */
  noWallet: 'No wallet yet?',
} as const;

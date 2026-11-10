// The words for connecting a wallet, in one place, so changing one is one line here. They're the "Proposed"
// column of design/journey-strings.md, which Elco hasn't approved: for Test 1, they say so if they're wrong.

export const doorWords = {
  // The landing's and the navbar's word for the same thing (Elco, 9 Nov: Connect, never Ask).
  connect: 'Connect',
  disconnect: 'Disconnect',
  badSignature: "That signature didn't work. Connect your wallet again.",
  nearDidntAnswer: "NEAR didn't answer. Try again.",
} as const;

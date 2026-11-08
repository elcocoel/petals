// The words for connecting a wallet, in one place, so changing one is one line here. They're the "Proposed"
// column of design/journey-strings.md, which Elco hasn't approved: for Test 1, they say so if they're wrong.

export const doorWords = {
  connect: 'Connect wallet',
  disconnect: 'Disconnect',
  ownAgent: 'Use your own agent',
  badSignature: "That signature didn't work. Connect your wallet again.",
  nearDidntAnswer: "NEAR didn't answer. Try again.",
  // Proposed 8 Nov for a site that runs no agent for visitors (design/journey-strings.md, "The front door").
  connectAgent: 'Connect your agent',
  // Proposed by LOOK, 8 Nov, after Elco: "it doesn't say what this is" (design/journey-strings.md).
  pasteIt:
    "Petals doesn't run an agent for you. Your own agent does the mapping: Claude Code, Codex, Hermes or any other. Copy this into it, and its conversation shows up here as it happens.",
  // Already on /connect.
  copyPrompt: 'Copy this prompt',
  otherWays: 'Other ways in',
} as const;

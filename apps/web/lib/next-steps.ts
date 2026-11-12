// What the agent offers next on /make, under its short reading of what's there (Elco, 12 Nov evening: "making this
// agent a great navigator of the data that's already there and helping me use all the functions of the brain"):
// a few steps that drive the map ('show the blocs', 'what it paid out', 'compare with…'), and the brain's services
// as one-press options under More. WORKSPACE builds them from SYSTEMS's events and binds each press; NextSteps
// draws them (OVERLAYS). Pure.

/** One step, one press. */
export interface NextStep {
  key: string;
  /** what it does, in a person's words */
  label: string;
  /** one quiet line under it: what it reads, or what it costs */
  says?: string | undefined;
  /** it's running now */
  busy?: boolean | undefined;
  onPress: () => void;
}

/** Drafts. */
export const nextStepWords = {
  label: 'Next steps',
  more: (n: number) => `More it can do · ${n}`,
  working: 'Working on it',
} as const;

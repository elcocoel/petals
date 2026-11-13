// What the agent offers next on /make, under its short reading of what's there, so it navigates the data already
// there and helps the person use all the brain's functions:
// a few steps that drive the map ('show the blocs', 'what it paid out', 'compare with…'), and the brain's services
// as one-press options under More. The workspace builds them from the server's events and binds each press;
// NextSteps draws them. Pure.

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

export const nextStepWords = {
  label: 'Next steps',
  more: (n: number) => `More it can do · ${n}`,
  working: 'Working on it',
} as const;

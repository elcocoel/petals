// The terminal in the page (specs/004-workspace, W10; Elco, 9 Nov: "that seems to be what we wanted all
// along"). A person's own agent runs in a terminal on their own computer, under the Petals helper
// (`node ~/.petals/petal.mjs terminal`, CONNECTORS's), and the page shows that terminal in a floating box.
// Nothing passes through Petals' server. Pure: the helper's address, what the page sends, and how it reads
// the helper's control frames. The seam is CONNECTORS's, 9 Nov; the words are proposals
// (design/journey-strings.md, "The terminal in the page").

/** Where the helper listens. Only on the person's own computer. */
export const HELPER_PORT = 7466;
export const helperUrl = (port: number = HELPER_PORT) => `ws://127.0.0.1:${port}/pty`;

export interface TermSize {
  cols: number;
  rows: number;
}

/** How the page proves itself: the one-use code the helper printed, or the token it gave back. */
export type Pass = { pair: string } | { token: string };

/** The first frame: who's asking, and how big the terminal is, so the agent starts at that size. */
export const helloFrame = (pass: Pass, size: TermSize) =>
  JSON.stringify({ ...pass, cols: size.cols, rows: size.rows });

/** A text frame that is exactly this resizes; any other text is keystrokes. */
export const resizeFrame = (size: TermSize) =>
  JSON.stringify({ resize: { cols: size.cols, rows: size.rows } });

/** What a control frame from the helper says. Output comes as bytes, never through here. */
export type FromHelper =
  | { kind: 'paired'; token: string; agent: string }
  | { kind: 'exit'; code: number }
  | { kind: 'refused'; why: string };

export function readControl(text: string): FromHelper | null {
  let m: unknown;
  try {
    m = JSON.parse(text);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  if (o.paired === true && typeof o.token === 'string') {
    return { kind: 'paired', token: o.token, agent: typeof o.agent === 'string' ? o.agent : '' };
  }
  if (typeof o.exit === 'number') return { kind: 'exit', code: o.exit };
  if (typeof o.error === 'string') return { kind: 'refused', why: o.error };
  return null;
}

/** A code as people type it: any case, with or without its dash or spaces. K7QM-3WTZ. */
export function pairingCode(typed: string): string {
  const bare = typed.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return bare.length === 8 ? `${bare.slice(0, 4)}-${bare.slice(4)}` : bare;
}

export type TermPhase = 'pair' | 'connecting' | 'open' | 'ended';

export const terminalWords = {
  /** The box's bar, and what a screen reader hears. */
  box: 'Terminal',
  /** Before it's paired, or after the helper stopped. */
  start: 'Start the Petals helper on this computer, then enter the code it shows.',
  command: 'node ~/.petals/petal.mjs terminal',
  code: 'Pairing code',
  connect: 'Connect',
  /** Nothing answered on this computer. */
  noHelper: "The Petals helper isn't running on this computer.",
  /** The helper answered and said no. */
  refused: "That code didn't work. The helper prints a new one each time it starts.",
  ended: 'Your agent has stopped. Connect again to start it.',
} as const;

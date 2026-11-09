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

/**
 * The first frame: the one-use code the helper printed, and how big the terminal is, so the agent starts
 * at that size. Every session takes a fresh code, so the person sees and approves each pairing (Elco).
 */
export const helloFrame = (pair: string, size: TermSize, exploration: string | null = null) =>
  JSON.stringify({
    pair,
    cols: size.cols,
    rows: size.rows,
    // the page's conversation, as a continue link on the site: the agent writes its notes and flowers there
    ...(exploration ? { exploration } : {}),
  });

/** The page on a conversation of the person's, with the helper's code kept in the fragment. */
export function terminalAddress(path: string, conversation: string, pair: string, port: number) {
  const fragment = `pair=${encodeURIComponent(pair)}${port === HELPER_PORT ? '' : `&port=${port}`}`;
  return `${path}?terminal=1&elsewhere=${encodeURIComponent(conversation)}#${fragment}`;
}

/** A text frame that is exactly this resizes; any other text is keystrokes. */
export const resizeFrame = (size: TermSize) =>
  JSON.stringify({ resize: { cols: size.cols, rows: size.rows } });

/** What a control frame from the helper says. Output comes as bytes, never through here. */
export type FromHelper =
  | { kind: 'paired'; agent: string }
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
  if (o.paired === true)
    return { kind: 'paired', agent: typeof o.agent === 'string' ? o.agent : '' };
  if (typeof o.exit === 'number') return { kind: 'exit', code: o.exit };
  if (typeof o.error === 'string') return { kind: 'refused', why: o.error };
  return null;
}

/**
 * What the helper put in the address it opened (`/make?terminal=1#pair=K7QM-3WTZ`, with `&port=7499` only
 * when it isn't on 7466), so the page connects with nothing typed. A fragment never reaches any server.
 * Null when there's no code.
 */
export function pairFromHash(hash: string): { code: string; port: number } | null {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const given = q.get('pair');
  const code = given ? pairingCode(given) : '';
  if (!code) return null;
  const port = Number(q.get('port'));
  return { code, port: Number.isInteger(port) && port > 0 && port < 65536 ? port : HELPER_PORT };
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
  /** Before it's paired. The command under it is the helper's own (lib/agent-prompt.ts). */
  start:
    'Paste this into Terminal on this computer and press Return. It gets the Petals helper, which opens this page again, connected.',
  copy: 'Copy the command',
  orCode: 'Or type the code it shows here.',
  code: 'Pairing code',
  connect: 'Connect',
  /** Nothing answered: no helper, or another page already has it. */
  noHelper: "The Petals helper didn't answer. Start it, or close the other page that's using it.",
  /** The helper answered and said no. */
  refused: "That code didn't work. Enter the newest code the helper shows.",
  ended: 'Your agent has stopped. Enter the next code the helper shows to start it again.',
  /** The conversation the page starts for the agent: its first words in the list, and where it happens. */
  conversation: 'A conversation in your terminal',
  client: 'your terminal',
} as const;

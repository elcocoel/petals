// Pairing the page with the Petals helper on the person's own computer (specs/004-workspace, W10): the
// one-use code, the one-click petals:// start, the codes the helper puts in the address, and the page's own
// conversation for the agent. The helper is CONNECTORS's; the chat it serves is lib/agent-chat.ts. Nothing
// passes through Petals' server. Pure. The words are proposals (design/journey-strings.md).

/** Where the helper listens. Only on the person's own computer. */
export const HELPER_PORT = 7466;
/**
 * One click (CONNECTORS's Petals Helper.app, 9 Nov): once the first paste has put the app on the person's
 * Mac, it claims petals:// links. The page makes up the code, opens this, and connects with the same code
 * while the app starts the helper. A web page can't start a program, so the first time is still a paste.
 */
export function startLink(code: string, agent = 'claude', port: number = HELPER_PORT): string {
  const q = new URLSearchParams({ code, agent });
  if (port !== HELPER_PORT) q.set('port', String(port));
  return `petals://start?${q.toString()}`;
}

/** How long the page keeps trying while the app starts the helper, and how often. Then: not installed. */
export const START_WAIT_MS = 5000;
export const START_RETRY_MS = 500;

/** A code of the page's own: 20 letters and digits, from random bytes, which the app's rule takes. */
export function codeFrom(bytes: Uint8Array): string {
  const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return [...bytes].map((b) => ALPHA[b % ALPHA.length]).join('');
}

/** The agents the helper can start, as the person knows them. */
export const AGENTS = [
  { id: 'claude', name: 'Claude Code' },
  { id: 'codex', name: 'Codex' },
  { id: 'hermes', name: 'Hermes' },
] as const;
export type AgentId = (typeof AGENTS)[number]['id'];

/** The page asked, before a reload onto a new conversation, to start this agent once it's back. */
export function startFromHash(hash: string): AgentId | null {
  const asked = new URLSearchParams(hash.replace(/^#/, '')).get('start');
  return AGENTS.find((a) => a.id === asked)?.id ?? null;
}

/** The page on a new conversation of the person's, asking to start the agent once it has reloaded. */
export function startAddress(path: string, conversation: string, agent: AgentId) {
  return `${path}?terminal=1&elsewhere=${encodeURIComponent(conversation)}#start=${agent}`;
}

/** The page on a conversation of the person's, with the helper's code kept in the fragment. */
export function terminalAddress(path: string, conversation: string, pair: string, port: number) {
  const fragment = `pair=${encodeURIComponent(pair)}${port === HELPER_PORT ? '' : `&port=${port}`}`;
  return `${path}?terminal=1&elsewhere=${encodeURIComponent(conversation)}#${fragment}`;
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
  /** The one click, once Petals Helper is on this computer. */
  startButton: 'Start your agent',
  /** The first time on a computer: the paste that sets up the helper. The command is lib/agent-prompt.ts's. */
  start:
    'First time on this computer? Paste this into Terminal once and press Return. It sets up the Petals helper and opens this page again, connected.',
  /** Start was pressed and nothing answered: the app isn't on this computer yet. */
  notInstalled: "Petals Helper isn't on this computer yet. Paste the command below once.",
  copy: 'Copy the command',
  orCode: 'Or type the code it shows here.',
  code: 'Pairing code',
  connect: 'Connect',
  /** Nothing answered: no helper, or another page already has it. */
  noHelper: "The Petals helper didn't answer. Start it, or close the other page that's using it.",
  /** The helper answered and said no. */
  refused: "That code didn't work. Enter the newest code the helper shows.",
  /** The conversation the page starts for the agent: its first words in the list, and where it happens. */
  conversation: 'A conversation in your terminal',
  client: 'your terminal',
} as const;

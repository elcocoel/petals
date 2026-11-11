// A conversation happening in another agent: what its exploration says, as a person reads it here. Only
// what that agent saved reaches us (its steps and notes), never what it said to the person. Pure, so a
// read now and a push later show the same thing.
import type { Spec } from '@petal/core/types';
import { workerName } from './jobs.ts';
import { parseMarkdown } from './markdown.ts';
import type { PanelFlower } from './panel-view.ts';
import type { Row } from './thread-view.ts';

/** What the view needs from GET /api/v1/explorations/:ref (design/journey-api-map.md). */
export interface ElsewherePacket {
  question: string;
  current: { spec_sha256: string; spec: Spec; short_url: string } | null;
  steps: { note: string | null; at: string }[];
  notes: { text: string; at: string }[];
  /** the app at the other end, in this server's memory: null after a restart or if it never said */
  presence?: {
    client: string | null;
    /** the worker's place among its agent's workers: 2 is "Codex 2" */
    n?: number | null;
    last_at: string;
    last_tool: string | null;
  } | null;
}

export type ElsewhereRead = { packet: ElsewherePacket } | { failed: string };

/** An exploration's own id. Anything else in the address is a link's token. */
export const isOwnId = (ref: string) => ref.startsWith('exp_');

/** When the agent's own name hasn't reached us. "mcp" isn't a word a person uses. */
export const WHERE = 'your own agent';

/** The name the agent's app gave, as the side panel names its workers ("Codex 2"), for "with <name>". */
export function whereOf(read: ElsewhereRead | null): string {
  const presence = read && 'packet' in read ? read.packet.presence : null;
  return presence?.client ? workerName(presence.client, presence.n) : WHERE;
}

const speakerOf = (read: ElsewhereRead) => {
  const name = whereOf(read);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
};

/**
 * Drafts. Work from another door goes on in that app, not in this page's box: the thread says so where it
 * ends, and the box for a message isn't shown (Elco, 10 Nov: no dead Send, no "happening" that isn't).
 */
export const elsewhereWords = {
  goesOn: (who: string) =>
    `This conversation is with ${who}, so it goes on there, not here. To talk to Petals' agent, start a new conversation.`,
} as const;

/** The question, then what the agent wrote, oldest first, then where it goes on. */
export function elsewhereRows(read: ElsewhereRead | null): Row[] {
  if (!read) return [];
  if ('failed' in read) return [{ kind: 'error', key: 'failed', text: read.failed }];
  const { question, steps, notes } = read.packet;
  const said = [
    ...steps.flatMap((s) => (s.note ? [{ text: s.note, at: s.at }] : [])),
    ...notes.map((n) => ({ text: n.text, at: n.at })),
  ].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return [
    { kind: 'user', key: 'question', text: question, label: 'Original question' },
    ...said.map(
      (s, i): Row => ({
        kind: 'message',
        key: `said-${i}`,
        blocks: parseMarkdown(s.text, new Set()),
        foreign: true,
        // the agent's name goes where it starts speaking
        ...(i === 0 ? { speaker: speakerOf(read) } : {}),
      }),
    ),
    { kind: 'note', key: 'goes-on', text: elsewhereWords.goesOn(whereOf(read)) },
  ];
}

/** Its newest flower, for the canvas and the panel. It arrives without the reading a chat here writes. */
export function elsewhereFlower(packet: ElsewherePacket | null): PanelFlower | null {
  const current = packet?.current;
  if (!current) return null;
  return {
    key: current.spec_sha256,
    spec: current.spec,
    legend: [],
    interpretation: null,
    signature: null,
    checks: '',
    viewUrl: current.short_url,
    earlier: false,
  };
}

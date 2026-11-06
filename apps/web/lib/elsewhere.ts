// A conversation happening in another agent: what its exploration says, as a person reads it here. Only
// what that agent saved reaches us (its steps and notes), never what it said to the person. Pure, so a
// read now and a push later show the same thing.
import type { Spec } from '@petal/core/types';
import { parseMarkdown } from './markdown.ts';
import type { PanelFlower } from './panel-view.ts';
import type { Row } from './thread-view.ts';

/** What the view needs from GET /api/v1/explorations/:ref (design/journey-api-map.md). */
export interface ElsewherePacket {
  question: string;
  current: { spec_sha256: string; spec: Spec; short_url: string } | null;
  steps: { note: string | null; at: string }[];
  notes: { text: string; at: string }[];
}

export type ElsewhereRead = { packet: ElsewherePacket } | { failed: string };

/** Until the agent's own name reaches us (CONNECTORS). "mcp" isn't a word a person uses. */
export const WHERE = 'your own agent';

/** The question, then what the agent wrote, oldest first. */
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
        ...(i === 0 ? { speaker: 'Your own agent' } : {}),
      }),
    ),
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

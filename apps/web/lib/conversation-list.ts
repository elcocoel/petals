// The list of a person's conversations as they read it. Pure, so a row's words and where it goes are
// decided here and the view only lays them out.
import { readAbout } from './ask-about.ts';
import { WHERE } from './elsewhere.ts';
import { dateLabel } from './flower-view.ts';

/** What the list needs from GET /api/v1/conversations (design/workspace-data.md). */
export interface ListedConversation {
  id: string;
  /** null: work from another door, with no run here */
  run_id: string | null;
  title: string;
  status: string;
  updated_at: string;
}

export interface ConversationRow {
  key: string;
  title: string;
  sub: string;
  href: string;
  current: boolean;
}

const capital = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

/**
 * Newest first, as the server sends them. Work from another door has no run here, so it opens as what it
 * is: a conversation happening somewhere else.
 */
export function conversationRows(
  listed: readonly ListedConversation[],
  open: { runId: string | null; elsewhere?: string | undefined },
): ConversationRow[] {
  return listed.map((c) => {
    // a first question asked about a flower carries that at its start, for the model
    const title = readAbout(c.title).words;
    if (!c.run_id) {
      return {
        key: c.id,
        title,
        sub: `${capital(WHERE)}  ·  ${dateLabel(c.updated_at)}`,
        href: `/make?elsewhere=${encodeURIComponent(c.id)}`,
        current: c.id === open.elsewhere,
      };
    }
    return {
      key: c.id,
      title,
      sub: c.status === 'running' ? 'Working…' : dateLabel(c.updated_at),
      href: `/make?run=${encodeURIComponent(c.run_id)}`,
      current: c.run_id === open.runId,
    };
  });
}

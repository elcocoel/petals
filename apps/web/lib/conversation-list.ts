// The list of a person's conversations as they read it. Pure, so a row's words and where it goes are
// decided here and the view only lays them out.
import { readAbout } from './ask-about.ts';
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

/**
 * Newest first, as the server sends them. Work from another door has no run to open, so it waits for the
 * page that follows it (design/interaction-surface.md, item 5).
 */
export function conversationRows(
  listed: readonly ListedConversation[],
  runId: string | null,
): ConversationRow[] {
  return listed.flatMap((c) =>
    c.run_id
      ? [
          {
            key: c.id,
            // a first question asked about a flower carries that at its start, for the model
            title: readAbout(c.title).words,
            sub: c.status === 'running' ? 'Working…' : dateLabel(c.updated_at),
            href: `/make?run=${encodeURIComponent(c.run_id)}`,
            current: c.run_id === runId,
          },
        ]
      : [],
  );
}

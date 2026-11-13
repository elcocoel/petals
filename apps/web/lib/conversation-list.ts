// The list of a person's conversations as they read it in the side panel. Pure, so a row's words and
// where it goes are decided here and the view only lays them out. A row is one line, so each reads for what
// it is: its title, who it's with as an icon, and when it last moved, short, as other agent tools say it.
import { readAbout } from './ask-about.ts';
import { MONTHS } from './flower-view.ts';

/** What the list needs from GET /api/v1/conversations. */
export interface ListedConversation {
  id: string;
  /** null: work from another door, with no run here */
  run_id: string | null;
  title: string;
  status: string;
  updated_at: string;
  /** The project (the server's folder) it sits in, or null for none. */
  folder?: string | null;
}

export interface ConversationRow {
  key: string;
  title: string;
  /** Who it's with: Petals' agent on the page, or the person's own agent, from another door. */
  by: 'petals' | 'own';
  /** When it last moved: now, 12m, 3h, 2d, then the date. */
  when: string;
  working: boolean;
  /** The project it sits in, or null. */
  project: string | null;
  href: string;
  current: boolean;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long ago, in a few characters: now, 12m, 3h, 2d, then 9 Nov, or 9 Nov 2025 in another year. */
export function shortWhen(iso: string, now: Date): string {
  const at = new Date(iso);
  const ago = now.getTime() - at.getTime();
  if (Number.isNaN(ago)) return '';
  if (ago < MINUTE) return 'now';
  if (ago < HOUR) return `${Math.floor(ago / MINUTE)}m`;
  if (ago < DAY) return `${Math.floor(ago / HOUR)}h`;
  if (ago < 7 * DAY) return `${Math.floor(ago / DAY)}d`;
  const day = `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`;
  return at.getUTCFullYear() === now.getUTCFullYear() ? day : `${day} ${at.getUTCFullYear()}`;
}

/**
 * Newest first, as the server sends them. Work from another door has no run here, so it opens as what it
 * is: a conversation happening somewhere else.
 */
export function conversationRows(
  listed: readonly ListedConversation[],
  open: { runId: string | null; elsewhere?: string | undefined },
  now: Date = new Date(),
): ConversationRow[] {
  return listed.map((c) => {
    // a first question asked about a flower carries that at its start, for the model
    const title = readAbout(c.title).words;
    const shared = {
      key: c.id,
      title,
      when: shortWhen(c.updated_at, now),
      working: c.status === 'running',
      project: c.folder ?? null,
    };
    if (!c.run_id) {
      return {
        ...shared,
        by: 'own',
        href: `/make?elsewhere=${encodeURIComponent(c.id)}`,
        current: c.id === open.elsewhere,
      };
    }
    return {
      ...shared,
      by: 'petals',
      href: `/make?run=${encodeURIComponent(c.run_id)}`,
      current: c.run_id === open.runId,
    };
  });
}

/** A conversation as its menu's actions need it: its key, its title, and where it is. */
export interface RowRef {
  key: string;
  title: string;
  project: string | null;
  current: boolean;
}

/** A project as GET /api/v1/folders lists it: the server's folder, flat, each with its parent. */
export interface ListedProject {
  id: string;
  name: string;
  parent: string | null;
  position: number;
}

/** A project in the panel, with its conversations, newest first. */
export interface ProjectRow {
  key: string;
  name: string;
  rows: ConversationRow[];
}

/**
 * The panel's two lists: the person's projects, each holding its conversations, in the person's order,
 * and the conversations in none. A project is one level, an umbrella over conversations, so a folder the
 * server holds inside another counts as the one at the top.
 */
export function byProject(
  rows: readonly ConversationRow[],
  listed: readonly ListedProject[],
): { projects: ProjectRow[]; loose: ConversationRow[] } {
  const parentOf = new Map(listed.map((p) => [p.id, p.parent]));
  const topOf = (id: string): string => {
    let at = id;
    const seen = new Set<string>();
    for (let up = parentOf.get(at); up && !seen.has(up); up = parentOf.get(at)) {
      seen.add(at);
      at = up;
    }
    return at;
  };
  const tops = listed
    .filter((p) => p.parent === null)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  const held = new Map<string, ConversationRow[]>(tops.map((p) => [p.id, []]));
  const loose: ConversationRow[] = [];
  for (const row of rows) {
    const into =
      row.project && parentOf.has(row.project) ? held.get(topOf(row.project)) : undefined;
    if (into) into.push(row);
    else loose.push(row);
  }
  return {
    projects: tops.map((p) => ({ key: p.id, name: p.name, rows: held.get(p.id) ?? [] })),
    loose,
  };
}

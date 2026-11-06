// What the address holds, so a reload brings back the panel as well as the thread.
//   /make?run=<id>           the thread, with its newest flower open
//   &flower=<n>              an earlier flower of the thread (from 0)
//   &stored=<id>             a stored flower
//   &shelf=1                 the shelf, with the thread's flowers closed
//   &petal=<account>         the selected petal
//   &q=<words>               a question that came with the link and waits in the box, until the server
//                            accepts one. It stays because it has to survive leaving and coming back.
import type { Opened } from './thread.ts';

export function workspaceUrl(v: {
  runId: string | null;
  open: Opened;
  petal: string | null;
  asked?: string | null;
}): string | null {
  const q = new URLSearchParams();
  if (v.runId) q.set('run', v.runId);
  if (v.open.kind === 'turn') q.set('flower', String(v.open.index));
  if (v.open.kind === 'stored') q.set('stored', v.open.id);
  if (v.open.kind === 'shelf') q.set('shelf', '1');
  if (v.petal) q.set('petal', v.petal);
  // Alone it says nothing new: the address it came in already holds it.
  if (!q.toString()) return null;
  if (v.asked) q.set('q', v.asked);
  return `/make?${q.toString()}`;
}

type Param = string | string[] | undefined;
const one = (p: Param) => (Array.isArray(p) ? p[0] : p);

export function openFromParams(q: Record<string, Param>): {
  open: Opened;
  petal: string | null;
} {
  const stored = one(q.stored);
  const flower = one(q.flower);
  const index = flower === undefined ? Number.NaN : Number(flower);
  const open: Opened = stored
    ? { kind: 'stored', id: stored }
    : one(q.shelf)
      ? { kind: 'shelf' }
      : Number.isInteger(index) && index >= 0
        ? { kind: 'turn', index }
        : { kind: 'latest' };
  return { open, petal: one(q.petal) ?? null };
}

/**
 * The words a link brought for the box, or null: an empty ask box arrives as ?q=. A form sends a
 * textarea's line ends as CRLF, and the box and the backup compare what they hold, so they're made one.
 */
export function questionFromParams(q: Record<string, Param>): string | null {
  const words = one(q.q)?.replace(/\r\n?/g, '\n').trim();
  return words ? words : null;
}

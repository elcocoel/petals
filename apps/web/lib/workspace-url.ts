// What the address holds, so a reload brings back the panel as well as the thread. The page it's on is
// its own business: `base` is /make unless a surface says otherwise, and may carry that surface's options.
//   /make?run=<id>           the thread, with its newest flower open
//   &flower=<n>              an earlier flower of the thread (from 0)
//   &stored=<id>             a stored flower
//   &shelf=1                 the shelf, with the thread's flowers closed
//   &petal=<account>         the selected petal
import type { Opened } from './thread.ts';

export const WORKSPACE_BASE = '/make';

export function workspaceUrl(v: {
  runId: string | null;
  open: Opened;
  petal: string | null;
  base?: string | undefined;
}): string | null {
  const q = new URLSearchParams();
  if (v.runId) q.set('run', v.runId);
  if (v.open.kind === 'turn') q.set('flower', String(v.open.index));
  if (v.open.kind === 'stored') q.set('stored', v.open.id);
  if (v.open.kind === 'shelf') q.set('shelf', '1');
  if (v.petal) q.set('petal', v.petal);
  const text = q.toString();
  const base = v.base ?? WORKSPACE_BASE;
  return text ? `${base}${base.includes('?') ? '&' : '?'}${text}` : null;
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

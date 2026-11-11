// The viewer's view (one-source.md, step 2; Elco, 10 Nov: "I'm basically choosing the glasses through which I
// see the entire universe"): every drawing on this server is drawn through a view, never through a flower's
// own choices, which are only the record of what its agent proposed. A person keeps theirs (me-routes.ts in
// @petal/agent); a picture's address names the view it's drawn with by its whole hash.
import { DEFAULT_VIEW, DEFAULT_VIEW_V1, FORMER_DEFAULTS, viewHash } from '@petal/core';
import type { View } from '@petal/core/types';
import { privateStore } from './drafts.ts';
import type { ToolContext } from './types.ts';

const DEFAULT_HASH = viewHash(DEFAULT_VIEW);
/** The default before labels (view/v1): addresses made before view/v2 carry its hash, and it draws the same. */
const DEFAULT_V1_HASH = viewHash(DEFAULT_VIEW_V1);
const HASH = /^[0-9a-f]{64}$/;

/** A view by its whole hash: the default's (today's, or a former one's) without anyone keeping it, or one kept. */
export async function viewByHash(ctx: ToolContext, hash: string): Promise<View | null> {
  if (hash === DEFAULT_HASH) return DEFAULT_VIEW;
  const former = FORMER_DEFAULTS.get(hash);
  if (former) return former;
  if (!HASH.test(hash)) return null;
  const row = await privateStore(ctx.config).viewDoc.get(hash);
  return row ? (JSON.parse(row.body) as View) : null;
}

/** A person's view, or the default for nobody and for anyone who hasn't kept one. */
export async function viewOfPerson(ctx: ToolContext, person: string | null): Promise<View> {
  if (!person?.startsWith('prs_')) return DEFAULT_VIEW;
  const row = await privateStore(ctx.config).personView.get(person);
  return (row && (await viewByHash(ctx, row.view))) ?? DEFAULT_VIEW;
}

/**
 * The view an address asks for with `?view=`: none is the default. Twelve characters of the v1 default's
 * hash, as picture addresses named it before they carried the whole hash, are still the default. Null: no
 * such view.
 */
export async function viewAsked(ctx: ToolContext, asked: string | undefined): Promise<View | null> {
  if (asked === undefined || asked === '') return DEFAULT_VIEW;
  if (/^[0-9a-f]{12}$/.test(asked) && DEFAULT_V1_HASH.startsWith(asked)) return DEFAULT_VIEW_V1;
  return viewByHash(ctx, asked);
}

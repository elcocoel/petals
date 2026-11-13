// Petals' open-calls feed, keyless first:
// each source's open calls read keyless and kept as calls/v1, a source's replaced as a whole on each read,
// so a call no longer open leaves. A source that doesn't answer keeps what it had. The server serves them
// from the store (list_calls, GET /api/v1/calls and its RSS), so no visitor's request makes it read the web.
//   container exec petals node /app/scripts/read-calls.ts [--dry]
import { type Call, validateCall } from '@petal/core';
import {
  committeeCalls,
  defaultPool,
  type Fetch,
  FORUMS,
  forumCalls,
  INFRASTRUCTURE_COMMITTEE,
  karmaCalls,
  type RpcPool,
  type SnapshotSpace,
  snapshotCalls,
} from '@petal/inputs';
import { privateStore } from './drafts.ts';
import { proposalsOf } from './proposals.ts';
import type { ToolContext } from './types.ts';

export interface CallsRead {
  sources: { name: string; calls: number; kept: boolean; failed: string | null }[];
}

/** Every source's open calls read now, checked, and kept when `save`. */
export async function readCalls(
  ctx: ToolContext,
  o: {
    save: boolean;
    fetch?: Fetch;
    pool?: RpcPool;
    now?: () => Date;
    /** between a forum's searches (forumCalls); tests pass 0 */
    pauseMs?: number;
    log?: (line: string) => void;
  } = {
    save: false,
  },
): Promise<CallsRead> {
  const fetchImpl = o.fetch ?? ((...a: Parameters<Fetch>) => globalThis.fetch(...a));
  const readAt = (o.now?.() ?? new Date()).toISOString();
  const readers: [string, () => Promise<Call[]>][] = [
    ['karma', () => karmaCalls(fetchImpl, readAt)],
    [INFRASTRUCTURE_COMMITTEE, () => committeeCalls(o.pool ?? defaultPool(), readAt)],
    ['snapshot', async () => snapshotCalls(fetchImpl, await snapshotSpaces(ctx), readAt)],
    // each forum its own source, so one that doesn't answer keeps its calls
    ...FORUMS.map((f): [string, () => Promise<Call[]>] => [
      new URL(f.base).host,
      () => forumCalls(fetchImpl, f, readAt, o.pauseMs),
    ]),
  ];
  const out: CallsRead = { sources: [] };
  for (const [name, read] of readers) {
    let calls: Call[];
    try {
      calls = (await read()).filter((c) => validateCall(c).ok);
    } catch (e) {
      out.sources.push({ name, calls: 0, kept: false, failed: (e as Error).message });
      o.log?.(`${name}: not read (${(e as Error).message}); its calls kept stay as they were`);
      continue;
    }
    if (o.save)
      await privateStore(ctx.config).openCall.replace(
        name,
        calls.map((c) => ({
          id: c.id,
          // one form for every source, so the text sorts as time
          closes: c.closes ? new Date(c.closes).toISOString() : null,
          body: JSON.stringify(c),
          read_at: readAt,
        })),
      );
    out.sources.push({ name, calls: calls.length, kept: o.save, failed: null });
    o.log?.(`${name}: ${calls.length} open calls${o.save ? ', kept' : ''}`);
  }
  return out;
}

/** The Snapshot spaces Petals' maps vote in, from their kept proposals (proposals/v2's snapshot:<space>). */
export async function snapshotSpaces(ctx: ToolContext): Promise<SnapshotSpace[]> {
  const out: SnapshotSpace[] = [];
  for (const [about, p] of await proposalsOf(ctx)) {
    const contract = (p.source as { kind?: string; contract?: string }).contract ?? '';
    if (contract.startsWith('snapshot:'))
      out.push({ space: contract.slice('snapshot:'.length), about });
  }
  return out;
}

/** The open calls kept, as stored and valid, closing soonest first, the ones with no deadline last. */
export async function callsOf(ctx: ToolContext): Promise<Call[]> {
  const out: Call[] = [];
  for (const r of await privateStore(ctx.config).openCall.list()) {
    const v = validateCall(JSON.parse(r.body));
    if (v.ok) out.push(v.value);
  }
  return out;
}

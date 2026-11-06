// Server only. What a page holding the conversation needs before the first paint: whether a model is
// answering, what's on the shelf, what its address asked to bring back (lib/workspace-url.ts), and the
// flower that stands on the canvas until the conversation draws its own.
import type { Entry } from '@petal/core/types';
import type { DrawnReading } from './agent-client.ts';
import { api, post } from './api.ts';
import type { ApiHealth } from './api-label.ts';
import type { Catalogue } from './composer-options.ts';
import type { ListedFlower } from './flower-view.ts';
import { openingMessage } from './opening.ts';
import type { CanvasFlower } from './panel-view.ts';
import { openFromParams, questionFromParams } from './workspace-url.ts';

/**
 * Kept, because an entry's id is its content, so its reading can't change, and because this runs on every
 * page load: these calls have no address, so all of a server's pages share one limit of tool calls.
 */
let kept: { id: string; flower: CanvasFlower } | null = null;

/**
 * The first flower the API lists, which is the first one the agent's opening names. Only a picture until
 * someone chooses it: it isn't opened, so it adds no row to the thread and changes no question. No flower,
 * or an API that can't give one, is empty ground.
 */
async function standInFlower(flowers: ListedFlower[]): Promise<CanvasFlower | null> {
  const first = flowers[0];
  if (!first) return null;
  if (kept?.id === first.id) return kept.flower;
  try {
    const stored = await api<{ entry: Entry }>(`/api/v1/flowers/${encodeURIComponent(first.id)}`);
    if (!stored.ok) return null;
    const { spec, spec_sha256: key } = stored.value.entry;
    const drawn = await post<{ reading?: DrawnReading }>('/api/v1/render', {
      spec,
      include_reading: true,
    });
    if (!drawn.ok || !drawn.value.reading) return null;
    const { title, petals } = drawn.value.reading;
    const flower = { key, reading: { title, petals }, stored: first.id };
    kept = { id: first.id, flower };
    return flower;
  } catch {
    return null;
  }
}

export async function workspaceHome(q: Record<string, string | string[] | undefined>) {
  const run = Array.isArray(q.run) ? q.run[0] : q.run;
  const elsewhere = Array.isArray(q.elsewhere) ? q.elsewhere[0] : q.elsewhere;
  const [health, listed, catalogue] = await Promise.all([
    api<ApiHealth>('/api/v1/health'),
    api<{ flowers: ListedFlower[] }>('/api/v1/flowers'),
    api<Catalogue>('/api/v1/catalogue'),
  ]);
  const recorded = health.ok && health.value.llm === 'recorded';
  const flowers = listed.ok ? listed.value.flowers : [];
  const { open, petal } = openFromParams(q);
  return {
    initialRun: run,
    initialElsewhere: elsewhere,
    catalogue: catalogue.ok ? catalogue.value : null,
    initialQuestion: questionFromParams(q),
    recorded,
    opening: openingMessage(flowers),
    shelf: flowers,
    initialOpen: open,
    initialPetal: petal,
    standIn: await standInFlower(flowers),
  };
}

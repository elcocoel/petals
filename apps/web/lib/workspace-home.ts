// Server only. What a page holding the conversation needs before the first paint: whether a model is
// answering, what's on the shelf, and what its address asked to bring back (lib/workspace-url.ts). Nothing
// stands on the canvas until the conversation draws its own flower (Elco, 8 Nov: no flower hard-coded in).
import { api } from './api.ts';
import type { ApiHealth } from './api-label.ts';
import type { Catalogue } from './composer-options.ts';
import { mapList } from './maps.ts';
import { firstCases, openingMessage } from './opening.ts';
import { openFromParams, questionFromParams } from './workspace-url.ts';

export async function workspaceHome(q: Record<string, string | string[] | undefined>) {
  const run = Array.isArray(q.run) ? q.run[0] : q.run;
  const elsewhere = Array.isArray(q.elsewhere) ? q.elsewhere[0] : q.elsewhere;
  const [health, catalogue, map] = await Promise.all([
    api<ApiHealth>('/api/v1/health'),
    api<Catalogue>('/api/v1/catalogue'),
    mapList(),
  ]);
  const recorded = health.ok && health.value.llm === 'recorded';
  // One map per address (Elco, 10 Nov): the first message and the shelf offer the same maps.
  const maps = map.ok ? map.value.maps : [];
  const { open, petal } = openFromParams(q);
  return {
    initialRun: run,
    initialElsewhere: elsewhere,
    catalogue: catalogue.ok ? catalogue.value : null,
    initialQuestion: questionFromParams(q),
    recorded,
    opening: openingMessage(maps),
    shelf: firstCases(maps),
    initialOpen: open,
    initialPetal: petal,
  };
}
